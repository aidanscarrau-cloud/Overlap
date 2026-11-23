"use client";

import { useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { errMsg } from "@/lib/format";
import type { Match, VideoJob } from "@/lib/types";
import { PitchMap } from "./PitchMap";

/* Automatic match stats from video (coaching staff only). The coach picks the MP4 they downloaded from
 * Veo; it uploads in parts straight to storage, is analysed on a GPU, and is deleted afterwards. */

const gb = (n: number) => (n >= 1024 ** 3 ? `${(n / 1024 ** 3).toFixed(1)} GB` : `${Math.round(n / 1024 ** 2)} MB`);
const LIVE = ["uploading", "queued", "processing"];

export function VideoStats({ match }: { match: Match }) {
  const { data, supabase, patch } = useApp();
  const job = data.videoJobs.find((j) => j.match_id === match.id);
  const [upload, setUpload] = useState<{ sent: number; total: number } | null>(null);
  const abort = useRef<AbortController | null>(null);

  // While the server works on it, check back every 8 seconds.
  const waiting = !!job && !upload && (["queued", "processing"].includes(job.status) || !!job.results?.mapping_pending);
  useEffect(() => {
    if (!waiting || !job) return;
    const t = setInterval(async () => {
      const { data: j } = await supabase.from("match_video_jobs").select("id,match_id,status,progress,message,file_name,file_size,our_team,results,created_at,updated_at").eq("id", job.id).maybeSingle();
      if (j) patch((d) => ({ ...d, videoJobs: d.videoJobs.map((x) => (x.id === j.id ? (j as VideoJob) : x)) }));
    }, 8000);
    return () => clearInterval(t);
  }, [waiting, job, supabase, patch]);

  return (
    <section className="mr-card vs">
      <h3>Automatic stats from video</h3>
      {upload ? (
        <Uploading sent={upload.sent} total={upload.total} onCancel={() => abort.current?.abort()} />
      ) : job && LIVE.includes(job.status) && job.status !== "uploading" ? (
        <Working job={job} />
      ) : job?.status === "done" && job.results ? (
        <Results job={job} />
      ) : (
        <Picker match={match} last={job} setUpload={setUpload} abort={abort} />
      )}
    </section>
  );
}

function Picker({ match, last, setUpload, abort }: { match: Match; last?: VideoJob; setUpload: (u: { sent: number; total: number } | null) => void; abort: React.MutableRefObject<AbortController | null> }) {
  const { toast, refresh } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [starting, setStarting] = useState(false);
  const veo = /^https:\/\/app\.veo\.co\/matches\//i.test(match.video_url ?? "");

  async function fromVeo() {
    setStarting(true);
    try {
      await post("/api/match-video/from-veo", { match_id: match.id });
      toast("Started. The analysis takes about 10–20 minutes; you can leave this page.");
    } catch (e) {
      toast(errMsg(e));
    }
    setStarting(false);
    refresh();
  }

  async function go(file: File) {
    const type = file.type || (/\.mov$/i.test(file.name) ? "video/quicktime" : "video/mp4");
    const ac = new AbortController();
    abort.current = ac;
    let jobId = "";
    try {
      const r = await post("/api/match-video/upload", { match_id: match.id, file_name: file.name, size: file.size, type });
      jobId = r.job_id as string;
      const partSize = r.part_size as number;
      const urls = r.urls as string[];
      setUpload({ sent: 0, total: file.size });
      const sent = new Array(urls.length).fill(0);
      const parts: { n: number; etag: string }[] = [];
      let next = 0;
      // Three parts at a time, each retried up to 4 times, so a wobbly connection doesn't lose a 3 GB upload.
      const worker = async () => {
        while (next < urls.length) {
          const i = next++;
          const blob = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize));
          for (let attempt = 1; ; attempt++) {
            try {
              const etag = await putPart(urls[i], blob, ac.signal, (n) => {
                sent[i] = n;
                setUpload({ sent: sent.reduce((a, b) => a + b, 0), total: file.size });
              });
              parts.push({ n: i + 1, etag });
              break;
            } catch (e) {
              if (ac.signal.aborted || attempt >= 4) throw e;
              sent[i] = 0;
              await new Promise((res) => setTimeout(res, 1500 * attempt));
            }
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      await post("/api/match-video/finish", { job_id: jobId, parts });
      toast("Uploaded. The analysis takes about 10–20 minutes; you can leave this page.");
    } catch (e) {
      if (jobId) await post("/api/match-video/cancel", { job_id: jobId }).catch(() => {});
      toast(ac.signal.aborted ? "Upload cancelled" : errMsg(e));
    }
    setUpload(null);
    abort.current = null;
    refresh();
  }

  return (
    <div className="vs-pick">
      <p>
        Overlap can work out <b>possession</b> from the full match video, and how it changed through the game.{" "}
        {veo ? "Use the Veo link saved above, or upload the video file." : "Paste the Veo link above, or download the video from Veo (Library → ⋯ → Download) and choose the file here."}
      </p>
      {last?.status === "failed" && <p className="notice bad">The last try didn&apos;t work: {last.message || "unknown error"}</p>}
      <input
        ref={input}
        type="file"
        accept="video/mp4,video/quicktime,.mp4,.mov,.m4v"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) go(f);
        }}
      />
      <div className="mr-inline" style={{ flexWrap: "wrap" }}>
        {veo && (
          <button className="btn primary" type="button" disabled={starting} onClick={fromVeo}>
            {starting ? "Starting…" : "Analyse from the Veo link"}
          </button>
        )}
        <button className={`btn${veo ? "" : " primary"}`} type="button" onClick={() => input.current?.click()}>
          {veo ? "Or upload a video file…" : "Choose match video…"}
        </button>
      </div>
      {veo && <small className="muted">The Veo link works when the match is shared publicly on Veo. If it isn&apos;t, upload the file instead.</small>}
      <small className="muted">Up to 10 GB. Coaching staff only. The video is deleted as soon as it&apos;s analysed; only the numbers are kept. Faces and names aren&apos;t identified.</small>
    </div>
  );
}

