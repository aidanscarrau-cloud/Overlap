import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push-server";
import { abortUpload, deleteVideo } from "@/lib/video-server";

// Stop an upload or remove a job (and its video, if it's still stored).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { job_id?: string };
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." });
  const { data: job } = await db.from("match_video_jobs").select("id,match_id,status,object_key,upload_id,video_deleted").eq("id", String(body.job_id ?? "")).maybeSingle();
  if (!job) return NextResponse.json({ ok: false, error: "Not found." });
  const { data: allowed } = await supabase.rpc("match_review_ok", { mid: job.match_id });
  if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  if (job.status === "uploading" && job.upload_id) await abortUpload(job.object_key, job.upload_id);
  if (job.object_key && !job.video_deleted) await deleteVideo(job.object_key).catch(() => {});
  if (["uploading", "queued", "processing"].includes(job.status)) await db.from("match_video_jobs").update({ status: "cancelled", message: "Cancelled", video_deleted: true }).eq("id", job.id);
  else await db.from("match_video_jobs").delete().eq("id", job.id);
  return NextResponse.json({ ok: true });
}
