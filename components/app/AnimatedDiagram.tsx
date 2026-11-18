"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Diagram as DiagramT, DiagramItem } from "@/lib/types";
import { Diagram } from "@/components/ui";

/*
 * Plays a drill diagram: its arrows in the order they were drawn.
 * Passes roll the ball (slowing like a real pass, spinning as it goes), runs move a player, dribbles carry the
 * ball in little touches. A run straight after a pass happens at the same time (movement off the ball).
 * Lines draw themselves as each move happens; the player about to act glows and the receiver pulses.
 * At the end it rewinds smoothly and plays again. Works for every diagram the drill designer makes.
 */

type Pt = [number, number];
type Kind = "pass" | "run" | "drib";
type Move = { who: number; from: Pt; to: Pt; kind: Kind; ball?: boolean };
type Step = { arrows: number[]; moves: Move[]; ms: number; actor: number; receiver: number; kinds: Kind[] };

const NEAR = 6.5;
const GAP = 320;
const HOLD = 1500;
const REWIND = 700;
const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const inOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const outQuad = (t: number) => 1 - (1 - t) * (1 - t);
const PLAYER = new Set(["p", "o", "n"]);

/** Works out who moves where for each step, starting from the drawn positions. */
export function plan(d: DiagramT) {
  const items: DiagramItem[] = d.items.map((it) => [...it] as DiagramItem);
  const pos: Pt[] = items.map((it) => [it[1], it[2]]);
  const isBall = (i: number) => items[i][0] === "b";
  const isPlayer = (i: number) => PLAYER.has(items[i][0]);
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
  d.arrows.forEach(([k0, x1, y1, x2, y2], ai) => {
    const k = (k0 === "run" || k0 === "drib" ? k0 : "pass") as Kind;
    const from: Pt = [x1, y1];
    const to: Pt = [x2, y2];
    const moves: Move[] = [];
    let actor = -1;
    let receiver = -1;
    if (k === "pass") {
      actor = nearest(from, isPlayer);
      const b = ballAt(from);
      moves.push({ who: b, from: [...pos[b]] as Pt, to, kind: k, ball: true });
      pos[b] = to;
    } else {
      const pl = nearest(from, isPlayer);
      if (pl >= 0) {
        actor = pl;
        const off: Pt = [pos[pl][0] - x1, pos[pl][1] - y1];
        const end: Pt = [x2 + off[0] * 0.3, y2 + off[1] * 0.3];
        moves.push({ who: pl, from: [...pos[pl]] as Pt, to: end, kind: k });
        pos[pl] = end;
      }
      if (k === "drib") {
        const b = ballAt(from);
        // The ball stays at the dribbler's feet, just ahead of them in the direction they're going.
        const L = Math.hypot(x2 - x1, y2 - y1) || 1;
        const lead = 3.2;
        const end: Pt = pl >= 0 ? [pos[pl][0] + ((x2 - x1) / L) * lead, pos[pl][1] + ((y2 - y1) / L) * lead] : to;
        const start: Pt = pl >= 0 ? [moves[0].from[0] + ((x2 - x1) / L) * lead, moves[0].from[1] + ((y2 - y1) / L) * lead] : ([...pos[b]] as Pt);
        moves.push({ who: b, from: start, to: end, kind: k, ball: true });
        pos[b] = end;
      }
    }
    if (!moves.length) return;
    const len = Math.max(...moves.map((m) => dist(m.from, m.to)));
    const ms = Math.min(2800, k === "pass" ? 420 + len * 16 : k === "drib" ? 800 + len * 34 : 650 + len * 28);
    const prev = steps[steps.length - 1];
    const prevWasPass = prev && prev.kinds.includes("pass") && prev.kinds.length === 1;
    // Off-the-ball runs go with the pass before them, unless that player is the one receiving.
    // Off the ball means not the one the pass is going to: whoever receives waits for the ball.
    const passEnd = prevWasPass ? prev.moves.find((m) => m.kind === "pass")!.to : null;
    const receiving = passEnd ? dist(moves[0].from, passEnd) < NEAR : false;
    if (k === "run" && prevWasPass && !receiving && !prev.moves.some((m) => m.who === moves[0].who)) {
      prev.arrows.push(ai);
      prev.moves.push(...moves);
      prev.kinds.push(k);
      prev.ms = Math.max(prev.ms, ms);
    } else steps.push({ arrows: [ai], moves, ms, actor, receiver, kinds: [k] });
  });
  // Who ends up with the ball after each pass: the player nearest where it stops.
  steps.forEach((s, si) => {
    const pass = s.moves.find((m) => m.kind === "pass");
    if (!pass) return;
    const end = positionsAt(items, steps, si + 1, 0);
    let best = -1;
    let bd = 9;
    end.forEach((q, i) => {
      if (!PLAYER.has(items[i][0]) || i === s.actor) return;
      const dd = dist(q, pass.to);
      if (dd < bd) {
        bd = dd;
        best = i;
      }
    });
    s.receiver = best;
    // The ball rolls right to the receiver's feet (on the side it comes from), not a step short.
    if (best >= 0 && bd < 9) {
      const r = end[best];
      const dx = pass.from[0] - r[0];
      const dy = pass.from[1] - r[1];
      const L = Math.hypot(dx, dy) || 1;
      const feet: Pt = [r[0] + (dx / L) * 3.3, r[1] + (dy / L) * 3.3];
      const old = pass.to;
      pass.to = feet;
      // Whatever happens to that ball next starts from where it now stops.
      for (const later of steps.slice(si + 1))
        for (const m of later.moves) if (m.who === pass.who && m.from[0] === old[0] && m.from[1] === old[1]) m.from = feet;
    }
  });
  return { items, steps };
}