function Uploading({ sent, total, onCancel }: { sent: number; total: number; onCancel: () => void }) {
  const pct = total ? Math.min(100, (100 * sent) / total) : 0;
  return (
    <div className="vs-prog">
      <div className="vs-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Upload progress">
        <span style={{ width: `${pct}%` }} />
      </div>
      <p>
        Uploading {gb(sent)} of {gb(total)} ({Math.floor(pct)}%). Keep this page open until it finishes.
      </p>
      <button className="btn" type="button" onClick={onCancel} style={{ justifySelf: "start" }}>
        Cancel upload
      </button>
    </div>
  );
}

function Working({ job }: { job: VideoJob }) {
  const { toast, refresh } = useApp();
  const pct = Math.round(100 * job.progress);
  return (
    <div className="vs-prog">
      <div className="vs-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Analysis progress">
        <span style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
      <p>
        {job.message || "Analysing"} · {pct}%. You can close this; the stats appear here when they&apos;re ready.
      </p>
      <button
        className="linkbtn"
        type="button"
        style={{ justifySelf: "start" }}
        onClick={async () => {
          if (!window.confirm("Stop the analysis and delete the uploaded video?")) return;
          await post("/api/match-video/cancel", { job_id: job.id }).catch((e) => toast(errMsg(e)));
          refresh();
        }}
      >
        Stop
      </button>
    </div>
  );
}

