import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push-server";
import { sendToWorker, workerConfigured } from "@/lib/video-server";

// A club admin stops a team sharing training clips: switch it off and delete that team's clips.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { team_id } = (await request.json().catch(() => ({}))) as { team_id?: string };
  // Runs as the admin: the database only lets club admins change this.
  const { data: team, error } = await supabase.from("teams").update({ training_opt_in: false }).eq("id", String(team_id ?? "")).select("id,club_id").maybeSingle();
  if (error || !team) return NextResponse.json({ ok: false, error: error?.message ?? "Only club admins can change this." });
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." });
  const { data: ms } = await db.from("matches").select("id").eq("team_id", team.id);
  const ids = (ms ?? []).map((m) => m.id as string);
  if (ids.length && workerConfigured()) {
    const site = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    try {
      await sendToWorker({ kind: "withdraw", job_id: team.id, club_id: team.club_id, match_ids: ids, callback_url: `${site}/api/training/callback` });
    } catch (e) {
      console.error("withdraw:", e);
      return NextResponse.json({ ok: false, error: "Switched off, but the clips couldn't be deleted yet. Try again later." });
    }
  }
  if (ids.length) await db.from("training_exports").delete().in("match_id", ids);
  return NextResponse.json({ ok: true });
}
