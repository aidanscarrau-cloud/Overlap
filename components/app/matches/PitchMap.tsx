"use client";

import { useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { errMsg } from "@/lib/format";
import type { TeamMap, VideoJob } from "@/lib/types";

/* Pitch mapping (coaching staff only): the coach taps a few known points on a panorama of the ground,
 * and the worker turns every player's position into metres: heat maps, the ball in each third, distance
 * covered and how high the back line sat. */

const POINTS: { key: string; label: string; hint: string }[] = [
  { key: "halfway_far", label: "Halfway, far line", hint: "Where the halfway line meets the far touchline" },
  { key: "circle_far", label: "Circle, far edge", hint: "The far edge of the centre circle, on the halfway line" },
  { key: "circle_near", label: "Circle, near edge", hint: "The near edge of the centre circle, on the halfway line" },
  { key: "circle_left", label: "Circle, left edge", hint: "The left edge of the centre circle" },
  { key: "circle_right", label: "Circle, right edge", hint: "The right edge of the centre circle" },
  { key: "goal_left", label: "Left goal", hint: "The middle of the left goal, on the goal line" },
  { key: "goal_right", label: "Right goal", hint: "The middle of the right goal, on the goal line" },
  { key: "corner_left_far", label: "Far left corner", hint: "The far left corner flag" },
  { key: "corner_right_far", label: "Far right corner", hint: "The far right corner flag" },
  { key: "box_left_far", label: "Left box, far corner", hint: "The far corner of the left penalty box (the one out in the field)" },
  { key: "box_right_far", label: "Right box, far corner", hint: "The far corner of the right penalty box (the one out in the field)" },
];

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!j.ok) throw new Error((j.error as string) || "Something went wrong.");
  return j;
}

export function PitchMap({ job, usColour, themColour }: { job: VideoJob; usColour: string; themColour: string }) {
  const r = job.results!;
  const [redo, setRedo] = useState(false);
  if (!r.pitch_view?.pano) return r.pitch_view?.error ? <p className="muted vs-note">Pitch mapping isn&apos;t available for this video: {r.pitch_view.error}</p> : null;
  if (r.mapping_pending)
    return (
      <div className="vs-prog">
        <div className="vs-bar">
          <span style={{ width: "60%" }} />
        </div>
        <p>Mapping the pitch… this takes under a minute.</p>
      </div>
    );
  if (r.mapping && !redo) return <PitchStats job={job} usColour={usColour} themColour={themColour} onRedo={() => setRedo(true)} />;
  return <Tapper job={job} onDone={() => setRedo(false)} />;
}

/* ---------------------------------------------------------------- tapping the points */

