"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { VideoPlayer, type PlayerHandle } from "./VideoPlayer";
import { Shapes } from "./Telestrator";
import { useMatchSource } from "./Tagger";
import { clock, kindLabel, matchMinute, type EventKind, type MatchEvent, type Period, type VideoSource } from "@/lib/analysis";
import { errMsg } from "@/lib/format";

/* Presentation mode: plays clips one after another for a team meeting, full screen, with a caption,
 * drawings that appear (and pause the clip) at the right moment, and one-second trimming. */

/** Video files opened from this computer, by match (kept while the page is open). */
const localFiles = new Map<string, string>();

export function Reel({ clips: initial, codes, periods, onClose, title, sources }: { clips: MatchEvent[]; codes?: EventKind[]; periods?: Record<string, Period[]>; onClose: () => void; title?: string; sources?: Record<string, VideoSource> }) {
  const { data, supabase, toast } = useApp();
  const [clips, setClips] = useState(initial);
  const [i, setI] = useState(0);
  const clip = clips[i];
  const fetched = useMatchSource(clip.match_id);
  const [, bump] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const local = localFiles.get(clip.match_id);
  const source: VideoSource | null = sources?.[clip.match_id] ?? (local ? { kind: "mp4", url: local } : fetched);
  const player = useRef<PlayerHandle>(null);
  const stage = useRef<HTMLDivElement>(null);
  const started = useRef<string | null>(null);
  const drawn = useRef<string | null>(null);
  const [showing, setShowing] = useState(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const m = data.matches.find((x) => x.id === clip.match_id);
  const name = (id: string | null) => (id ? (data.players.find((p) => p.id === id)?.full_name ?? "") : "");
  const end = (clip.t_end ?? clip.t) + clip.post;
  const start = clip.t - clip.pre;

  const go = useCallback((n: number) => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setShowing(false);
    drawn.current = null;
    started.current = null;
    setI(n);
  }, []);

  const resume = useCallback(() => {
    if (holdTimer.current) clearTimeout(holdTimer.current);
    setShowing(false);
    player.current?.play();
  }, []);

  const onTime = useCallback(
    (t: number) => {
      if (!player.current || showing) return;
      if (started.current !== clip.id) {
        player.current.seek(start);
        player.current.play();
        started.current = clip.id;
        return;
      }
      if (t < start - 2) return player.current.seek(start); // still loading: ask again
      const d = clip.drawing;
      if (d && d.shapes.length && drawn.current !== clip.id && t >= d.at - 0.05) {
        drawn.current = clip.id;
        player.current.pause();
        player.current.seek(d.at);
        setShowing(true);
        if (d.hold > 0) holdTimer.current = setTimeout(resume, d.hold * 1000);
        return;
      }
      if (t > end) {
        if (i + 1 < clips.length) go(i + 1);
        else player.current.pause();
      }
    },
    [clip, start, end, showing, i, clips.length, go, resume],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT")) return;
      if (e.key === "ArrowRight" && i + 1 < clips.length) go(i + 1);
      else if (e.key === "ArrowLeft" && i > 0) go(i - 1);
      else if (e.key === " ") {
        e.preventDefault();
        if (showing) resume();
        else player.current?.toggle();
      } else if (e.key.toLowerCase() === "f") fullscreen();
      else if (e.key === "r") go(i);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  useEffect(() => () => void (holdTimer.current && clearTimeout(holdTimer.current)), []);

  function fullscreen() {
    const el = stage.current?.parentElement;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else el.requestFullscreen?.().catch(() => {});
  }
  async function trim(which: "pre" | "post", by: number) {
    const v = Math.max(0, Math.min(60, (clip[which] ?? 0) + by));
    const next = { ...clip, [which]: v };
    setClips((cs) => cs.map((c) => (c.id === clip.id ? next : c)));
    const { error } = await supabase.from("match_events").update({ [which]: v }).eq("id", clip.id);
    if (error) toast(errMsg(error));
    started.current = null; // replay from the new start
  }

  const minute = periods?.[clip.match_id] ? matchMinute(clip.t, periods[clip.match_id]) : null;
  return (
    <div className="rl">
      <div className="rl-stage" ref={stage}>
        {source ? <VideoPlayer ref={player} source={source} onTime={onTime} /> : <div className="ap-player ap-none">Finding the video…</div>}
        {showing && clip.drawing && (
          <button type="button" className="rl-draw" onClick={resume} aria-label="Carry on playing">
            <Shapes shapes={clip.drawing.shapes} />
          </button>
        )}
        <div className="rl-cap">
          <b>{clip.title || kindLabel(clip.kind, codes)}</b>
          <span>{[minute ?? clock(clip.t), m ? `vs ${m.opponent}` : "", clip.team === "us" ? name(clip.player_id) : clip.shirt !== null ? `their #${clip.shirt}` : "", clip.outcome].filter(Boolean).join(" · ")}</span>
          {clip.note && <span className="rl-note">{clip.note}</span>}
        </div>
      </div>
      <div className="rl-bar">
        <button className="btn sm" type="button" disabled={i === 0} onClick={() => go(i - 1)}>
          ←
        </button>
        <span className="rl-count tnum">
          {i + 1} / {clips.length}
          {title ? ` · ${title}` : ""}
        </span>
        <button className="btn sm" type="button" disabled={i + 1 >= clips.length} onClick={() => go(i + 1)}>
          →
        </button>
        <span className="rl-trim" aria-label="Trim this clip">
          Start
          <button type="button" onClick={() => trim("pre", 1)} title="Start a second earlier">
            −1s
          </button>
          <button type="button" onClick={() => trim("pre", -1)} title="Start a second later">
            +1s
          </button>
          End
          <button type="button" onClick={() => trim("post", -1)} title="End a second earlier">
            −1s
          </button>
          <button type="button" onClick={() => trim("post", 1)} title="End a second later">
            +1s
          </button>
        </span>
        <button className="btn sm" type="button" onClick={fullscreen}>
          Full screen (F)
        </button>
        {source?.kind === "none" && (
          <button className="btn sm primary" type="button" onClick={() => fileInput.current?.click()}>
            Open video file{m ? ` for vs ${m.opponent}` : ""}…
          </button>
        )}
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            localFiles.set(clip.match_id, URL.createObjectURL(f));
            started.current = null;
            bump((n) => n + 1);
          }}
        />
        <button className="linkbtn" type="button" onClick={onClose}>
          Close
        </button>
      </div>
      <p className="muted rl-help">← → clip · Space pause/continue · R replay · F full screen</p>
    </div>
  );
}
