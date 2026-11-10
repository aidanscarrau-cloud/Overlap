"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DiagramItemShape, PitchBase } from "@/components/ui";
import type { Diagram, DiagramArrow, DiagramItem } from "@/lib/types";

type Tool = "move" | "erase" | "p" | "o" | "n" | "c" | "b" | "g" | "pass" | "run" | "drib";
type Sel = { k: "i" | "a"; i: number } | null;
type Drag =
  | { type: "i"; i: number; dx: number; dy: number; snap: Diagram; moved?: boolean }
  | { type: "a"; i: number; x0: number; y0: number; o: DiagramArrow; snap: Diagram; moved?: boolean }
  | { type: "h"; w: 1 | 2; snap: Diagram; moved?: boolean }
  | { type: "draw"; k: string; x1: number; y1: number; x2: number; y2: number };

const TOOLS: ([Tool, string] | null)[] = [
  ["move", "Move & select"],
  ["erase", "Eraser"],
  null,
  ["p", "Your player"],
  ["o", "Opponent"],
  ["n", "Neutral / coach"],
  ["c", "Cone"],
  ["b", "Ball"],
  ["g", "Goal"],
  null,
  ["pass", "Pass arrow"],
  ["run", "Run arrow"],
  ["drib", "Dribble arrow"],
];
const HINT: Record<Tool, string> = {
  move: "Drag anything to move it. Click a player or arrow to label, change or delete it.",
  erase: "Click anything on the pitch to remove it.",
  p: "Click the pitch to place your players.",
  o: "Click the pitch to place opponents.",
  n: "Click to place neutral players or a coach.",
  c: "Click to place cones.",
  b: "Click to place a ball.",
  g: "Click to place a goal. Goals in the left half face left.",
  pass: "Press and drag on the pitch to draw a pass.",
  run: "Press and drag to draw a run off the ball.",
  drib: "Press and drag to draw a dribble.",
};
const ITEM_NAME: Record<string, string> = { p: "Your player", o: "Opponent", n: "Neutral / coach", c: "Cone", b: "Ball", g: "Goal" };

function ToolIcon({ k }: { k: Tool | "undo" | "clear" }) {
  const s = { fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;
  const head = <path d="M11.5 5.5h7v7" fill="none" stroke="currentColor" strokeWidth="2" />;
  const icons: Record<string, React.ReactNode> = {
    move: <path d="M6 3l12 7.5-5.6 1.4L9.6 18z" fill="currentColor" />,
    erase: (
      <>
        <path d="M3.5 15.5l9-9 6 6-6.5 6.5H8z M9 10l6 6" {...s} strokeLinejoin="round" />
        <path d="M12 19h8" {...s} strokeLinecap="round" />
      </>
    ),
    p: <circle cx="12" cy="12" r="7" className="d-p" style={{ strokeWidth: 1.2 }} />,
    o: <circle cx="12" cy="12" r="7" className="d-o" style={{ strokeWidth: 1.2 }} />,
    n: <circle cx="12" cy="12" r="7" className="d-n" style={{ strokeWidth: 1.2 }} />,
    c: <polygon points="12,4 19.5,18.5 4.5,18.5" className="d-c" />,
    b: (
      <>
        <circle cx="12" cy="12" r="6.5" fill="#fff" stroke="currentColor" strokeWidth="1.6" />
        <path d="M12 8.6l3 2.2-1.1 3.5h-3.8L9 10.8z" fill="currentColor" />
      </>
    ),
    g: (
      <>
        <path d="M4 19V6h16v13" {...s} />
        <path d="M8 6v13M12 6v13M16 6v13M4 10.5h16M4 15h16" stroke="currentColor" strokeWidth=".8" opacity=".6" />
      </>
    ),
    pass: (
      <>
        <path d="M4.5 19.5L18 6" stroke="currentColor" strokeWidth="2" />
        {head}
      </>
    ),
    run: (
      <>
        <path d="M4.5 19.5L18 6" stroke="currentColor" strokeWidth="2" strokeDasharray="3 2.4" />
        {head}
      </>
    ),
    drib: (
      <>
        <path d="M4.5 19.5L18 6" stroke="currentColor" strokeWidth="2.6" strokeDasharray=".5 2.6" strokeLinecap="round" />
        {head}
      </>
    ),
    undo: (
      <>
        <path d="M9 5L4 10l5 5" {...s} strokeLinecap="round" strokeLinejoin="round" />
        <path d="M4 10h10a5 5 0 0 1 0 10h-3" {...s} strokeLinecap="round" />
      </>
    ),
    clear: <path d="M5 7h14M10 7V4.5h4V7M7 7l1 13h8l1-13" {...s} strokeLinejoin="round" />,
  };
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {icons[k]}
    </svg>
  );
}

