import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push-server";
import { abortUpload, finishUpload, readUrl, sendToWorker, workerConfigured } from "@/lib/video-server";

// The browser has uploaded every part: put the file together and hand it to the analysis worker.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { job_id?: string; parts?: { n: number; etag: string }[] };
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." });
  const { data: job } = await db.from("match_video_jobs").select("id,match_id,status,object_key,upload_id").eq("id", String(body.job_id ?? "")).maybeSingle();
  if (!job || job.status !== "uploading") return NextResponse.json({ ok: false, error: "Upload not found." });
  const { data: allowed } = await supabase.rpc("match_review_ok", { mid: job.match_id });
  if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  const parts = (body.parts ?? []).filter((p) => Number.isInteger(p.n) && p.n > 0 && typeof p.etag === "string").slice(0, 10000);
  try {
    await finishUpload(job.object_key, job.upload_id, parts);
  } catch (e) {
    console.error("video upload finish:", e);
    await abortUpload(job.object_key, job.upload_id);
    await db.from("match_video_jobs").update({ status: "failed", message: "The upload didn't finish properly. Try again." }).eq("id", job.id);
    return NextResponse.json({ ok: false, error: "The upload didn't finish properly. Try again." });
  }
  if (!workerConfigured()) {
    await db.from("match_video_jobs").update({ status: "queued", message: "Uploaded. Waiting for the analysis service to be set up." }).eq("id", job.id);
    return NextResponse.json({ ok: true, queued: false });
  }
  const site = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  try {
    await sendToWorker({ job_id: job.id, video_url: await readUrl(job.object_key), callback_url: `${site}/api/match-video/callback` });
    await db.from("match_video_jobs").update({ status: "queued", progress: 0.01, message: "Waiting for the analysis to start" }).eq("id", job.id);
    return NextResponse.json({ ok: true, queued: true });
  } catch (e) {
    console.error("video worker:", e);
    await db.from("match_video_jobs").update({ status: "failed", message: "The analysis service didn't respond. Try again later." }).eq("id", job.id);
    return NextResponse.json({ ok: false, error: "The analysis service didn't respond. Try again later." });
  }
}
