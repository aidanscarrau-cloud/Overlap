import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/push-server";
import { deleteVideo, verifyWorker } from "@/lib/video-server";

// The analysis worker reports progress and results here. Every call is signed with the shared secret.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWorker(raw, request.headers.get("x-overlap-timestamp"), request.headers.get("x-overlap-signature"))) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { job_id?: string; status?: string; progress?: number; message?: string; results?: unknown };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });
  const { data: job } = await db.from("match_video_jobs").select("id,status,object_key,video_deleted").eq("id", String(body.job_id ?? "")).maybeSingle();
  if (!job) return NextResponse.json({ ok: false }, { status: 404 });
  if (job.status === "cancelled" || job.status === "done") return NextResponse.json({ ok: true, stop: job.status === "cancelled" });

  const status = body.status === "done" || body.status === "failed" ? body.status : "processing";
  const patch: Record<string, unknown> = {
    status,
    progress: status === "done" ? 1 : Math.max(0, Math.min(0.99, Number(body.progress) || 0)),
    message: String(body.message ?? "").slice(0, 300),
  };
  if (status === "done") patch.results = body.results ?? null;
  // The video isn't kept once it's analysed (or if analysis fails): only the numbers are.
  if (status !== "processing" && job.object_key && !job.video_deleted) {
    try {
      await deleteVideo(job.object_key);
      patch.video_deleted = true;
    } catch (e) {
      console.error("video delete:", e);
    }
  }
  await db.from("match_video_jobs").update(patch).eq("id", job.id);
  return NextResponse.json({ ok: true });
}