function Results({ job }: { job: VideoJob }) {
  const { supabase, patch, toast } = useApp();
  const r = job.results!;
  const [t0, t1] = r.teams;
  const ours = job.our_team;
  async function pick(k: 0 | 1) {
    const { error } = await supabase.from("match_video_jobs").update({ our_team: k }).eq("id", job.id);
    if (error) return toast(errMsg(error));
    patch((d) => ({ ...d, videoJobs: d.videoJobs.map((x) => (x.id === job.id ? { ...x, our_team: k } : x)) }));
  }
  if (!t0 || !t1)
    return (
      <div className="vs-pick">
        <p className="notice bad">We couldn&apos;t tell the two teams apart in this video. This happens with very similar shirt colours or a far-away camera.</p>
        <Again job={job} />
      </div>
    );
  if (ours === null)
    return (
      <div className="vs-pick">
        <p>Done. Which shirt colour is your team?</p>
        <div className="vs-teams">
          {[t0, t1].map((t) => (
            <button key={t.key} type="button" className="vs-team" onClick={() => pick(t.key)}>
              <span className="vs-swatch" style={{ background: t.colour }} />
              This one
            </button>
          ))}
        </div>
        <small className="muted">Colours are as the camera saw them, so they may look a little off.</small>
      </div>
    );
  const us = Math.round(r.possession.pct[ours]);
  const them = 100 - us;
  const usCol = r.teams[ours].colour;
  const themCol = r.teams[1 - ours].colour;
  const low = r.quality.ball_seen_pct < 25 || r.possession.seconds_with_owner < 120;
  return (
    <div className="vs-res">
      <div className="vs-poss">
        <div className="vs-poss-nums">
          <span>
            <b className="tnum">{Math.round(us)}%</b> us
          </span>
          <span>
            them <b className="tnum">{Math.round(them)}%</b>
          </span>
        </div>
        <div className="vs-split" aria-label={`Possession: us ${Math.round(us)}%, them ${Math.round(them)}%`}>
          <span style={{ width: `${us}%`, background: usCol }} />
          <span style={{ width: `${them}%`, background: themCol }} />
        </div>
        <small className="muted">Possession</small>
      </div>
      {r.possession.by_5_min.filter((b) => b.team0_pct !== null).length > 1 && (
        <div>
          <h4 className="vs-h">How it changed (every 5 minutes)</h4>
          <div className="vs-mins">
            {r.possession.by_5_min.map((b) => {
              const u = b.team0_pct === null ? null : ours === 0 ? b.team0_pct : 100 - b.team0_pct;
              return (
                <div key={b.from_min} className="vs-min" title={u === null ? "No clear possession" : `${Math.round(u)}% us`}>
                  <span className="vs-min-bar">{u !== null && <span style={{ height: `${u}%`, background: usCol }} />}</span>
                  <small className="tnum">{b.from_min}&apos;</small>
                </div>
              );
            })}
          </div>
        </div>
      )}
      <p className={low ? "notice" : "muted"} style={{ margin: 0, fontSize: 13 }}>
        {low ? "Rough estimate: the ball was hard to see in much of this video. " : "Estimated from the video. "}
        Ball seen in {Math.round(r.quality.ball_seen_pct)}% of moments, {Math.round(r.video.analysed_seconds / 60)} minutes analysed.
      </p>
      <div className="mr-inline" style={{ justifyContent: "space-between" }}>
        <button className="linkbtn" type="button" onClick={() => pick(ours === 0 ? 1 : 0)}>
          Wrong team? Swap colours
        </button>
        <Again job={job} />
      </div>
      <small className="muted">Used in this match&apos;s AI feedback.</small>
      <PitchMap job={job} usColour={usCol} themColour={themCol} />
    </div>
  );
}

function Again({ job }: { job: VideoJob }) {
  const { toast, refresh } = useApp();
  return (
    <button
      className="linkbtn"
      type="button"
      onClick={async () => {
        if (!window.confirm("Remove these stats so you can upload the video again?")) return;
        await post("/api/match-video/cancel", { job_id: job.id }).catch((e) => toast(errMsg(e)));
        refresh();
      }}
    >
      Remove and upload again
    </button>
  );
}

/* ---------------------------------------------------------------- helpers */

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!j.ok) throw new Error((j.error as string) || "Something went wrong.");
  return j;
}

/** PUT one part with upload progress (fetch can't report upload progress, so this uses XHR). */
function putPart(url: string, blob: Blob, signal: AbortSignal, onProgress: (sent: number) => void) {
  return new Promise<string>((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open("PUT", url);
    x.upload.onprogress = (e) => onProgress(e.loaded);
    x.onload = () => {
      const etag = x.getResponseHeader("ETag");
      if (x.status >= 200 && x.status < 300 && etag) {
        onProgress(blob.size);
        resolve(etag);
      } else reject(new Error(x.status >= 200 && x.status < 300 ? "Storage didn't return the part's ETag (check the bucket's CORS settings)." : `Upload failed (${x.status}).`));
    };
    x.onerror = () => reject(new Error("Upload interrupted. Check your connection."));
    signal.addEventListener("abort", () => x.abort());
    x.onabort = () => reject(new Error("Cancelled"));
    x.send(blob);
  });
}
