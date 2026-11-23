import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push-server";
import { sendToWorker, workerConfigured } from "@/lib/video-server";

const KEYS = new Set([
  "centre_spot", "halfway_far", "halfway_near", "circle_far", "circle_near", "circle_left", "circle_right", "goal_left", "goal_right",
  "corner_left_far", "corner_right_far", "corner_left_near", "corner_right_near", "box_left_far", "box_left_near", "box_right_far", "box_right_near",
]);

// The coach has tapped known points on the panorama: ask the worker to map the pitch in metres.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { job_id?: string; taps?: Record<string, [number, number]>; length?: number | null; width?: number | null };
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." });
  const { data: job } = await db.from("match_video_jobs").select("id,match_id,status,results").eq("id", String(body.job_id ?? "")).maybeSingle();
  if (!job || job.status !== "done") return NextResponse.json({ ok: false, error: "Analyse the video first." });
  const { data: allowed } = await supabase.rpc("match_review_ok", { mid: job.match_id });
  if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  if (!workerConfigured()) return NextResponse.json({ ok: false, error: "The video analysis service isn't set up on the server yet." });

  const taps: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(body.taps ?? {})) {
    if (KEYS.has(k) && Array.isArray(v) && v.length === 2 && v.every((n) => Number.isFinite(n) && n >= 0 && n < 5000)) taps[k] = [Number(v[0]), Number(v[1])];
  }
  if (Object.keys(taps).length < 4) return NextResponse.json({ ok: false, error: "Tap at least 4 points." });
  const size = (n: unknown, lo: number, hi: number) => (typeof n === "number" && n >= lo && n <= hi ? n : null);
  const site = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  try {
    await sendToWorker({ kind: "map", job_id: job.id, taps, length: size(body.length, 30, 130), width: size(body.width, 20, 100), callback_url: `${site}/api/match-video/callback` });
  } catch (e) {
    console.error("video worker:", e);
    return NextResponse.json({ ok: false, error: "The analysis service didn't respond. Try again later." });
  }
  const results = { ...((job.results as Record<string, unknown>) ?? {}), mapping_pending: true, taps };
  delete (results as Record<string, unknown>).mapping_error;
  await db.from("match_video_jobs").update({ results }).eq("id", job.id);
  return NextResponse.json({ ok: true });
}
