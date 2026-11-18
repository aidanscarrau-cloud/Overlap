"use client";

import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Diagram, Icon } from "@/components/ui";
import { CATS } from "@/lib/constants";
import { errMsg, fmtDay, fmtMon, fmtNum, todayIso } from "@/lib/format";
import { AGE_BANDS, LIBRARY, LIBRARY_BY_KEY, THEMES, type AgeBand, type LibraryDrill, type Theme } from "@/lib/library-drills";
import type { Category, Diagram as DiagramT, Team } from "@/lib/types";
import { norm, useAddDrills } from "../views/DrillLibrary";
import { purposeOf } from "./DrillParts";

/* ------------------------------------------------------------------ themes */

export const THEME_LOOK: Record<Theme, { short: string; tile: string; colour: string }> = {
  warmup: { short: "Warm-ups", tile: "WU", colour: "#f97316" },
  passing: { short: "Passing", tile: "PA", colour: "#3b82f6" },
  "1v1": { short: "1v1", tile: "1v1", colour: "#0ea5e9" },
  possession: { short: "Rondos", tile: "RO", colour: "#8b5cf6" },
  pressing: { short: "Pressing", tile: "PR", colour: "#ef4444" },
  transition: { short: "Transition", tile: "TR", colour: "#f59e0b" },
  buildup: { short: "Build-up", tile: "BU", colour: "#06b6d4" },
  final3rd: { short: "Final third", tile: "F3", colour: "#22c55e" },
  finishing: { short: "Finishing", tile: "GO", colour: "#eab308" },
  games: { short: "Games", tile: "GM", colour: "#14b8a6" },
};
export const FOCUSES = (Object.keys(THEMES) as Theme[]).filter((t) => t !== "warmup" && t !== "games");
const TIMES = [45, 60, 75, 90];

/** U-number in a team name → the library's age band. */
export function ageOfTeam(team: Team | null | undefined): "all" | AgeBand {
  const m = team?.name.match(/\bU\s?(\d{1,2})\b/i);
  if (!m) return "all";
  const n = Number(m[1]);
  return n <= 11 ? "young" : n <= 16 ? "youth" : "senior";
}

/* ------------------------------------------------------------------ the session builder */

export type Phase = "Warm-up" | "Main" | "Game";
export type Slot = { phase: Phase; key: string; pool: string[] };
const PHASE_COLOUR: Record<Phase, string> = { "Warm-up": "#f97316", Main: "#8b5cf6", Game: "#22c55e" };

