import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push-server";
import { sendToWorker, workerConfigured } from "@/lib/video-server";
import { LIBRARY } from "@/lib/library-drills";

/** A plain colour name for a shirt colour, so the AI can match it to what it sees. */
function colourName(hex: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return "";
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b),
    l = (max + min) / 2;
  if (l < 0.2) return "black/very dark";
  if (l > 0.85) return "white";
  if (max - min < 0.12) return l < 0.5 ? "dark grey" : "light grey";
  const h = max === r ? ((g - b) / (max - min) + 6) % 6 : max === g ? (b - r) / (max - min) + 2 : (r - g) / (max - min) + 4;
  const deg = h * 60;
  const name = deg < 15 || deg >= 345 ? "red" : deg < 45 ? "orange" : deg < 70 ? "yellow" : deg < 160 ? "green" : deg < 200 ? "teal" : deg < 255 ? "blue" : deg < 290 ? "purple" : "pink";
  return l < 0.35 ? `dark ${name}` : name;
}

// A coach asks for the AI analyst report on an analysed match video (coaching staff, team with AI video reports on).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { job_id?: string; context?: { score?: string; formation?: string; plan?: string; notes?: string } };
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." });
  const { data: job } = await db.from("match_video_jobs").select("id,match_id,club_id,status,our_team,results").eq("id", String(body.job_id ?? "")).maybeSingle();
  if (!job || job.status !== "done") return NextResponse.json({ ok: false, error: "Analyse the video first." });
  if (job.our_team === null) return NextResponse.json({ ok: false, error: "Choose which shirt colour is your team first." });
  const { data: allowed } = await supabase.rpc("match_review_ok", { mid: job.match_id });
  if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  const { data: match } = await db.from("matches").select("team_id,opponent,our_score,their_score").eq("id", job.match_id).maybeSingle();
  const { data: team } = await db.from("teams").select("name,age_group,video_ai").eq("id", match?.team_id ?? "").maybeSingle();
  if (!team?.video_ai) return NextResponse.json({ ok: false, error: "AI video reports aren't switched on for this team. A club admin can turn them on." });
  if (!workerConfigured()) return NextResponse.json({ ok: false, error: "The video analysis service isn't set up on the server yet." });

  const r = (job.results ?? {}) as Record<string, unknown> & { teams?: { colour: string }[]; key?: { moments?: unknown[] } };
  if (!r.key?.moments?.length) return NextResponse.json({ ok: false, error: "No key moments were found in this video (it may be too short, or analysed before reports existed). Analyse it again." });
  const us = job.our_team as 0 | 1;
  const t = (s: unknown, n: number) => String(s ?? "").slice(0, n);
  const context = { score: t(body.context?.score, 20), formation: t(body.context?.formation, 20), plan: t(body.context?.plan, 600), notes: t(body.context?.notes, 600) };
  const { data: clubDrills } = await db.from("drills").select("id,name,category").eq("club_id", job.club_id).order("name").limit(100);
  const drills = [
    ...((clubDrills ?? []) as { id: string; name: string; category: string }[]).map((d) => ({ ref: `club:${d.id}`, name: d.name, kind: d.category })),
    ...LIBRARY.map((d) => ({ ref: `lib:${d.key}`, name: d.name, kind: d.theme })),
  ];
  const { players, possession, quality, video, key } = r as Record<string, unknown>;
  const site = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  try {
    await sendToWorker({
      kind: "report",
      job_id: job.id,
      callback_url: `${site}/api/match-video/callback`,
      us,
      our_name: team.name,
      their_name: match?.opponent ?? "the opposition",
      our_colour: colourName(r.teams?.[us]?.colour ?? ""),
      their_colour: colourName(r.teams?.[1 - us]?.colour ?? ""),
      age_group: team.age_group,
      context,
      drills,
      results: { players, possession, quality, video, key },
    } as unknown as Parameters<typeof sendToWorker>[0]);
  } catch (e) {
    console.error("video worker:", e);
    return NextResponse.json({ ok: false, error: "The analysis service didn't respond. Try again later." });
  }
  const results = { ...r, report_pending: true, report_context: context };
  delete (results as Record<string, unknown>).report_error;
  await db.from("match_video_jobs").update({ results }).eq("id", job.id);
  return NextResponse.json({ ok: true });
}