/** Where every item is at a given step and progress. */
function positionsAt(items: DiagramItem[], steps: Step[], step: number, t: number) {
  const pos: Pt[] = items.map((it) => [it[1], it[2]]);
  steps.forEach((s, si) => {
    if (si > step) return;
    s.moves.forEach((m) => {
      let k = si < step ? 1 : Math.min(1, (t * (s.ms + GAP)) / s.ms);
      k = m.kind === "pass" ? outQuad(k) : inOut(k);
      pos[m.who] = [m.from[0] + (m.to[0] - m.from[0]) * k, m.from[1] + (m.to[1] - m.from[1]) * k];
    });
  });
  return pos;
}

const KIND_WORD: Record<Kind, string> = { pass: "Pass", run: "Run", drib: "Dribble" };

export function AnimatedDiagram({ d, label, autoPlay = true }: { d?: DiagramT | null; label: string; autoPlay?: boolean }) {
  const ok = !!d && Array.isArray(d.items) && Array.isArray(d.arrows) && d.arrows.length > 0;
  const { items, steps } = useMemo(() => (ok ? plan(d!) : { items: [] as DiagramItem[], steps: [] as Step[] }), [ok, d]);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const [playing, setPlaying] = useState(false);
  const [slow, setSlow] = useState(false);
  // step = steps.length is the pause at the end, steps.length + 1 the rewind.
  const [prog, setProg] = useState({ step: 0, t: 0 });
  const raf = useRef(0);
  const last = useRef(0);
  const box = useRef<HTMLDivElement>(null);

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
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(64, now - last.current) * (slow ? 0.45 : 1);
      last.current = now;
      setProg((p) => {
        const len = p.step < steps.length ? steps[p.step].ms + GAP : p.step === steps.length ? HOLD : REWIND;
        const t = p.t + dt / len;
        if (t < 1) return { step: p.step, t };
        return p.step >= steps.length + 1 ? { step: 0, t: 0 } : { step: p.step + 1, t: 0 };
      });
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, slow, steps]);

  if (!ok) return <Diagram d={d} label={label} />;

  const n = steps.length;
  const rewinding = prog.step === n + 1;
  const done = prog.step >= n;
  // Positions now (during the rewind: slide everything back to the start).
  let pos = positionsAt(items, steps, Math.min(prog.step, n), done ? 0 : prog.t);
  if (rewinding) {
    const k = inOut(prog.t);
    const start = items.map((it) => [it[1], it[2]] as Pt);
    pos = pos.map((p, i) => [p[0] + (start[i][0] - p[0]) * k, p[1] + (start[i][1] - p[1]) * k]);
  }
  const cur = !done ? steps[prog.step] : null;
  const local = cur ? Math.min(1, (prog.t * (cur.ms + GAP)) / cur.ms) : 1;
  const firstUse = (i: number) => steps.findIndex((s) => s.moves.some((m) => m.who === i));
  const drawnBall = (i: number) => i < d!.items.length;

  // Ball touches while dribbling: the ball runs a little ahead of the player and comes back.
  const ballPos = (i: number): Pt => {
    const p = pos[i];
    if (!cur || done) return p;
    const m = cur.moves.find((x) => x.who === i && x.kind === "drib");
    if (!m || local >= 1) return p;
    const dx = m.to[0] - m.from[0];
    const dy = m.to[1] - m.from[1];
    const L = Math.hypot(dx, dy) || 1;
    const push = Math.abs(Math.sin(local * Math.PI * Math.max(3, L / 5))) * 1.1;
    return [p[0] + (dx / L) * push, p[1] + (dy / L) * push];
  };
  // How far each ball has rolled (for its spin).
  const rolled = (i: number) => {
    const a = items[i];
    return Math.hypot(pos[i][0] - a[1], pos[i][1] - a[2]);
  };

  const caption = (() => {
    if (!cur) return rewinding ? "Again" : "Done";
    const name = (i: number) => (i >= 0 && items[i][3] ? items[i][3] : "");
    const words = [...new Set(cur.kinds)].map((k) => KIND_WORD[k]);
    const who = cur.kinds[0] === "pass" && name(cur.actor) && name(cur.receiver) ? ` ${name(cur.actor)} → ${name(cur.receiver)}` : name(cur.actor) ? ` · ${name(cur.actor)}` : "";
    return words.join(" + ") + who;
  })();

  const restart = () => {
    setProg({ step: 0, t: 0 });
    setPlaying(true);
  };
  const g = (s: string) => `${s}${uid}`;

  return (
    <div className="adia adia2" ref={box}>
      <div className="adia-stage">
        <svg className="dia" viewBox="0 0 100 64" role="img" aria-label={`Animated diagram: ${label}`}>
          <defs>
            <linearGradient id={g("grass")} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#3a9a5c" />
              <stop offset="1" stopColor="#2a7f48" />
            </linearGradient>
            <radialGradient id={g("light")} cx="50%" cy="35%" r="75%">
              <stop offset="0" stopColor="#fff" stopOpacity=".14" />
              <stop offset="1" stopColor="#000" stopOpacity=".18" />
            </radialGradient>
            <radialGradient id={g("tok")} cx="35%" cy="30%" r="75%">
              <stop offset="0" stopColor="#fff" stopOpacity=".55" />
              <stop offset=".5" stopColor="#fff" stopOpacity="0" />
            </radialGradient>
            <linearGradient id={g("cone")} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#ffb057" />
              <stop offset="1" stopColor="#e86b0c" />
            </linearGradient>
            <pattern id={g("net")} width="1.2" height="1.2" patternUnits="userSpaceOnUse">
              <path d="M0 0L1.2 1.2M1.2 0L0 1.2" stroke="#fff" strokeWidth=".12" opacity=".7" />
            </pattern>
            <marker id={g("ah")} viewBox="0 0 6 6" refX="4.6" refY="3" markerWidth="3.4" markerHeight="3.4" orient="auto">
              <path d="M0 0L6 3L0 6z" fill="#fff" />
            </marker>
            <marker id={g("ahh")} viewBox="0 0 6 6" refX="4.6" refY="3" markerWidth="3.4" markerHeight="3.4" orient="auto">
              <path d="M0 0L6 3L0 6z" fill="#ffd166" />
            </marker>
          </defs>

          {/* Pitch: mowed stripes, chalk, soft light */}
          <rect width="100" height="64" fill={`url(#${g("grass")})`} />
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((i) => (
            <rect key={i} x={i * 10} width="10" height="64" fill={i % 2 ? "#000" : "#fff"} opacity={i % 2 ? 0.05 : 0.04} />
          ))}
          <g fill="none" stroke="#f4f8f2" strokeWidth=".45" opacity=".85">
            <rect x="2" y="2" width="96" height="60" rx=".4" />
            {d!.full && (
              <>
                <line x1="50" y1="2" x2="50" y2="62" />
                <circle cx="50" cy="32" r="7" />
                <circle cx="50" cy="32" r=".5" fill="#f4f8f2" />
              </>
            )}
          </g>
          <rect width="100" height="64" fill={`url(#${g("light")})`} />

          {/* Arrows: future ones are faint guides, the current one draws itself, past ones fade */}
          {d!.arrows.map(([k, x1, y1, x2, y2], i) => {
            const si = steps.findIndex((s) => s.arrows.includes(i));
            const dash = k === "run" ? "1.5 1.1" : k === "drib" ? ".45 .65" : undefined;
            const w = k === "drib" ? 0.75 : 0.55;
            if (rewinding || si < 0 || si > prog.step || (si === prog.step && done))
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={w} strokeDasharray={dash} opacity={rewinding ? 0.12 * (1 - prog.t) + 0.12 : si < 0 ? 0.5 : done ? 0.4 : 0.16} markerEnd={`url(#${g("ah")})`} />;
            if (si < prog.step) return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={w} strokeDasharray={dash} opacity=".38" markerEnd={`url(#${g("ah")})`} />;
            const step = steps[si];
            const m = step.moves.find((x) => dist(x.kind === "pass" || x.kind === "drib" ? x.from : x.from, [x1, y1]) < NEAR + 2) ?? step.moves[0];
            const k2 = m.kind === "pass" ? outQuad(local) : inOut(local);
            const ex = x1 + (x2 - x1) * k2;
            const ey = y1 + (y2 - y1) * k2;
            return (
              <g key={i}>
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#fff" strokeWidth={w} strokeDasharray={dash} opacity=".16" />
                <line x1={x1} y1={y1} x2={ex} y2={ey} stroke="#ffd166" strokeWidth={w + 0.25} strokeDasharray={dash} strokeLinecap="round" markerEnd={local > 0.97 ? `url(#${g("ahh")})` : undefined} />
              </g>
            );
          })}

          {/* Cones and goals */}
          {items.map((it, i) => {
            const [t, x, y, l] = it;
            if (t === "c")
              return (
                <g key={"c" + i}>
                  <ellipse cx={x} cy={y + 1.25} rx="1.9" ry=".55" fill="#000" opacity=".22" />
                  <path d={`M${x - 1.55} ${y + 1.15}L${x} ${y - 1.9}L${x + 1.55} ${y + 1.15}Z`} fill={`url(#${g("cone")})`} />
                  <path d={`M${x - 0.75} ${y - 0.25}L${x + 0.75} ${y - 0.25}`} stroke="#fff" strokeWidth=".35" opacity=".85" />
                </g>
              );
            if (t === "g") {
              const gx = l === "L" ? x + 0.5 : x;
              return (
                <g key={"g" + i}>
                  <rect x={gx} y={y} width="3" height="12" fill={`url(#${g("net")})`} />
                  <rect x={gx} y={y} width="3" height="12" fill="none" stroke="#fff" strokeWidth=".6" />
                </g>
              );
            }
            return null;
          })}

          {/* Players: shadow, shaded token, label; the one acting glows, the receiver pulses */}
          {items.map((it, i) => {
            const [t, , , l] = it;
            if (!PLAYER.has(t)) return null;
            const [x, y] = pos[i];
            const fill = t === "p" ? "var(--team)" : t === "o" ? "var(--opp)" : "var(--neutral)";
            const moving = cur?.moves.some((m) => m.who === i) && local < 1;
            const bob = moving ? 1 + Math.abs(Math.sin(local * Math.PI * 7)) * 0.05 : 1;
            const acting = cur && cur.actor === i && local < 0.35;
            const receiving = cur && cur.receiver === i && local > 0.82;
            return (
              <g key={"p" + i} transform={`translate(${x} ${y}) scale(${bob})`}>
                <ellipse cx=".35" cy="1.9" rx="2.5" ry=".9" fill="#000" opacity=".25" />
                {(acting || receiving) && <circle r={receiving ? 3 + (local - 0.82) * 14 : 3.4 + Math.sin(prog.t * 20) * 0.25} fill="none" stroke="#ffd166" strokeWidth=".45" opacity={receiving ? 1 - (local - 0.82) * 5 : 0.9} />}
                <circle r="2.6" fill={fill} />
                <circle r="2.6" fill={`url(#${g("tok")})`} />
                <circle r="2.6" fill="none" stroke="#000" strokeOpacity=".45" strokeWidth=".35" />
                {l ? (
                  <text x="0" y=".05" fontSize="2.4" fontWeight="800" textAnchor="middle" dominantBaseline="central" fill="#14171a" style={{ fontFamily: "var(--body)" }}>
                    {l}
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* Balls on top, spinning as they roll */}
          {items.map((it, i) => {
            if (it[0] !== "b") return null;
            if (!drawnBall(i) && (rewinding || (!done && prog.step < firstUse(i)))) return null;
            const [x, y] = ballPos(i);
            const spin = rolled(i) * 60;
            return (
              <g key={"b" + i} transform={`translate(${x} ${y})`}>
                <ellipse cx=".3" cy=".95" rx="1.15" ry=".45" fill="#000" opacity=".3" />
                <circle r="1.15" fill="#fff" stroke="#1a1a1a" strokeWidth=".22" />
                <g transform={`rotate(${spin})`}>
                  <path d="M0 -.42L.4 -.13L.25 .34L-.25 .34L-.4 -.13Z" fill="#1a1a1a" />
                  <path d="M0 -1.12L.28 -.82M.95 -.4L.62 -.2M.7 .9L.4 .5M-.7 .9L-.4 .5M-.95 -.4L-.62 -.2" stroke="#1a1a1a" strokeWidth=".2" />
                </g>
              </g>
            );
          })}
        </svg>
        <span className={`adia-cap${cur ? " on" : ""}`} aria-live="polite">
          {cur && <b>{prog.step + 1}</b>}
          {caption}
        </span>
      </div>
      <div className="adia-bar">
        <button type="button" className="adia-btn" onClick={() => (done ? restart() : setPlaying(!playing))} aria-label={playing && !done ? "Pause" : "Play"}>
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
              <b style={{ width: `${i < prog.step ? 100 : i === prog.step ? Math.min(100, prog.t * 100) : 0}%` }} />
            </i>
          ))}
        </div>
        <span className="adia-n">{done ? "Done" : `Step ${prog.step + 1} of ${n}`}</span>
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
