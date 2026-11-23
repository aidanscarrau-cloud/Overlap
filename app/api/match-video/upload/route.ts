import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/push-server";
import { MAX_BYTES, startUpload, videoConfigured } from "@/lib/video-server";

// A coach starts uploading a match video. The browser then sends the file in parts straight to storage.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { match_id?: string; file_name?: string; size?: number; type?: string };
  const matchId = String(body.match_id ?? "");
  const size = Number(body.size ?? 0);
  const type = String(body.type ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return NextResponse.json({ ok: false, error: "Match not found." });
  if (!(size > 0 && size <= MAX_BYTES)) return NextResponse.json({ ok: false, error: "Videos can be up to 10 GB." });
  if (!/^video\/(mp4|quicktime|x-m4v)$/.test(type)) return NextResponse.json({ ok: false, error: "Upload an MP4 or MOV video (Veo downloads are MP4)." });
  if (!videoConfigured()) return NextResponse.json({ ok: false, error: "Video uploads aren't set up on the server yet." });
  const { data: allowed } = await supabase.rpc("match_review_ok", { mid: matchId });
  if (!allowed) return NextResponse.json({ ok: false, error: "Only this team's coaching staff can add match video, once a club admin has switched match review on." });
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false, error: "The server is missing SUPABASE_SERVICE_ROLE_KEY." });

  // One analysis at a time per match.
  const { data: busy } = await db.from("match_video_jobs").select("id").eq("match_id", matchId).in("status", ["queued", "processing"]).limit(1);
  if (busy?.length) return NextResponse.json({ ok: false, error: "This match's video is already being analysed." });

  const { data: job, error } = await db
    .from("match_video_jobs")
    .insert({ match_id: matchId, file_name: String(body.file_name ?? "").slice(0, 200), file_size: size, created_by: auth.user.id })
    .select("id,club_id")
    .single();
  if (error || !job) return NextResponse.json({ ok: false, error: error?.message ?? "Couldn't start the upload." });
  const key = `${job.club_id}/${matchId}/${job.id}.${type === "video/quicktime" ? "mov" : "mp4"}`;
  try {
    const up = await startUpload(key, size, type);
    await db.from("match_video_jobs").update({ object_key: key, upload_id: up.uploadId, message: "Uploading" }).eq("id", job.id);
    return NextResponse.json({ ok: true, job_id: job.id, part_size: up.partSize, urls: up.urls });
  } catch (e) {
    console.error("video upload start:", e);
    await db.from("match_video_jobs").update({ status: "failed", message: "Couldn't start the upload." }).eq("id", job.id);
    return NextResponse.json({ ok: false, error: "Couldn't reach video storage. Check the R2 settings." });
  }
}
