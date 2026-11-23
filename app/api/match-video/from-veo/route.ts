import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push-server";
import { MAX_BYTES, sendToWorker, workerConfigured } from "@/lib/video-server";
import { veoSlug, veoVideo } from "@/lib/veo";

// Analyse a publicly shared Veo match straight from its link: no download or upload needed.
// The worker fetches the video from Veo; Overlap never stores it.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { match_id?: string };
  const matchId = String(body.match_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return NextResponse.json({ ok: false, error: "Match not found." });
  const { data: allowed } = await supabase.rpc("match_review_ok", { mid: matchId });
  if (!allowed) return NextResponse.json({ ok: false, error: "Only this team's coaching staff can analyse match video, once a club admin has switched match review on." });
  if (!workerConfigured()) return NextResponse.json({ ok: false, error: "The video analysis service isn't set up on the server yet." });

  const { data: v } = await supabase.from("match_videos").select("url").eq("match_id", matchId).maybeSingle();
  const slug = v?.url ? veoSlug(v.url) : null;
  if (!slug) return NextResponse.json({ ok: false, error: "Save a Veo match link (app.veo.co/matches/…) above first." });
  const found = await veoVideo(slug);
  if (!found.ok) return NextResponse.json({ ok: false, error: found.error });
  if (found.size > MAX_BYTES) return NextResponse.json({ ok: false, error: "That video is over 10 GB." });

  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." });
  const { data: busy } = await db.from("match_video_jobs").select("id").eq("match_id", matchId).in("status", ["queued", "processing"]).limit(1);
  if (busy?.length) return NextResponse.json({ ok: false, error: "This match's video is already being analysed." });
  // Earlier finished or failed runs for this match make way for the new one.
  await db.from("match_video_jobs").delete().eq("match_id", matchId).in("status", ["done", "failed", "cancelled"]);
  const { data: job, error } = await db
    .from("match_video_jobs")
    .insert({ match_id: matchId, status: "queued", file_name: `Veo: ${found.title}`.slice(0, 200), file_size: found.size, video_deleted: true, created_by: auth.user.id, message: "Waiting for the analysis to start" })
    .select("id")
    .single();
  if (error || !job) return NextResponse.json({ ok: false, error: error?.message ?? "Couldn't start." });
  const site = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  try {
    await sendToWorker({ job_id: job.id, video_url: found.url, callback_url: `${site}/api/match-video/callback` });
  } catch (e) {
    console.error("video worker:", e);
    await db.from("match_video_jobs").update({ status: "failed", message: "The analysis service didn't respond. Try again later." }).eq("id", job.id);
    return NextResponse.json({ ok: false, error: "The analysis service didn't respond. Try again later." });
  }
  return NextResponse.json({ ok: true });
}