const clampN = (v: number, lo: number, hi: number) => Math.round(Math.min(hi, Math.max(lo, v)) * 2) / 2;
const copy = (d: Diagram): Diagram => JSON.parse(JSON.stringify(d));

/** Drag-and-drop pitch editor. Calls onChange with the full diagram after every change. */
export function DrillDesigner({ initial, onChange, startTool = "move" }: { initial: Diagram; onChange: (d: Diagram) => void; startTool?: Tool }) {
  const [dia, setDia] = useState<Diagram>(() => ({ items: initial.items ?? [], arrows: initial.arrows ?? [], full: !!initial.full }));
  const [tool, setTool] = useState<Tool>(startTool);
  const [sel, setSel] = useState<Sel>(null);
  const [preview, setPreview] = useState<Extract<Drag, { type: "draw" }> | null>(null);
  const undo = useRef<Diagram[]>([]);
  const drag = useRef<Drag | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const diaRef = useRef(dia);
  diaRef.current = dia;

  const commit = useCallback(
    (next: Diagram) => {
      setDia(next);
      onChange(next);
    },
    [onChange],
  );
  const push = (snap?: Diagram) => {
    undo.current.push(snap ?? copy(diaRef.current));
    if (undo.current.length > 60) undo.current.shift();
  };
  const doUndo = useCallback(() => {
    const prev = undo.current.pop();
    if (prev) {
      setSel(null);
      commit(prev);
    }
  }, [commit]);
  const doDelete = useCallback(() => {
    if (!sel) return;
    push();
    const n = copy(diaRef.current);
    (sel.k === "i" ? n.items : n.arrows).splice(sel.i, 1);
    setSel(null);
    commit(n);
  }, [sel, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(tag)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) {
        e.preventDefault();
        doDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        doUndo();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sel, doDelete, doUndo]);

  const pt = (e: React.PointerEvent) => {
    const svg = svgRef.current!;
    const p = svg.createSVGPoint();
    p.x = e.clientX;
    p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM()!.inverse());
    return { x: clampN(q.x, 1, 99), y: clampN(q.y, 1, 63) };
  };

  function onDown(e: React.PointerEvent<SVGSVGElement>) {
    if (e.button > 0) return;
    e.preventDefault();
    const p = pt(e);
    const t = e.target as Element;
    const h = t.closest("[data-h]") as HTMLElement | null;
    const gi = t.closest("[data-i]") as HTMLElement | null;
    const ga = t.closest("[data-a]") as HTMLElement | null;
    const d = diaRef.current;
    if (tool === "move") {
      const snap = copy(d);
      if (h && sel?.k === "a") drag.current = { type: "h", w: +h.dataset.h! as 1 | 2, snap };
      else if (gi) {
        const i = +gi.dataset.i!;
        setSel({ k: "i", i });
        drag.current = { type: "i", i, dx: p.x - d.items[i][1], dy: p.y - d.items[i][2], snap };
      } else if (ga) {
        const i = +ga.dataset.a!;
        setSel({ k: "a", i });
        drag.current = { type: "a", i, x0: p.x, y0: p.y, o: [...d.arrows[i]] as DiagramArrow, snap };
      } else setSel(null);
    } else if (tool === "erase") {
      if (gi || ga) {
        push();
        const n = copy(d);
        if (gi) n.items.splice(+gi.dataset.i!, 1);
        else n.arrows.splice(+ga!.dataset.a!, 1);
        commit(n);
      }
      setSel(null);
    } else if (tool === "pass" || tool === "run" || tool === "drib") {
      drag.current = { type: "draw", k: tool, x1: p.x, y1: p.y, x2: p.x, y2: p.y };
      setPreview(drag.current);
    } else {
      push();
      const n = copy(d);
      const it: DiagramItem = tool === "g" ? ["g", clampN(p.x - 1.5, 0, 96), clampN(p.y - 6, 1, 51)] : [tool, p.x, p.y];
      if (tool === "g" && p.x < 50) it[3] = "L";
      n.items.push(it);
      setSel({ k: "i", i: n.items.length - 1 });
      commit(n);
    }
    if (drag.current) {
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {}
    }
  }

  function onMove(e: React.PointerEvent<SVGSVGElement>) {
    const g = drag.current;
    if (!g) return;
    const p = pt(e);
    if (g.type === "draw") {
      g.x2 = p.x;
      g.y2 = p.y;
      setPreview({ ...g });
      return;
    }
    if (!g.moved) {
      g.moved = true;
      push(g.snap);
    }
    const n = copy(diaRef.current);
    if (g.type === "i") {
      n.items[g.i][1] = clampN(p.x - g.dx, 0, 99);
      n.items[g.i][2] = clampN(p.y - g.dy, 0, 63);
    } else if (g.type === "a") {
      const dx = p.x - g.x0,
        dy = p.y - g.y0;
      n.arrows[g.i] = [g.o[0], g.o[1] + dx, g.o[2] + dy, g.o[3] + dx, g.o[4] + dy];
    } else if (g.type === "h" && sel?.k === "a") {
      const a = n.arrows[sel.i];
      if (g.w === 1) {
        a[1] = p.x;
        a[2] = p.y;
      } else {
        a[3] = p.x;
        a[4] = p.y;
      }
    }
    commit(n);
  }

  function onUp() {
    const g = drag.current;
    drag.current = null;
    if (g?.type === "draw") {
      setPreview(null);
      if (Math.hypot(g.x2 - g.x1, g.y2 - g.y1) >= 3) {
        push();
        const n = copy(diaRef.current);
        n.arrows.push([g.k, g.x1, g.y1, g.x2, g.y2]);
        setSel({ k: "a", i: n.arrows.length - 1 });
        commit(n);
      }
    }
  }

  const edit = (fn: (n: Diagram) => void) => {
    push();
    const n = copy(diaRef.current);
    fn(n);
    commit(n);
  };
  const lineCls = (k: string) => `d-a${k === "run" ? " d-run" : k === "drib" ? " d-drib" : ""}`;
  const selItem = sel?.k === "i" ? dia.items[sel.i] : null;
  const selArrow = sel?.k === "a" ? dia.arrows[sel.i] : null;

  return (
    <div className="des">
      <div className="des-tools" role="toolbar" aria-label="Diagram tools">
        {splitGroups(TOOLS).map((grp, gi) => (
          <div className="tgroup" key={gi}>
            {grp.map(([k, label]) => (
              <button
                key={k}
                type="button"
                className="tool"
                aria-pressed={tool === k}
                aria-label={label}
                title={label}
                onClick={() => {
                  setTool(k);
                  if (k !== "move") setSel(null);
                }}
              >
                <ToolIcon k={k} />
              </button>
            ))}
          </div>
        ))}
        <div className="tgroup">
          <button type="button" className="tool" aria-label="Undo" title="Undo (Ctrl+Z)" onClick={doUndo}>
            <ToolIcon k="undo" />
          </button>
          <button
            type="button"
            className="tool"
            aria-label="Clear pitch"
            title="Clear pitch"
            onClick={() => {
              if (!dia.items.length && !dia.arrows.length) return;
              setSel(null);
              edit((n) => {
                n.items = [];
                n.arrows = [];
              });
            }}
          >
            <ToolIcon k="clear" />
          </button>
        </div>
      </div>
      <div className="des-canvas" data-tool={tool}>
        <svg ref={svgRef} viewBox="0 0 100 64" aria-label="Drill diagram editor" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
          <PitchBase full={!!dia.full} />
          {dia.arrows.map((a, i) => {
            const on = sel?.k === "a" && sel.i === i;
            const c = { x1: a[1], y1: a[2], x2: a[3], y2: a[4] };
            return (
              <g key={"a" + i} data-a={i}>
                {on && <line className="sel-line" {...c} />}
                <line className={lineCls(a[0])} {...c} markerEnd="url(#ah)" />
                <line className="hit-l" {...c} />
              </g>
            );
          })}
          {dia.items.map((it, i) => {
            const [t, x, y] = it;
            const on = sel?.k === "i" && sel.i === i;
            return (
              <g key={"i" + i} data-i={i}>
                {on && (t === "g" ? <rect className="sel-ring" x={x - 1} y={y - 1} width="5.5" height="14" /> : <circle className="sel-ring" cx={x} cy={y} r={t === "b" ? 2.2 : 3.6} />)}
                <DiagramItemShape it={it} />
                {t === "g" ? <rect className="hit" x={x - 1} y={y - 1} width="5.5" height="14" /> : <circle className="hit" cx={x} cy={y} r={t === "b" ? 2.6 : 3.6} />}
              </g>
            );
          })}
          {selArrow &&
            ([
              [1, selArrow[1], selArrow[2]],
              [2, selArrow[3], selArrow[4]],
            ] as const).map(([w, x, y]) => (
              <g key={"h" + w}>
                <circle className="handle" cx={x} cy={y} r="1.3" />
                <circle className="handle-hit" data-h={w} cx={x} cy={y} r="3.4" />
              </g>
            ))}
          {preview && <line className={lineCls(preview.k)} x1={preview.x1} y1={preview.y1} x2={preview.x2} y2={preview.y2} markerEnd="url(#ah)" opacity=".75" />}
        </svg>
      </div>
      <div className="des-bar">
        <span className="muted">{HINT[tool]}</span>
        <button type="button" className="chip" aria-pressed={!!dia.full} onClick={() => edit((n) => (n.full = !n.full))}>
          Halfway line
        </button>
      </div>
      {selItem && (
        <div className="insp">
          <b>{ITEM_NAME[selItem[0]]}</b>
          {["p", "o", "n"].includes(selItem[0]) && (
            <label className="insp-f">
              Label
              <input
                className="input"
                id="des-label"
                maxLength={3}
                placeholder="e.g. GK"
                value={selItem[3] ?? ""}
                onFocus={() => push()}
                onChange={(e) => {
                  const n = copy(diaRef.current);
                  const v = e.target.value.trim();
                  if (v) n.items[sel!.i][3] = v;
                  else n.items[sel!.i].length = 3;
                  commit(n);
                }}
              />
            </label>
          )}
          {selItem[0] === "g" && (
            <button type="button" className="btn sm" onClick={() => edit((n) => (n.items[sel!.i][3] === "L" ? (n.items[sel!.i].length = 3) : (n.items[sel!.i][3] = "L")))}>
              Flip direction
            </button>
          )}
          <button type="button" className="btn sm danger" onClick={doDelete}>
            Delete
          </button>
        </div>
      )}
      {selArrow && (
        <div className="insp">
          <b>Arrow</b>
          <span className="chips">
            {(
              [
                ["pass", "Pass"],
                ["run", "Run"],
                ["drib", "Dribble"],
              ] as const
            ).map(([k, l]) => (
              <button key={k} type="button" className="chip" aria-pressed={selArrow[0] === k} onClick={() => edit((n) => (n.arrows[sel!.i][0] = k))}>
                {l}
              </button>
            ))}
          </span>
          <button
            type="button"
            className="btn sm"
            onClick={() =>
              edit((n) => {
                const a = n.arrows[sel!.i];
                n.arrows[sel!.i] = [a[0], a[3], a[4], a[1], a[2]];
              })
            }
          >
            Reverse
          </button>
          <button type="button" className="btn sm danger" onClick={doDelete}>
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

function splitGroups(list: ([Tool, string] | null)[]) {
  const out: [Tool, string][][] = [[]];
  list.forEach((t) => (t ? out[out.length - 1].push(t) : out.push([])));
  return out;
}