// Small seeded shuffle so "Shuffle" gives a new mix but the same inputs give the same plan.
function shuffled<T>(list: T[], seed: number) {
  const a = [...list];
  let x = (seed * 9301 + 49297) % 233280 || 7;
  for (let i = a.length - 1; i > 0; i--) {
    x = (x * 9301 + 49297) % 233280;
    const j = Math.floor((x / 233280) * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function suggest(focus: Theme, age: "all" | AgeBand, mins: number, seed: number): Slot[] {
  const fits = (d: LibraryDrill) => age === "all" || d.ages.includes(age);
  const pool = (t: Theme) => shuffled(LIBRARY.filter((d) => d.theme === t && fits(d)), seed + t.length).map((d) => d.key);
  const warm = pool("warmup");
  const game = pool("games");
  const main = pool(focus);
  const slots: Slot[] = [];
  if (warm[0]) slots.push({ phase: "Warm-up", key: warm[0], pool: warm });
  const used = (warm[0] ? LIBRARY_BY_KEY.get(warm[0])!.minutes : 0) + (game[0] ? LIBRARY_BY_KEY.get(game[0])!.minutes : 0);
  let left = mins - used;
  for (const k of main) {
    const m = LIBRARY_BY_KEY.get(k)!.minutes;
    const count = slots.filter((s) => s.phase === "Main").length;
    if (count >= 1 && (left - m < -4 || count >= 4)) break;
    slots.push({ phase: "Main", key: k, pool: main });
    left -= m;
  }
  if (game[0]) slots.push({ phase: "Game", key: game[0], pool: game });
  return slots;
}

export function SessionBuilder() {
  const { team, sessionsOf, canDo, can, supabase, toast, refresh, open, patch } = useApp();
  const [focus, setFocus] = useState<Theme>("pressing");
  const [age, setAge] = useState<"all" | AgeBand>(ageOfTeam(team));
  const [mins, setMins] = useState(60);
  const [seed, setSeed] = useState(1);
  const [swaps, setSwaps] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const { add } = useAddDrills();
  const upcoming = sessionsOf().filter((s) => s.date >= todayIso());
  const [target, setTarget] = useState<string>("");
  const base = useMemo(() => suggest(focus, age, mins, seed), [focus, age, mins, seed]);
  const slots = base.map((s, i) => (swaps[i] ? { ...s, key: swaps[i] } : s));
  const drills = slots.map((s) => LIBRARY_BY_KEY.get(s.key)!);
  const total = drills.reduce((n, d) => n + d.minutes, 0);
  const canPlan = !!team && canDo("sessions.edit", team.id) && can("drills.edit");
  const session = upcoming.find((s) => s.id === target) ?? upcoming[0];

  const reset = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSwaps({});
  };
  function swap(i: number) {
    const s = slots[i];
    const taken = new Set(slots.map((x) => x.key));
    const from = s.pool.indexOf(s.key);
    for (let n = 1; n <= s.pool.length; n++) {
      const k = s.pool[(from + n) % s.pool.length];
      if (!taken.has(k)) return setSwaps((w) => ({ ...w, [i]: k }));
    }
    toast("No other drill fits here. Try another age or focus.");
  }

  async function use() {
    if (!session || !drills.length) return;
    setBusy(true);
    const ids = await add(drills, { quiet: true });
    if (!ids) return setBusy(false);
    const items = drills.map((d) => ({ drill_id: ids.get(norm(d.name))!, mins: d.minutes })).filter((x) => x.drill_id);
    const plan = [...session.plan, ...items];
    const { error } = await supabase.from("sessions").update({ plan }).eq("id", session.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, sessions: x.sessions.map((s) => (s.id === session.id ? { ...s, plan } : s)) }));
    toast(`${items.length} drills added to ${fmtDay(session.date)} ${fmtNum(session.date)} ${fmtMon(session.date)}`);
    refresh();
    open({ kind: "session", id: session.id });
  }

  if (!team) return null;
  return (
    <section className="builder" aria-label="Build a session">
      <div className="builder-h">
        <span className="builder-kick">✦ Build a session</span>
        <button type="button" className="builder-shuffle" onClick={() => (setSeed((x) => x + 1), setSwaps({}))} aria-label="Suggest a different mix">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h3.5c2 0 3.2 1 4.5 3l1 1.6c1.3 2 2.5 3.4 4.5 3.4H20M17 12l3 3-3 3M4 17h3.5c1.3 0 2.2-.4 3-1.2M13.5 8.2c.8-.8 1.7-1.2 3-1.2H20M17 4l3 3-3 3" />
          </svg>
          Shuffle
        </button>
      </div>
      <div className="builder-pick">
        <label>
          <em>Focus</em>
          <select value={focus} onChange={(e) => reset(setFocus)(e.target.value as Theme)}>
            {FOCUSES.map((t) => (
              <option key={t} value={t}>
                {THEME_LOOK[t].short}
              </option>
            ))}
          </select>
        </label>
        <label>
          <em>Age</em>
          <select value={age} onChange={(e) => reset(setAge)(e.target.value as "all" | AgeBand)}>
            <option value="all">Any</option>
            {(Object.keys(AGE_BANDS) as AgeBand[]).map((a) => (
              <option key={a} value={a}>
                {AGE_BANDS[a]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <em>Time</em>
          <select value={mins} onChange={(e) => reset(setMins)(Number(e.target.value))}>
            {TIMES.map((t) => (
              <option key={t} value={t}>
                {t} min
              </option>
            ))}
          </select>
        </label>
      </div>
      {drills.length ? (
        <>
          <div className="builder-bar" aria-hidden="true">
            {slots.map((s, i) => (
              <i key={i} style={{ flex: drills[i].minutes, background: PHASE_COLOUR[s.phase] }}>
                {drills[i].minutes}′
              </i>
            ))}
          </div>
          <ol className="builder-list">
            {slots.map((s, i) => {
              const d = drills[i];
              return (
                <li key={i}>
                  <span className="builder-n">{i + 1}</span>
                  <button type="button" className="builder-open" onClick={() => open({ kind: "library-drill", key: d.key })}>
                    <span className="builder-pic">
                      <Diagram d={d.diagram} label={d.name} />
                    </span>
                    <span className="builder-t">
                      <small style={{ color: PHASE_COLOUR[s.phase] }}>{s.phase}</small>
                      <b>{d.name}</b>
                      <span>{d.minutes} min · {d.player_count}</span>
                    </span>
                  </button>
                  <button type="button" className="builder-swap" onClick={() => swap(i)} aria-label={`Swap ${d.name} for another ${s.phase.toLowerCase()} drill`} title="Swap">
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M7 7h11l-3-3M17 17H6l3 3" />
                    </svg>
                  </button>
                </li>
              );
            })}
          </ol>
          <p className="builder-sum">
            <b>{total} min</b> · {drills.length} drills · {THEMES[focus].toLowerCase()}
          </p>
          {canPlan &&
            (upcoming.length ? (
              <div className="builder-go">
                <select value={session?.id} onChange={(e) => setTarget(e.target.value)} aria-label="Session to add to">
                  {upcoming.slice(0, 12).map((x) => (
                    <option key={x.id} value={x.id}>
                      {fmtDay(x.date)} {fmtNum(x.date)} {fmtMon(x.date)} · {x.title || "Training"}
                      {x.plan.length ? ` (${x.plan.length} drills already)` : ""}
                    </option>
                  ))}
                </select>
                <button type="button" className="btn primary" disabled={busy} onClick={use}>
                  {busy ? "Adding…" : `Add to ${session ? fmtDay(session.date) : ""}'s session`}
                </button>
              </div>
            ) : (
              <button type="button" className="btn primary builder-new" onClick={() => open({ kind: "session", id: null })}>
                Plan a session first
              </button>
            ))}
        </>
      ) : (
        <p className="builder-sum">No drills fit that age and focus yet. Try &ldquo;Any&rdquo; age.</p>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ the list */

export function DrillRow({
  name,
  diagram,
  category,
  label,
  colour,
  minutes,
  purpose,
  onOpen,
  action,
}: {
  name: string;
  diagram: DiagramT;
  category: Category;
  label: string;
  colour?: string;
  minutes: number;
  purpose: string;
  onOpen: () => void;
  action?: React.ReactNode;
}) {
  return (
    <li className="drow">
      <button type="button" className="drow-open" onClick={onOpen}>
        <span className="drow-pic">
          <Diagram d={diagram} label={name} />
        </span>
        <span className="drow-t">
          <b>{name}</b>
          <span className="drow-p">{purpose}</span>
          <span className="drow-m">
            <span className="cat-tag" data-cat={category} style={colour ? ({ "--cc": colour } as React.CSSProperties) : undefined}>
              {label}
            </span>
            <span>{minutes} min</span>
          </span>
        </span>
      </button>
      {action && <span className="drow-act">{action}</span>}
    </li>
  );
}

export function BrowseDrills() {
  const { data, team, can, open } = useApp();
  const canEdit = can("drills.edit");
  const [source, setSource] = useState<"library" | "club">("library");
  const [theme, setTheme] = useState<"all" | Theme>("all");
  const [age, setAge] = useState<"all" | AgeBand>(ageOfTeam(team));
  const [q, setQ] = useState("");
  const { have, add, busy } = useAddDrills();
  const s = norm(q);
  const lib = LIBRARY.filter(
    (d) => (theme === "all" || d.theme === theme) && (age === "all" || d.ages.includes(age)) && (!s || norm(d.name + " " + d.description + " " + d.points.join(" ")).includes(s)),
  );
  const club = data.drills.filter((d) => !s || norm(d.name + " " + d.description).includes(s));
  const themes = (Object.keys(THEMES) as Theme[]).filter((t) => LIBRARY.some((d) => d.theme === t));

  return (
    <section className="browse" aria-label="Browse drills">
      <div className="browse-h">
        <h2>Browse drills</h2>
        <div className="seg seg-sm" role="tablist" aria-label="Which drills">
          <button role="tab" aria-selected={source === "library"} onClick={() => setSource("library")}>
            Library <span>{LIBRARY.length}</span>
          </button>
          <button role="tab" aria-selected={source === "club"} onClick={() => setSource("club")}>
            Our drills <span>{data.drills.length}</span>
          </button>
        </div>
      </div>
      <div className="dfind">
        <label className="dsearch">
          <Icon id="i-search" />
          <input type="search" placeholder="Search drills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search drills" />
        </label>
        {source === "library" && (
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
      {source === "library" && (
        <div className="ttiles" role="group" aria-label="Theme">
          {themes.map((t) => (
            <button key={t} type="button" className="ttile" aria-pressed={theme === t} onClick={() => setTheme(theme === t ? "all" : t)}>
              <i style={{ background: THEME_LOOK[t].colour }}>{THEME_LOOK[t].tile}</i>
              {THEME_LOOK[t].short}
            </button>
          ))}
        </div>
      )}
      {source === "library" ? (
        lib.length ? (
          <>
            {theme !== "all" && (
              <p className="browse-note">
                {lib.length} {THEMES[theme].toLowerCase()} drills
                <button type="button" className="linkbtn" onClick={() => setTheme("all")}>
                  Show all
                </button>
              </p>
            )}
            <ul className="dlist">
              {lib.map((d) => {
                const added = have.has(norm(d.name));
                return (
                  <DrillRow
                    key={d.key}
                    name={d.name}
                    diagram={d.diagram}
                    category={d.category}
                    label={THEME_LOOK[d.theme].short}
                    colour={THEME_LOOK[d.theme].colour}
                    minutes={d.minutes}
                    purpose={purposeOf(d.description)}
                    onOpen={() => open({ kind: "library-drill", key: d.key })}
                    action={
                      canEdit ? (
                        added ? (
                          <span className="row-added" title="In your club's drills" aria-label="In your club's drills">
                            ✓
                          </span>
                        ) : (
                          <button type="button" className="row-add" disabled={busy} onClick={() => add([d])} aria-label={`Save ${d.name} to your club's drills`} title="Save to our drills">
                            +
                          </button>
                        )
                      ) : undefined
                    }
                  />
                );
              })}
            </ul>
          </>
        ) : (
          <div className="dempty">
            <b>No drills match.</b>
            <span>Try another word, theme or age.</span>
          </div>
        )
      ) : club.length ? (
        <ul className="dlist">
          {club.map((d) => (
            <DrillRow
              key={d.id}
              name={d.name}
              diagram={d.diagram}
              category={d.category}
              label={CATS[d.category]}
              minutes={d.minutes}
              purpose={purposeOf(d.description) || "Your club's drill"}
              onOpen={() => open({ kind: "drill", id: d.id })}
            />
          ))}
        </ul>
      ) : (
        <div className="dempty">
          <b>{data.drills.length ? "No drills match." : "No club drills yet."}</b>
          <span>{data.drills.length ? "Try another word." : "Save drills from the library with +, or make your own with New drill."}</span>
        </div>
      )}
    </section>
  );
}
