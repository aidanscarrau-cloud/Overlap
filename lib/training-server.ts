import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sendToWorker, workerConfigured } from "./video-server";
import { veoSlug, veoVideo } from "./veo";

/* Training clips for Overlap's own event-spotting model, from teams whose club admin has agreed
 * (teams.training_opt_in). Run from the daily job: sends the worker the matches that have new tags. */

const PER_RUN = 5;

/** A video address the worker may read clips from: a public Veo match or a direct video file.
 *  YouTube is skipped (its terms don't allow downloading). */
async function clipSource(url: string): Promise<string | null> {
  const slug = veoSlug(url);
  if (slug) {
    const v = await veoVideo(slug);
    return v.ok ? v.url : null;
  }
  return /^https:\/\/\S+\.(mp4|m4v|mov|webm)(\?\S*)?$/i.test(url) ? url : null;
}

export async function queueTraining(db: SupabaseClient, site: string) {
  if (!workerConfigured()) return { training: "worker not set up" };
  const { data: teams } = await db.from("teams").select("id,club_id").eq("training_opt_in", true).eq("match_ai", true);
  if (!teams?.length) return { training: 0 };
  const { data: matches } = await db.from("matches").select("id,team_id,club_id").in("team_id", teams.map((t) => t.id));
  let sent = 0;
  for (const m of matches ?? []) {
    if (sent >= PER_RUN) break;
    const { data: ev } = await db.from("match_events").select("id,t,t_end,kind,outcome,team,created_at").eq("match_id", m.id).order("created_at", { ascending: false }).limit(400);
    if (!ev?.length) continue;
    const { data: done } = await db.from("training_exports").select("exported_at").eq("match_id", m.id).maybeSingle();
    if (done && done.exported_at >= ev[0].created_at) continue; // nothing new since last time
    const { data: v } = await db.from("match_videos").select("url").eq("match_id", m.id).maybeSingle();
    const url = v?.url ? await clipSource(v.url as string) : null;
    if (!url) continue;
    try {
      await sendToWorker({
        kind: "dataset",
        job_id: m.id,
        club_id: m.club_id,
        match_id: m.id,
        video_url: url,
        callback_url: `${site}/api/training/callback`,
        events: ev.map(({ created_at, ...e }) => (void created_at, e)),
      });
      await db.from("training_exports").upsert({ match_id: m.id, club_id: m.club_id, status: "sent", exported_at: new Date().toISOString(), message: "" }, { onConflict: "match_id" });
      sent++;
    } catch (e) {
      console.error("training job:", e);
    }
  }
  return { training: sent };
}
