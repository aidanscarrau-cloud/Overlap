import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { veoSlug, veoVideo } from "@/lib/veo";
import { youtubeId, type VideoSource } from "@/lib/analysis";

// Where a match's video can be played from, for the analysis screen (coaching staff only).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { match_id?: string };
  const matchId = String(body.match_id ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(matchId)) return NextResponse.json({ ok: false, error: "Match not found." });
  const { data: allowed } = await supabase.rpc("match_review_ok", { mid: matchId });
  if (!allowed) return NextResponse.json({ ok: false, error: "Not allowed." }, { status: 403 });
  const { data: v } = await supabase.from("match_videos").select("url").eq("match_id", matchId).maybeSingle();
  const url = (v?.url as string | undefined)?.trim();
  let source: VideoSource;
  if (!url) source = { kind: "none", reason: "No video link saved for this match. Add one on the match's Review tab, or open a video file from this computer." };
  else if (youtubeId(url)) source = { kind: "youtube", id: youtubeId(url)! };
  else if (veoSlug(url)) {
    const found = await veoVideo(veoSlug(url)!);
    source = found.ok ? { kind: "mp4", url: found.url } : { kind: "none", reason: `${found.error} You can also open the downloaded file from this computer.` };
  } else if (/^https:\/\/\S+\.(mp4|m4v|mov|webm)(\?\S*)?$/i.test(url)) source = { kind: "mp4", url };
  else source = { kind: "none", reason: "This kind of link can't be played inside Overlap. Open the video file from this computer instead." };
  return NextResponse.json({ ok: true, source });
}
