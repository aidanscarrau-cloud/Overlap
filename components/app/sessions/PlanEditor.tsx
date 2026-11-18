"use client";

import { useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { Diagram, Icon } from "@/components/ui";
import { CATS } from "@/lib/constants";
import { addMins } from "@/lib/format";
import { AGE_BANDS, LIBRARY, LIBRARY_BY_KEY, THEMES, type AgeBand, type LibraryDrill, type Theme } from "@/lib/library-drills";
import type { Category, Drill, PlanItem, Team } from "@/lib/types";
import { FOCUSES, THEME_LOOK, ageOfTeam, suggest } from "../drills/DrillsHub";
import { norm, useAddDrills } from "../views/DrillLibrary";
import { PlanPeek, PlanThumb } from "./PlanPlayer";

/* The session plan editor: a timeline of drills with start times, drag to reorder, − / + minutes,
   a drill picker (club drills and the Overlap library) and a one-tap suggested session. */

const CAT_COLOUR: Record<Category, string> = { warmup: "#f97316", technical: "#3b82f6", tactical: "#a855f7", game: "#22c55e", fitness: "#ef4444", cooldown: "#14b8a6" };
// Minutes go up and down in fives (12 → 15 → 20; 12 → 10 → 5).
const short = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")}`;
};
const up5 = (m: number) => Math.min(180, Math.floor(m / 5) * 5 + 5);
const down5 = (m: number) => Math.max(1, Math.ceil(m / 5) * 5 - 5 || 1);

