"use client";

import { useRef, useState } from "react";
import type { Drawing, Shape } from "@/lib/analysis";

/* Drawing on a paused frame (telestration): arrows for runs and passes, circles for players, zones for
 * spaces, a spotlight, and freehand. Shapes are stored in 0–1 coordinates so they fit any screen size. */

const W = 1000,
  H = 562.5;
const COLOURS = ["#ffd400", "#ffffff", "#ff3b3b", "#22d3ee"];
const TOOLS: { key: Shape["type"]; label: string }[] = [
  { key: "arrow", label: "Arrow" },
  { key: "line", label: "Line" },
  { key: "circle", label: "Circle" },
  { key: "zone", label: "Zone" },
  { key: "spot", label: "Spotlight" },
  { key: "free", label: "Pen" },
];

export function Shapes({ shapes }: { shapes: Shape[] }) {
  const spots = shapes.filter((s) => s.type === "spot");
  return (
    <svg className="tl-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <marker id="tl-head" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
          <path d="M0,0 L10,5 L0,10 z" fill="context-stroke" />
        </marker>
        {spots.length > 0 && (
          <mask id="tl-mask">
            <rect width={W} height={H} fill="white" />
            {spots.map((s, i) => {
              const [a, b] = s.pts;
              return <ellipse key={i} cx={a[0] * W} cy={a[1] * H} rx={Math.max(20, Math.abs(b[0] - a[0]) * W)} ry={Math.max(20, Math.abs(b[0] - a[0]) * W) * 0.55} fill="black" />;
            })}
          </mask>
        )}
      </defs>
      {spots.length > 0 && <rect width={W} height={H} fill="rgba(0,0,0,.55)" mask="url(#tl-mask)" />}
      {shapes.map((s, i) => {
        const p = s.pts.map(([x, y]) => [x * W, y * H] as const);
        const common = { stroke: s.color, strokeWidth: 5, fill: "none", strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
        if (s.type === "arrow" || s.type === "line") return <line key={i} x1={p[0][0]} y1={p[0][1]} x2={p[1][0]} y2={p[1][1]} {...common} markerEnd={s.type === "arrow" ? "url(#tl-head)" : undefined} strokeDasharray={s.type === "line" ? "14 10" : undefined} />;
        if (s.type === "circle") {
          const r = Math.hypot(p[1][0] - p[0][0], p[1][1] - p[0][1]);
          return <ellipse key={i} cx={p[0][0]} cy={p[0][1]} rx={r} ry={r * 0.45} {...common} />;
        }
        if (s.type === "zone") {
          const x = Math.min(p[0][0], p[1][0]),
            y = Math.min(p[0][1], p[1][1]);
          return <rect key={i} x={x} y={y} width={Math.abs(p[1][0] - p[0][0])} height={Math.abs(p[1][1] - p[0][1])} {...common} fill={s.color} fillOpacity={0.18} />;
        }
        if (s.type === "spot") {
          const [a, b] = p;
          const r = Math.max(20, Math.abs(b[0] - a[0]));
          return <ellipse key={i} cx={a[0]} cy={a[1]} rx={r} ry={r * 0.55} {...common} strokeWidth={3} />;
        }
        return <polyline key={i} points={p.map(([x, y]) => `${x},${y}`).join(" ")} {...common} />;
      })}
    </svg>
  );
}

export function Telestrator({ initial, at, onSave, onCancel }: { initial?: Drawing | null; at: number; onSave: (d: Drawing) => void; onCancel: () => void }) {
  const [shapes, setShapes] = useState<Shape[]>(initial?.shapes ?? []);
  const [tool, setTool] = useState<Shape["type"]>("arrow");
  const [colour, setColour] = useState(COLOURS[0]);
  const [hold, setHold] = useState(initial?.hold ?? 4);
  const [draft, setDraft] = useState<Shape | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const pt = (e: React.PointerEvent): [number, number] => {
    const r = box.current!.getBoundingClientRect();
    return [Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (e.clientY - r.top) / r.height))];
  };
  return (
    <div className="tl">
      <div
        ref={box}
        className="tl-pad"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          const p = pt(e);
          setDraft({ type: tool, pts: [p, p], color: colour });
        }}
        onPointerMove={(e) => {
          if (!draft) return;
          const p = pt(e);
          setDraft(draft.type === "free" ? { ...draft, pts: [...draft.pts, p].slice(-400) } : { ...draft, pts: [draft.pts[0], p] });
        }}
        onPointerUp={() => {
          if (draft) {
            const [a, b] = draft.pts;
            const moved = draft.pts.length > 2 || Math.hypot(b[0] - a[0], b[1] - a[1]) > 0.01;
            if (moved || draft.type === "spot") setShapes((s) => [...s, draft].slice(0, 30));
          }
          setDraft(null);
        }}
      >
        <Shapes shapes={draft ? [...shapes, draft] : shapes} />
      </div>
      <div className="tl-bar" role="toolbar" aria-label="Drawing tools">
        {TOOLS.map((t) => (
          <button key={t.key} type="button" aria-pressed={tool === t.key} onClick={() => setTool(t.key)}>
            {t.label}
          </button>
        ))}
        <span className="tl-sep" />
        {COLOURS.map((c) => (
          <button key={c} type="button" className="tl-col" aria-pressed={colour === c} style={{ background: c }} aria-label={`Colour ${c}`} onClick={() => setColour(c)} />
        ))}
        <span className="tl-sep" />
        <label className="tl-hold">
          Pause for
          <select value={hold} onChange={(e) => setHold(Number(e.target.value))}>
            {[2, 3, 4, 6, 8, 0].map((n) => (
              <option key={n} value={n}>
                {n ? `${n} s` : "until clicked"}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => setShapes((s) => s.slice(0, -1))} disabled={!shapes.length}>
          Undo
        </button>
        <button type="button" onClick={() => setShapes([])} disabled={!shapes.length}>
          Clear
        </button>
        <span className="spacer" />
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="tl-save" onClick={() => onSave({ at, hold, shapes })}>
          Save drawing
        </button>
      </div>
    </div>
  );
}
