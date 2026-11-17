"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Diagram as DiagramT, DiagramItem } from "@/lib/types";
import { Diagram, DiagramItemShape, PitchBase } from "@/components/ui";

/*
 * Plays a drill diagram: its arrows in the order they were drawn.
 * Passes roll the ball, runs move a player, dribbles move a player with the ball.
 * A run straight after a pass happens at the same time (movement off the ball).
 * Works for every diagram the drill designer makes; nothing extra to draw.
 */

type Pt = [number, number];
type Move = { who: number; from: Pt; to: Pt; ball?: boolean };
type Step = { arrows: number[]; moves: Move[]; ms: number };

const NEAR = 6.5;
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const MOVERS = new Set(["p", "o", "n", "b"]);

/** Works out who moves where for each step, starting from the drawn positions. */
function plan(d: DiagramT) {
  const items: DiagramItem[] = d.items.map((it) => [...it] as DiagramItem);
  const pos: Pt[] = items.map((it) => [it[1], it[2]]);
  const isBall = (i: number) => items[i][0] === "b";
  const isPlayer = (i: number) => ["p", "o", "n"].includes(items[i][0]);
  const nearest = (pt: Pt, ok: (i: number) => boolean, max = NEAR) => {
    let best = -1;
    let bd = max;
    pos.forEach((q, i) => {
      if (!ok(i)) return;
      const dd = dist(q, pt);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    return best;
  };
  // A pass or dribble with no ball drawn at its start gets one (the passer "has" it).
  const ballAt = (pt: Pt) => {
    let i = nearest(pt, isBall);
    if (i < 0) {
      items.push(["b", pt[0], pt[1]]);
      pos.push([pt[0], pt[1]]);
      i = items.length - 1;
    }
    return i;
  };

  const steps: Step[] = [];
  d.arrows.forEach(([k, x1, y1, x2, y2], ai) => {
    const from: Pt = [x1, y1];
    const to: Pt = [x2, y2];
    const moves: Move[] = [];
    if (k === "pass") {
      const b = ballAt(from);
      moves.push({ who: b, from: [...pos[b]] as Pt, to, ball: true });
      pos[b] = to;
    } else {
      const pl = nearest(from, isPlayer);
      if (pl >= 0) {
        // Keep the player's offset from the arrow so they end where the arrow points.
        const off: Pt = [pos[pl][0] - x1, pos[pl][1] - y1];
        const end: Pt = [x2 + off[0] * 0.3, y2 + off[1] * 0.3];
        moves.push({ who: pl, from: [...pos[pl]] as Pt, to: end });
        pos[pl] = end;
      }
      if (k === "drib") {
        const b = ballAt(from);
        moves.push({ who: b, from: [...pos[b]] as Pt, to, ball: true });
        pos[b] = to;
      }
    }
    if (!moves.length) return;
    const len = Math.max(...moves.map((m) => dist(m.from, m.to)));
    const ms = k === "pass" ? 450 + len * 18 : k === "drib" ? 700 + len * 32 : 600 + len * 28;
    const prev = steps[steps.length - 1];
    const prevWasPass = prev && d.arrows[prev.arrows[0]][0] === "pass";
    // Off-the-ball runs go with the pass before them, unless that player is the one receiving.
    if (k === "run" && prevWasPass && !prev.moves.some((m) => m.who === moves[0].who)) {
      prev.arrows.push(ai);
      prev.moves.push(...moves);
      prev.ms = Math.max(prev.ms, ms);
    } else steps.push({ arrows: [ai], moves, ms: Math.min(ms, 2600) });
  });
  return { items, steps };
}

export function AnimatedDiagram({ d, label, autoPlay = true }: { d?: DiagramT | null; label: string; autoPlay?: boolean }) {
  const ok = !!d && Array.isArray(d.items) && Array.isArray(d.arrows) && d.arrows.length > 0;
  const { items, steps } = useMemo(() => (ok ? plan(d!) : { items: [], steps: [] }), [ok, d]);
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  // Progress: step index plus how far through it (0–1). steps.length means "finished".
  const [prog, setProg] = useState({ step: 0, t: 0 });
  const raf = useRef(0);
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);

  // Start when the diagram comes into view, unless the viewer prefers less motion.
  useEffect(() => {
    if (!ok || !autoPlay) return;
    let reduce = false;
    try {
      reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    } catch {}
    if (reduce) return;
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return setPlaying(true);
    const io = new IntersectionObserver(([e]) => setPlaying(e.isIntersecting), { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [ok, autoPlay]);

  useEffect(() => {
    if (!playing || !steps.length) return;
    const HOLD = 1400;
    const GAP = 260;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = (now - last.current) * (slow ? 0.45 : 1);
      last.current = now;
      setProg((p) => {
        if (p.step >= steps.length) {
          const t = p.t + dt / HOLD;
          return t >= 1 ? { step: 0, t: 0 } : { step: p.step, t };
        }
        const dur = steps[p.step].ms + GAP;
        const t = p.t + dt / dur;
        return t >= 1 ? { step: p.step + 1, t: 0 } : { step: p.step, t };
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, slow, steps]);

  if (!ok) return <Diagram d={d} label={label} />;

  // Where everything is right now.
  const pos: Pt[] = items.map((it) => [it[1], it[2]]);
  const seen = new Set<number>();
  steps.forEach((s, si) => {
    if (si > prog.step) return;
    const dur = s.ms + 260;
    const within = si === prog.step ? ease(Math.min(1, (prog.t * dur) / s.ms)) : 1;
    s.moves.forEach((m) => {
      seen.add(m.who);
      pos[m.who] = [m.from[0] + (m.to[0] - m.from[0]) * within, m.from[1] + (m.to[1] - m.from[1]) * within];
    });
  });
  // Balls added for passes only appear once they are in play.
  const extra = (i: number) => i >= (d!.items.length || 0);
  const firstUse = (i: number) => steps.findIndex((s) => s.moves.some((m) => m.who === i));
  const done = prog.step >= steps.length;
  const fade = done ? Math.max(0, 1 - Math.max(0, prog.t - 0.7) / 0.3) : 1;

  const restart = () => {
    setProg({ step: 0, t: 0 });
    setPlaying(true);
  };

  return (
    <div className="adia" ref={box}>
      <svg className="dia" viewBox="0 0 100 64" role="img" aria-label={`Animated diagram: ${label}`}>
        <PitchBase full={!!d!.full} />
        {d!.arrows.map(([k, x1, y1, x2, y2], i) => {
          const si = steps.findIndex((s) => s.arrows.includes(i));
          const state = si < 0 ? "" : si === prog.step && !done ? " now" : si < prog.step ? " past" : "";
          return <line key={"a" + i} className={`d-a${k === "run" ? " d-run" : k === "drib" ? " d-drib" : ""}${state}`} x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#ah)" />;
        })}
        {/* Still things (cones, goals) first, then players, then balls on top. */}
        {items.map((it, i) => (MOVERS.has(it[0]) ? null : <DiagramItemShape key={"s" + i} it={it} />))}
        {items.map((it, i) =>
          MOVERS.has(it[0]) && it[0] !== "b" ? <DiagramItemShape key={"p" + i} it={[it[0], pos[i][0], pos[i][1], it[3]]} /> : null,
        )}
        {items.map((it, i) => {
          if (it[0] !== "b") return null;
          if (extra(i) && (prog.step < firstUse(i) || (!seen.has(i) && !done))) return null;
          return (
            <g key={"b" + i} style={{ opacity: extra(i) ? fade : 1 }}>
              <DiagramItemShape it={["b", pos[i][0], pos[i][1]]} />
            </g>
          );
        })}
      </svg>
      <div className="adia-bar">
        <button type="button" className="adia-btn" onClick={() => (done ? restart() : setPlaying(!playing))} aria-label={playing ? "Pause" : "Play"}>
          {playing && !done ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />
            </svg>
          )}
        </button>
        <div className="adia-steps" aria-hidden="true">
          {steps.map((_, i) => (
            <i key={i}>
              <b style={{ width: `${i < prog.step ? 100 : i === prog.step && !done ? Math.min(100, prog.t * 100) : 0}%` }} />
            </i>
          ))}
        </div>
        <span className="adia-n">
          {done ? "Done" : `Step ${prog.step + 1} of ${steps.length}`}
        </span>
        <button type="button" className="adia-chip" aria-pressed={slow} onClick={() => setSlow(!slow)}>
          Slow-mo
        </button>
        <button type="button" className="adia-chip" onClick={restart}>
          Replay
        </button>
      </div>
    </div>
  );
}