function Tapper({ job, onDone }: { job: VideoJob; onDone: () => void }) {
  const { supabase, toast, refresh } = useApp();
  const [open, setOpen] = useState(false);
  const [img, setImg] = useState<string | null>(null);
  const [taps, setTaps] = useState<Record<string, [number, number]>>(job.results?.taps ?? {});
  const [current, setCurrent] = useState(POINTS[0].key);
  const [len, setLen] = useState("");
  const [wid, setWid] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLImageElement>(null);
  const info = job.results!.pitch_view!.pano!;

  async function start() {
    setOpen(true);
    const { data, error } = await supabase.from("match_video_jobs").select("pano_jpeg").eq("id", job.id).maybeSingle();
    if (error || !data?.pano_jpeg) {
      toast(error ? errMsg(error) : "The panorama isn't available. Run update 36 in Supabase, then analyse the video again.");
      setOpen(false);
      return;
    }
    setImg(`data:image/jpeg;base64,${data.pano_jpeg}`);
  }
  function tap(e: React.MouseEvent<HTMLImageElement>) {
    const el = ref.current!;
    const box = el.getBoundingClientRect();
    const x = ((e.clientX - box.left) / box.width) * info.width;
    const y = ((e.clientY - box.top) / box.height) * info.height;
    const next = { ...taps, [current]: [Math.round(x), Math.round(y)] as [number, number] };
    setTaps(next);
    const left = POINTS.find((p) => !next[p.key]);
    if (left) setCurrent(left.key);
  }
  async function go() {
    setBusy(true);
    try {
      await post("/api/match-video/map", { job_id: job.id, taps, length: len ? Number(len) : null, width: wid ? Number(wid) : null });
      toast("Mapping the pitch…");
      onDone();
      refresh();
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }

  if (!open)
    return (
      <div className="vs-pick">
        <h4 className="vs-h">Map the pitch for heat maps, thirds and distance covered</h4>
        <p>Tap a few points you can see on a picture of your ground (about a minute). You only need to do this once per video.</p>
        {job.results?.mapping_error && <p className="notice bad">{job.results.mapping_error}</p>}
        {job.results?.auto_tags?.error && <p className="notice">{job.results.auto_tags.error}</p>}
        {!!job.results?.auto_tags?.count && (
          <p className="notice">
            <b>{job.results.auto_tags.count} auto-tags added</b> (shots, set pieces, crosses, box entries and more){job.results.auto_tags.periods ? ", and the match clock was set" : ""}. Check them on the{" "}
            <a href="/analysis">Analysis page</a>.
          </p>
        )}
        <button className="btn primary" type="button" onClick={start} style={{ justifySelf: "start" }}>
          Map the pitch
        </button>
      </div>
    );
  const n = Object.keys(taps).length;
  const hint = POINTS.find((p) => p.key === current)?.hint;
  return (
    <div className="vs-pick">
      <h4 className="vs-h">Map the pitch</h4>
      <p>
        Choose a point below, then tap exactly where it is on the picture. Tap <b>at least 4</b>, spread out: the halfway line and centre circle are easiest, then a goal or corner. Skip any you can&apos;t see.
      </p>
      <div className="pm-points" role="group" aria-label="Pitch points">
        {POINTS.map((p) => (
          <button key={p.key} type="button" aria-pressed={current === p.key} className={taps[p.key] ? "done" : ""} onClick={() => setCurrent(p.key)}>
            {taps[p.key] ? "✓ " : ""}
            {p.label}
          </button>
        ))}
      </div>
      <p className="pm-now">
        Now tap: <b>{hint}</b>
      </p>
      <div className="pm-wrap">
        {img ? (
          <div className="pm-pic">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img ref={ref} src={img} alt="Panorama of the ground from the match video" onClick={tap} draggable={false} />
            {Object.entries(taps).map(([k, [x, y]]) => (
              <span key={k} className={`pm-dot${k === current ? " on" : ""}`} style={{ left: `${(100 * x) / info.width}%`, top: `${(100 * y) / info.height}%` }} title={POINTS.find((p) => p.key === k)?.label} />
            ))}
          </div>
        ) : (
          <p className="muted">Loading the picture…</p>
        )}
      </div>
      <div className="row2">
        <label className="field">
          <span>Pitch length in metres (optional)</span>
          <input className="input" inputMode="numeric" value={len} onChange={(e) => setLen(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="e.g. 100" />
        </label>
        <label className="field">
          <span>Pitch width in metres (optional)</span>
          <input className="input" inputMode="numeric" value={wid} onChange={(e) => setWid(e.target.value.replace(/[^\d.]/g, "").slice(0, 5))} placeholder="e.g. 64" />
        </label>
      </div>
      <div className="sheet-actions">
        <button className="linkbtn" type="button" onClick={() => setTaps({})} disabled={!n}>
          Clear taps
        </button>
        <span className="spacer" />
        <button className="btn primary" type="button" disabled={busy || n < 4} onClick={go}>
          {busy ? "Sending…" : n < 4 ? `Tap ${4 - n} more` : "Map the pitch"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the stats */

function PitchStats({ job, usColour, themColour, onRedo }: { job: VideoJob; usColour: string; themColour: string; onRedo: () => void }) {
  const { supabase, toast } = useApp();
  const m = job.results!.mapping!;
  const ours = job.our_team ?? 0;
  const [who, setWho] = useState<"us" | "them">("us");
  const [check, setCheck] = useState<string | null>(null);
  const us = m.teams[ours];
  const them = m.teams[1 - ours];
  const t = who === "us" ? us : them;
  const col = vivid(who === "us" ? usColour : themColour, who === "us" ? "var(--accent)" : "#6b7a8f");

  async function showCheck() {
    if (check) return setCheck(null);
    const { data, error } = await supabase.from("match_video_jobs").select("check_jpeg").eq("id", job.id).maybeSingle();
    if (error || !data?.check_jpeg) return toast("The check picture isn't available.");
    setCheck(`data:image/jpeg;base64,${data.check_jpeg}`);
  }

  return (
    <div className="vs-res">
      <div className="mr-inline" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h4 className="vs-h" style={{ margin: 0 }}>
          On the pitch ({Math.round(m.pitch.length)} × {Math.round(m.pitch.width)} m)
        </h4>
        <div className="seg" role="group" aria-label="Team">
          <button type="button" aria-pressed={who === "us"} onClick={() => setWho("us")}>
            Us
          </button>
          <button type="button" aria-pressed={who === "them"} onClick={() => setWho("them")}>
            Them
          </button>
        </div>
      </div>
      {t ? (
        <>
          <Heat team={t} grid={m.grid} colour={col} label={who === "us" ? "Where we played" : "Where they played"} />
          {t.ball_thirds && <Thirds thirds={t.ball_thirds} colour={col} who={who} />}
          <dl className="pm-facts">
            {t.metres_per_min !== null && (
              <div>
                <dt>Running</dt>
                <dd>
                  <b className="tnum">{((t.metres_per_min * 90) / 1000).toFixed(1)} km</b> per player over 90 minutes
                  {t.high_speed_pct !== null && <small> · {Math.round(t.high_speed_pct)}% at high speed</small>}
                </dd>
              </div>
            )}
            {t.defensive_line_m !== null && (
              <div>
                <dt>Back line</dt>
                <dd>
                  usually <b className="tnum">{Math.round(t.defensive_line_m)} m</b> from {who === "us" ? "our" : "their"} goal
                </dd>
              </div>
            )}
            {t.width_m !== null && (
              <div>
                <dt>Width</dt>
                <dd>
                  usually <b className="tnum">{Math.round(t.width_m)} m</b> across
                </dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className="muted">Not enough of this team was seen to map.</p>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Estimates from the video. Players far from the camera are sometimes missed, so running distances are a guide.
      </p>
      <div className="mr-inline" style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <button className="linkbtn" type="button" onClick={showCheck}>
          {check ? "Hide the check picture" : "Check the pitch lines"}
        </button>
        <button className="linkbtn" type="button" onClick={onRedo}>
          Redo the pitch taps
        </button>
      </div>
      {check && (
        <figure className="pm-check">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={check} alt="The pitch markings Overlap worked out, drawn on the ground" />
          <figcaption className="muted">The pink lines should sit on your pitch markings. If they don&apos;t, redo the taps.</figcaption>
        </figure>
      )}
    </div>
  );
}

function Heat({ team, grid, colour, label }: { team: TeamMap; grid: [number, number]; colour: string; label: string }) {
  const [gx, gy] = grid;
  const max = Math.max(1, ...team.heat.flat());
  const W = 105,
    H = 68;
  return (
    <figure className="pm-heat">
      <svg viewBox={`-2 -2 ${W + 4} ${H + 4}`} role="img" aria-label={`${label}: heat map, attacking left to right`}>
        <rect x={0} y={0} width={W} height={H} className="pm-grass" />
        {team.heat.map((col, i) =>
          col.map((v, j) => (v ? <rect key={`${i}-${j}`} x={(i * W) / gx} y={H - ((j + 1) * H) / gy} width={W / gx} height={H / gy} fill={colour} opacity={0.08 + 0.85 * (v / max)} /> : null)),
        )}
        <g className="pm-lines">
          <rect x={0} y={0} width={W} height={H} />
          <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
          <circle cx={W / 2} cy={H / 2} r={9.15} />
          <rect x={0} y={H / 2 - 20.16} width={16.5} height={40.32} />
          <rect x={W - 16.5} y={H / 2 - 20.16} width={16.5} height={40.32} />
        </g>
      </svg>
      <figcaption className="muted">{label} · attacking →</figcaption>
    </figure>
  );
}

function Thirds({ thirds, colour, who }: { thirds: [number, number, number]; colour: string; who: "us" | "them" }) {
  const names = who === "us" ? ["Our third", "Middle", "Their third"] : ["Their own third", "Middle", "Our third"];
  return (
    <div>
      <h4 className="vs-h">Where the ball was</h4>
      <div className="pm-thirds">
        {thirds.map((v, i) => (
          <div key={i} style={{ flex: Math.max(v, 14) }}>
            <span style={{ background: colour, opacity: 0.35 + 0.25 * i }} />
            <b className="tnum">{Math.round(v)}%</b>
            <small>{names[i]}</small>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Shirt colours like black or grey make an unreadable heat map: use a clear colour instead. */
function vivid(hex: string, fallback: string) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return fallback;
  const [r, g, b] = [m[1], m[2], m[3]].map((x) => parseInt(x, 16) / 255);
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const light = (max + min) / 2;
  const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * light - 1));
  return light < 0.25 || sat < 0.25 ? fallback : hex;
}