export function PlanSummary({ plan, start, drillMap }: { plan: PlanItem[]; start: string; drillMap: Map<string, Drill> }) {
  const total = plan.reduce((n, x) => n + (+x.mins || 0), 0);
  const cats = [...new Set(plan.map((x) => drillMap.get(x.drill_id)?.category).filter(Boolean))] as Category[];
  const to12 = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? " am" : " pm"}`;
  };
  return (
    <div className="sp-time">
      <div className="sp-time-row">
        <b>
          {total}
          <small>min</small>
        </b>
        <span>
          {to12(start)} – {to12(addMins(start, total))}
        </span>
      </div>
      <div className="sp-time-bar" aria-hidden="true">
        {plan.map((x, i) => {
          const dr = drillMap.get(x.drill_id);
          return dr ? <i key={i} style={{ flex: Math.max(1, +x.mins || 1), background: CAT_COLOUR[dr.category] }} /> : null;
        })}
        {!plan.length && <i style={{ flex: 1, background: "var(--line)" }} />}
      </div>
      {cats.length > 0 && (
        <div className="sp-time-leg">
          {cats.map((c) => (
            <span key={c}>
              <i style={{ background: CAT_COLOUR[c] }} />
              {CATS[c]} {plan.filter((x) => drillMap.get(x.drill_id)?.category === c).reduce((n, x) => n + (+x.mins || 0), 0)}′
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function PlanTimeline({ plan, start, setPlan, readOnly }: { plan: PlanItem[]; start: string; setPlan: (p: PlanItem[]) => void; readOnly?: boolean }) {
  const { drillMap, open } = useApp();
  const [peek, setPeek] = useState<number | null>(null);
  const [drag, setDrag] = useState<number | null>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const planRef = useRef(plan);
  planRef.current = plan;
  const dragRef = useRef<number | null>(null);

  const move = (from: number, to: number) => {
    if (to < 0 || to >= planRef.current.length || from === to) return;
    const p = [...planRef.current];
    const [it] = p.splice(from, 1);
    p.splice(to, 0, it);
    setPlan(p);
    planRef.current = p;
    if (peek !== null) setPeek(null);
  };
  // Drag by the handle: as the finger passes the middle of the next row, swap with it.
  function onGripDown(e: React.PointerEvent<HTMLButtonElement>, i: number) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = i;
    setDrag(i);
  }
  function onGripMove(e: React.PointerEvent<HTMLButtonElement>) {
    const i = dragRef.current;
    if (i === null) return;
    const y = e.clientY;
    const below = rows.current[i + 1]?.getBoundingClientRect();
    const above = rows.current[i - 1]?.getBoundingClientRect();
    if (below && y > below.top + below.height / 2) {
      move(i, i + 1);
      dragRef.current = i + 1;
      setDrag(i + 1);
    } else if (above && y < above.top + above.height / 2) {
      move(i, i - 1);
      dragRef.current = i - 1;
      setDrag(i - 1);
    }
  }
  const endDrag = () => {
    dragRef.current = null;
    setDrag(null);
  };

  let clock = start;
  if (!plan.length) return <div className="sp-empty">No drills yet. Add some, or let Overlap suggest a session.</div>;
  return (
    <div className="sp-tl">
      {plan.map((x, i) => {
        const dr = drillMap.get(x.drill_id);
        const st = clock;
        clock = addMins(clock, +x.mins || 0);
        if (!dr) return null;
        const colour = CAT_COLOUR[dr.category];
        const setMins = (m: number) => setPlan(plan.map((y, j) => (j === i ? { ...y, mins: m } : y)));
        return (
          <div key={`${x.drill_id}-${i}`} ref={(el) => void (rows.current[i] = el)} className={`sp-row${drag === i ? " drag" : ""}${peek === i ? " open" : ""}`} style={{ "--c": colour } as React.CSSProperties}>
            <span className="sp-at">{short(st)}</span>
            <div className="sp-card">
              <div className="sp-main">
                {!readOnly && (
                  <button
                    type="button"
                    className="sp-grip"
                    aria-label={`Move ${dr.name}: drag, or use the arrow keys`}
                    onPointerDown={(e) => onGripDown(e, i)}
                    onPointerMove={onGripMove}
                    onPointerUp={endDrag}
                    onPointerCancel={endDrag}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowUp") (e.preventDefault(), move(i, i - 1));
                      if (e.key === "ArrowDown") (e.preventDefault(), move(i, i + 1));
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="9" cy="6" r="1.4" />
                      <circle cx="15" cy="6" r="1.4" />
                      <circle cx="9" cy="12" r="1.4" />
                      <circle cx="15" cy="12" r="1.4" />
                      <circle cx="9" cy="18" r="1.4" />
                      <circle cx="15" cy="18" r="1.4" />
                    </svg>
                  </button>
                )}
                <PlanThumb drill={dr} open={peek === i} onToggle={() => setPeek(peek === i ? null : i)} />
                <button type="button" className="sp-name" onClick={() => setPeek(peek === i ? null : i)}>
                  <small style={{ color: colour }}>{CATS[dr.category]}</small>
                  <b>{dr.name}</b>
                </button>
                {readOnly ? (
                  <span className="sp-mins-ro">{x.mins}′</span>
                ) : (
                  <span className="sp-step" role="group" aria-label={`Minutes for ${dr.name}`}>
                    <button type="button" onClick={() => setMins(down5(+x.mins || 1))} aria-label="Fewer minutes">
                      −
                    </button>
                    <b>{x.mins}′</b>
                    <button type="button" onClick={() => setMins(up5(+x.mins || 0))} aria-label="More minutes">
                      +
                    </button>
                  </span>
                )}
                {!readOnly && (
                  <button type="button" className="sp-x" onClick={() => (setPeek(null), setPlan(plan.filter((_, j) => j !== i)))} aria-label={`Remove ${dr.name}`} title="Remove">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 7l10 10M17 7L7 17" />
                    </svg>
                  </button>
                )}
              </div>
              {peek === i && <PlanPeek drill={dr} onOpen={() => open({ kind: "drill", id: dr.id })} />}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ adding drills */

type Source = "club" | Theme;

export function DrillAdder({ plan, team, onAdd, onDone, compact }: { plan: PlanItem[]; team: Team | undefined; onAdd: (drills: Drill[]) => void; onDone?: () => void; compact?: boolean }) {
  const { data } = useApp();
  const { add, busy } = useAddDrills();
  const [q, setQ] = useState("");
  const [age, setAge] = useState<"all" | AgeBand>(ageOfTeam(team));
  const [src, setSrc] = useState<Source>(data.drills.length ? "club" : "warmup");
  const [added, setAdded] = useState(0);
  const inPlan = new Set(plan.map((x) => data.drills.find((d) => d.id === x.drill_id)?.name).filter(Boolean).map((n) => norm(n!)));
  const s = norm(q);
  const themes = (Object.keys(THEMES) as Theme[]).filter((t) => LIBRARY.some((d) => d.theme === t));
  const club = data.drills.filter((d) => !s || norm(d.name + " " + d.description).includes(s));
  // Searching looks through everything in the library; otherwise the chosen theme.
  const lib = LIBRARY.filter((d) => (s ? true : d.theme === src) && (age === "all" || d.ages.includes(age)) && (!s || norm(d.name + " " + d.description).includes(s)));

  async function addLib(d: LibraryDrill) {
    const ids = await add([d], { quiet: true });
    const id = ids?.get(norm(d.name));
    if (!id) return;
    const club = data.drills.find((x) => x.id === id) ?? ({ id, club_id: data.club.id, name: d.name, category: d.category, minutes: d.minutes, player_count: d.player_count, area: d.area, description: d.description, points: d.points, diagram: d.diagram } as Drill);
    onAdd([club]);
    setAdded((n) => n + 1);
  }
  const addClub = (d: Drill) => {
    onAdd([d]);
    setAdded((n) => n + 1);
  };
  const total = plan.reduce((n, x) => n + (+x.mins || 0), 0);

  const row = (key: string, name: string, diagram: Drill["diagram"], meta: string, here: boolean, act: () => void) => (
    <li key={key} className="ad-row">
      <span className="ad-pic">
        <Diagram d={diagram} label={name} />
      </span>
      <span className="ad-t">
        <b>{name}</b>
        <small>{meta}</small>
      </span>
      <button type="button" className={`ad-add${here ? " on" : ""}`} disabled={busy} onClick={act} aria-label={here ? `Add ${name} again` : `Add ${name} to the plan`}>
        {here ? "✓" : "+"}
      </button>
    </li>
  );

  return (
    <div className={`adder${compact ? " compact" : ""}`}>
      <div className="adder-h">
        <h3>Add drills</h3>
        {added > 0 && <span className="adder-n">{added} added</span>}
      </div>
      <div className="dfind">
        <label className="dsearch">
          <Icon id="i-search" />
          <input type="search" placeholder="Search drills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search drills to add" />
        </label>
        {(s || src !== "club") && (
          <select className="dage" value={age} onChange={(e) => setAge(e.target.value as "all" | AgeBand)} aria-label="Age group">
            <option value="all">All ages</option>
            {(Object.keys(AGE_BANDS) as AgeBand[]).map((a) => (
              <option key={a} value={a}>
                {AGE_BANDS[a]}
              </option>
            ))}
          </select>
        )}
      </div>
      {!s && (
        <div className="dchips" role="group" aria-label="Where from">
          <button type="button" className="chip" aria-pressed={src === "club"} onClick={() => setSrc("club")}>
            Our drills
          </button>
          {themes.map((t) => (
            <button key={t} type="button" className="chip" aria-pressed={src === t} onClick={() => setSrc(t)}>
              {THEME_LOOK[t].short}
            </button>
          ))}
        </div>
      )}
      <p className="adder-lbl">
        {s ? `Matching “${q.trim()}”` : src === "club" ? "Your club's drills" : `${THEMES[src]}${age !== "all" ? ` · ${AGE_BANDS[age]}` : ""}`}
      </p>
      <ul className="ad-list">
        {(s || src === "club") && club.map((d) => row(d.id, d.name, d.diagram, `${d.minutes} min · ${CATS[d.category]}`, inPlan.has(norm(d.name)), () => addClub(d)))}
        {(s || src !== "club") &&
          lib
            .filter((d) => !s || !club.some((c) => norm(c.name) === norm(d.name)))
            .map((d) => row(d.key, d.name, d.diagram, `${d.minutes} min · ${d.player_count}`, inPlan.has(norm(d.name)), () => addLib(d)))}
        {!((s || src === "club") && club.length) && !((s || src !== "club") && lib.length) && <li className="ad-none">Nothing here yet. Try another filter.</li>}
      </ul>
      {onDone && (
        <div className="adder-done">
          <button type="button" className="btn primary" onClick={onDone}>
            Done · {total} min planned
          </button>
        </div>
      )}
    </div>
  );
}

/** One tap: a warm-up, main practices and a game for the time left, added to the plan. */
export function SuggestPanel({ team, minutesLeft, onAdd, onClose }: { team: Team | undefined; minutesLeft: number; onAdd: (drills: Drill[]) => void; onClose: () => void }) {
  const { data } = useApp();
  const { add, busy } = useAddDrills();
  const [focus, setFocus] = useState<Theme>("pressing");
  const [mins, setMins] = useState(Math.max(30, Math.min(90, Math.round((minutesLeft || 60) / 15) * 15)));
  const [seed, setSeed] = useState(1);
  const slots = suggest(focus, ageOfTeam(team), mins, seed);
  const drills = slots.map((s) => LIBRARY_BY_KEY.get(s.key)!);
  async function use() {
    const ids = await add(drills, { quiet: true });
    if (!ids) return;
    const list = drills.map((d) => {
      const id = ids.get(norm(d.name))!;
      return data.drills.find((x) => x.id === id) ?? ({ id, club_id: data.club.id, name: d.name, category: d.category, minutes: d.minutes, player_count: d.player_count, area: d.area, description: d.description, points: d.points, diagram: d.diagram } as Drill);
    });
    onAdd(list);
    onClose();
  }
  return (
    <div className="sp-suggest">
      <div className="sp-suggest-h">
        <b>✦ Suggest a session</b>
        <button type="button" className="sp-x" onClick={onClose} aria-label="Close suggestions">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M7 7l10 10M17 7L7 17" />
          </svg>
        </button>
      </div>
      <div className="builder-pick">
        <label>
          <em>Focus</em>
          <select value={focus} onChange={(e) => setFocus(e.target.value as Theme)}>
            {FOCUSES.map((t) => (
              <option key={t} value={t}>
                {THEME_LOOK[t].short}
              </option>
            ))}
          </select>
        </label>
        <label>
          <em>Time</em>
          <select value={mins} onChange={(e) => setMins(Number(e.target.value))}>
            {[30, 45, 60, 75, 90].map((t) => (
              <option key={t} value={t}>
                {t} min
              </option>
            ))}
          </select>
        </label>
        <button type="button" className="builder-shuffle" onClick={() => setSeed((x) => x + 1)}>
          Shuffle
        </button>
      </div>
      <ol className="sp-suggest-list">
        {drills.map((d, i) => (
          <li key={i}>
            <span>{slots[i].phase}</span>
            <b>{d.name}</b>
            <em>{d.minutes}′</em>
          </li>
        ))}
      </ol>
      <button type="button" className="btn primary" disabled={busy || !drills.length} onClick={use}>
        {busy ? "Adding…" : `Add these ${drills.length} drills`}
      </button>
    </div>
  );
}
