import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/push-server";
import { deleteVideo, verifyWorker } from "@/lib/video-server";

type AutoEvent = { t: number; kind: string; team: number; outcome?: string; x?: number; y?: number; confidence?: number };
const AUTO_KINDS = new Set(["goal", "shot", "corner", "free_kick", "throw_in", "cross", "box_entry", "turnover_won"]);
const CLIP: Record<string, [number, number]> = { goal: [10, 8], shot: [8, 4], corner: [2, 10], free_kick: [2, 10], throw_in: [2, 8], cross: [6, 5], box_entry: [5, 5], turnover_won: [3, 8] };

/** The worker's auto-tags replace any earlier unchecked ones for the match; the match clock is set if nobody has set it. */
async function saveAutoTags(db: NonNullable<ReturnType<typeof serviceClient>>, jobId: string, matchId: string, events: AutoEvent[], periods: unknown[]) {
  const us = ((await db.from("match_video_jobs").select("our_team").eq("id", jobId).maybeSingle()).data?.our_team as number | null) ?? 0;
  const rows = events
    .filter((e) => AUTO_KINDS.has(e.kind) && Number.isFinite(e.t) && e.t >= 0 && e.t < 36000)
    .slice(0, 250)
    .map((e) => ({
      match_id: matchId,
      t: e.t,
      kind: e.kind,
      team: e.team === us ? "us" : "them",
      outcome: String(e.outcome ?? "").slice(0, 40),
      x: Number.isFinite(e.x) ? Math.max(0, Math.min(100, Number(e.x))) : null,
      y: Number.isFinite(e.y) ? Math.max(0, Math.min(100, Number(e.y))) : null,
      pre: CLIP[e.kind][0],
      post: CLIP[e.kind][1],
      source: "auto",
    }));
  const del = await db.from("match_events").delete().eq("match_id", matchId).eq("source", "auto");
  if (del.error) return { error: /source/.test(del.error.message) ? "Run update 42 in Supabase to get auto-tags." : del.error.message.slice(0, 200) };
  if (rows.length) {
    const ins = await db.from("match_events").insert(rows);
    if (ins.error) return { error: ins.error.message.slice(0, 200) };
  }
  if (periods.length) {
    const cur = await db.from("match_analysis").select("periods").eq("match_id", matchId).maybeSingle();
    if (!cur.error && !((cur.data?.periods as unknown[] | undefined) ?? []).length) await db.from("match_analysis").upsert({ match_id: matchId, periods: periods.slice(0, 4) }, { onConflict: "match_id" });
  }
  return { count: rows.length, periods: periods.length };
}

// The analysis worker reports progress and results here. Every call is signed with the shared secret.
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWorker(raw, request.headers.get("x-overlap-timestamp"), request.headers.get("x-overlap-signature"))) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { job_id?: string; status?: string; progress?: number; message?: string; results?: unknown; mapping?: unknown; mapping_error?: string; report?: unknown; report_error?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });
  const { data: job } = await db.from("match_video_jobs").select("id,match_id,status,object_key,video_deleted,results").eq("id", String(body.job_id ?? "")).maybeSingle();
  if (!job) return NextResponse.json({ ok: false }, { status: 404 });

  // The AI analyst report.
  if (body.report !== undefined || body.report_error !== undefined) {
    const results: Record<string, unknown> = { ...((job.results as Record<string, unknown>) ?? {}), report_pending: false };
    const report = body.report as { key_moments?: { id: string; title: string; coaching_point: string; what_happened: string; t: number; team: number }[] } | undefined;
    if (report && typeof report === "object") {
      results.report = report;
      delete results.report_error;
      // The report's key moments become tags on the match, ready to present from the Analysis page.
      const us = (await db.from("match_video_jobs").select("our_team").eq("id", job.id).maybeSingle()).data?.our_team as number | null;
      const ev = (report.key_moments ?? []).slice(0, 30).map((k) => ({
        match_id: job.match_id,
        t: Math.max(0, Number(k.t) || 0),
        kind: "note",
        team: k.team === us ? "us" : "them",
        outcome: "AI report",
        note: String(k.coaching_point ?? "").slice(0, 500),
        pre: 5,
        post: 5,
        title: String(k.title ?? "").slice(0, 120),
      }));
      if (ev.length) {
        await db.from("match_events").delete().eq("match_id", job.match_id).eq("outcome", "AI report");
        const ins = await db.from("match_events").insert(ev);
        if (ins.error) await db.from("match_events").insert(ev.map(({ title, ...rest }) => (void title, rest))); // before update 39
      }
    } else results.report_error = String(body.report_error ?? "").slice(0, 300);
    await db.from("match_video_jobs").update({ results }).eq("id", job.id);
    return NextResponse.json({ ok: true });
  }

  // The pitch-mapping step (after the coach tapped pitch points) reports separately and keeps the job done.
  if (body.mapping !== undefined || body.mapping_error !== undefined) {
    const results: Record<string, unknown> = { ...((job.results as Record<string, unknown>) ?? {}), mapping_pending: false };
    let check: string | null = null;
    if (body.mapping && typeof body.mapping === "object") {
      const { check_jpeg, events, periods, ...mapping } = body.mapping as { check_jpeg?: string; events?: AutoEvent[]; periods?: unknown[] };
      check = typeof check_jpeg === "string" ? check_jpeg : null;
      results.mapping = mapping;
      results.auto_tags = await saveAutoTags(db, job.id, job.match_id, events ?? [], periods ?? []);
      delete results.mapping_error;
    } else results.mapping_error = String(body.mapping_error ?? "").slice(0, 300);
    await db.from("match_video_jobs").update({ results, ...(check ? { check_jpeg: check } : {}) }).eq("id", job.id);
    return NextResponse.json({ ok: true });
  }
  if (job.status === "cancelled" || job.status === "done") return NextResponse.json({ ok: true, stop: job.status === "cancelled" });

  const status = body.status === "done" || body.status === "failed" ? body.status : "processing";
  const patch: Record<string, unknown> = {
    status,
    progress: status === "done" ? 1 : Math.max(0, Math.min(0.99, Number(body.progress) || 0)),
    message: String(body.message ?? "").slice(0, 300),
  };
  if (status === "done") {
    // The panorama picture goes in its own column so normal page loads don't download it.
    const res = (body.results ?? null) as { pitch_view?: { pano_jpeg?: string } } | null;
    if (res?.pitch_view?.pano_jpeg) {
      patch.pano_jpeg = res.pitch_view.pano_jpeg;
      res.pitch_view = { ...res.pitch_view, pano_jpeg: undefined };
    }
    patch.results = res;
  }
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
