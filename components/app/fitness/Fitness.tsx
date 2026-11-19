"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../AppProvider";
import { NoTeams } from "../views/Overview";
import { Icon } from "@/components/ui";
import { errMsg, fmtDay, fmtMon, fmtNum, todayIso } from "@/lib/format";
import {
  AGE_LABEL,
  GACON,
  GROUP_LABEL,
  TESTS,
  TEST_BY_KEY,
  ageGroupFor,
  bandPosition,
  bandWord,
  bestOf,
  better,
  formatResult,
  gaconStage,
  parseResult,
  typicalFor,
  type AgeGroup,
  type FitnessGroup,
  type FitnessTest,
} from "@/lib/fitness";
import type { FitnessDay, FitnessResult, Player, Team } from "@/lib/types";
import { FitnessDiagram } from "./FitnessDiagram";

const shortDate = (d: string) => `${fmtDay(d)} ${fmtNum(d)} ${fmtMon(d)}`;
const shortName = (n: string) => {
  const w = n.trim().split(/\s+/);
  return w.length > 1 ? `${w[0]} ${w[w.length - 1][0]}` : w[0];
};
const badge = (p: Pick<Player, "shirt_number" | "full_name">) => (p.shirt_number != null ? String(p.shirt_number) : p.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join(""));
const teamAge = (t: Team | undefined) => {
  const m = `${t?.name ?? ""} ${t?.age_group ?? ""}`.match(/\bU\s?(\d{1,2})\b/i);
  return m ? Number(m[1]) : null;
};

/* ------------------------------------------------------------------ a simple modal */

function Modal({ title, onClose, children, foot, wide }: { title: string; onClose: () => void; children: React.ReactNode; foot?: React.ReactNode; wide?: boolean }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  const ui = (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`sheet${wide ? " wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {foot && <div className="sheet-foot">{foot}</div>}
      </div>
    </div>
  );
  return typeof document === "undefined" ? ui : createPortal(ui, document.querySelector(".look-root") ?? document.body);
}

/* ------------------------------------------------------------------ how to run each test */

export function TestGuide({ test, onClose }: { test: FitnessTest; onClose: () => void }) {
  const { data, isAdmin, can, supabase, toast, patch } = useApp();
  const canBands = isAdmin || can("squad.edit");
  const [edit, setEdit] = useState(false);
  const groups = Object.keys(AGE_LABEL) as AgeGroup[];
  const [vals, setVals] = useState(() => Object.fromEntries(groups.map((g) => [g, typicalFor(test, g, data.fitnessBands).map(String)])) as Record<AgeGroup, string[]>);
  async function saveBands() {
    const rows = groups.map((g) => ({ club_id: data.club.id, test_key: test.key, age_group: g, typical_low: parseResult(test, vals[g][0]), typical_high: parseResult(test, vals[g][1]) }));
    if (rows.some((r) => r.typical_low === null || r.typical_high === null || r.typical_high! <= r.typical_low!)) return toast("Each range needs a low and a higher high.");
    const { error } = await supabase.from("fitness_bands").upsert(rows, { onConflict: "club_id,test_key,age_group" });
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, fitnessBands: [...x.fitnessBands.filter((b) => b.test_key !== test.key), ...rows.map((r) => ({ test_key: r.test_key, age_group: r.age_group, typical_low: r.typical_low!, typical_high: r.typical_high! }))] }));
    setEdit(false);
    toast("Rough guide updated for your club");
  }
  const stages = Array.from({ length: GACON.stages }, (_, i) => gaconStage(i + 1));
  let total = 0;
  return (
    <Modal title={test.name} onClose={onClose}>
      <div className="fg">
        <FitnessDiagram test={test} />
        <p className="fg-measures">{test.measures}</p>
        <div className="fg-facts">
          <span>{GROUP_LABEL[test.group]}</span>
          <span>{test.attempts > 1 ? `Best of ${test.attempts}` : "One go"}</span>
          <span>{test.lowerIsBetter ? "Lower is better" : "Higher is better"}</span>
        </div>
        <section className="fg-sec">
          <h3>Set up</h3>
          <ul>
            {test.setup.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
        <section className="fg-sec">
          <h3>How it works</h3>
          <ol>
            {test.steps.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        </section>
        <section className="fg-sec">
          <h3>Scoring</h3>
          <p>{test.scoring}</p>
        </section>
        {test.key === "gacon" && (
          <section className="fg-sec">
            <h3>Cone table</h3>
            <p className="fg-small">Distances are measured from the start line around the perimeter. Overlap&apos;s timer calls each stage.</p>
            <div className="fg-table" role="table">
              <div className="fg-tr fg-th" role="row">
                <span>Stage</span>
                <span>Speed</span>
                <span>Run (45 s)</span>
                <span>Cone at</span>
              </div>
              {stages.map((st) => {
                total += st.metres;
                return (
                  <div key={st.n} className="fg-tr" role="row">
                    <span>{st.n}</span>
                    <span>{st.kmh.toFixed(1)} km/h</span>
                    <span>{st.metres.toFixed(1)} m</span>
                    <span>{Math.round(total)} m</span>
                  </div>
                );
              })}
            </div>
          </section>
        )}
        <section className="fg-sec">
          <h3>Coaching tips</h3>
          <ul>
            {test.tips.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
        <section className="fg-sec">
          <h3>
            Rough guide by age
            {canBands && !edit && (
              <button type="button" className="linkbtn" onClick={() => setEdit(true)}>
                Change for our club
              </button>
            )}
          </h3>
          <p className="fg-small">The typical range for each age. Faster or better than the range shows as Strong, slower or lower as Developing. It&apos;s a rough guide, not a standard.</p>
          <div className="fg-table" role="table">
            {groups.map((g) => (
              <div key={g} className="fg-tr" role="row">
                <span>{AGE_LABEL[g]}</span>
                {edit ? (
                  <span className="fg-edit">
                    <input className="input" value={vals[g][0]} onChange={(e) => setVals({ ...vals, [g]: [e.target.value, vals[g][1]] })} aria-label={`${AGE_LABEL[g]} low`} />
                    –
                    <input className="input" value={vals[g][1]} onChange={(e) => setVals({ ...vals, [g]: [vals[g][0], e.target.value] })} aria-label={`${AGE_LABEL[g]} high`} />
                  </span>
                ) : (
                  <span>
                    {formatResult(test, typicalFor(test, g, data.fitnessBands)[0])} – {formatResult(test, typicalFor(test, g, data.fitnessBands)[1])}
                  </span>
                )}
              </div>
            ))}
          </div>
          {edit && (
            <div className="fg-btns">
              <button className="btn" onClick={() => setEdit(false)}>
                Cancel
              </button>
              <button className="btn primary" onClick={saveBands}>
                Save guide
              </button>
            </div>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ planning a test day */

function PlanDay({ team, day, onClose }: { team: Team; day?: FitnessDay | null; onClose: () => void }) {
  const { supabase, toast, patch } = useApp();
  const [date, setDate] = useState(day?.date ?? todayIso());
  const [title, setTitle] = useState(day?.title ?? "Test day");
  const [tests, setTests] = useState<string[]>(day?.tests ?? ["sprint_20", "agility_505"]);
  const [guide, setGuide] = useState<FitnessTest | null>(null);
  const [busy, setBusy] = useState(false);
  const toggle = (k: string) => setTests((t) => (t.includes(k) ? t.filter((x) => x !== k) : [...t, k]));
  async function save() {
    if (!tests.length) return toast("Pick at least one test.");
    setBusy(true);
    const row = { team_id: team.id, date, title: title.trim() || "Test day", tests: TESTS.map((t) => t.key).filter((k) => tests.includes(k)) };
    const q = day ? supabase.from("fitness_test_days").update(row).eq("id", day.id).select("id,team_id,date,title,tests,notes").single() : supabase.from("fitness_test_days").insert(row).select("id,team_id,date,title,tests,notes").single();
    const { data: saved, error } = await q;
    setBusy(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, fitnessDays: [...x.fitnessDays.filter((d) => d.id !== saved.id), saved as FitnessDay].sort((a, b) => a.date.localeCompare(b.date)) }));
    toast(day ? "Test day saved" : "Test day planned");
    onClose();
  }
  async function remove() {
    if (!day) return;
    const { error } = await supabase.from("fitness_test_days").delete().eq("id", day.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, fitnessDays: x.fitnessDays.filter((d) => d.id !== day.id), fitnessResults: x.fitnessResults.filter((r) => r.test_day_id !== day.id) }));
    toast("Test day deleted");
    onClose();
  }
  return (
    <>
      <Modal
        title={day ? "Edit test day" : "Plan a test day"}
        onClose={onClose}
        foot={
          <>
            {day ? (
              <button className="btn danger spacer" onClick={remove}>
                Delete
              </button>
            ) : (
              <span className="spacer" />
            )}
            <button className="btn primary" disabled={busy} onClick={save}>
              {busy ? "Saving…" : `Save · ${tests.length} test${tests.length === 1 ? "" : "s"}`}
            </button>
          </>
        }
      >
        <div className="row2">
          <label className="field">
            <span>Date</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Name</span>
            <input className="input" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Pre-season" />
          </label>
        </div>
        <p className="fg-small" style={{ margin: 0 }}>
          Pick the tests for this day. They&apos;re all optional: choose the ones that suit your squad. Tap ⓘ to see how each one runs.
        </p>
        {(Object.keys(GROUP_LABEL) as FitnessGroup[]).map((g) => (
          <section key={g} className="fp-group">
            <h3>{GROUP_LABEL[g]}</h3>
            {TESTS.filter((t) => t.group === g).map((t) => (
              <div key={t.key} className={`fp-test${tests.includes(t.key) ? " on" : ""}`}>
                <button type="button" className="fp-pick" aria-pressed={tests.includes(t.key)} onClick={() => toggle(t.key)}>
                  <span className="fp-check" aria-hidden="true">
                    {tests.includes(t.key) ? "✓" : ""}
                  </span>
                  <span className="fp-t">
                    <b>{t.name}</b>
                    <small>{t.measures}</small>
                  </span>
                </button>
                <button type="button" className="fp-info" onClick={() => setGuide(t)} aria-label={`How to run the ${t.name}`}>
                  ⓘ
                </button>
              </div>
            ))}
          </section>
        ))}
      </Modal>
      {guide && <TestGuide test={guide} onClose={() => setGuide(null)} />}
    </>
  );
}

/* ------------------------------------------------------------------ running a test day */

function useNow(on: boolean) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    if (!on) return;
    let r = 0;
    const tick = () => {
      setNow(performance.now());
      r = requestAnimationFrame(tick);
    };
    r = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(r);
  }, [on]);
  return now;
}

function beep(freq = 880, ms = 220) {
  try {
    const W = window as unknown as { __ac?: AudioContext; AudioContext: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
    const ac = (W.__ac ??= new (W.AudioContext || W.webkitAudioContext!)());
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.frequency.value = freq;
    o.connect(g);
    g.connect(ac.destination);
    g.gain.setValueAtTime(0.25, ac.currentTime);
    o.start();
    o.stop(ac.currentTime + ms / 1000);
    navigator.vibrate?.(ms);
  } catch {}
}

function Runner({ day, team, players, onClose }: { day: FitnessDay; team: Team; players: Player[]; onClose: () => void }) {
  const { data, supabase, toast, patch } = useApp();
  const tests = day.tests.map((k) => TEST_BY_KEY.get(k)).filter((t): t is FitnessTest => !!t);
  const [ti, setTi] = useState(0);
  const test = tests[ti];
  const results = data.fitnessResults.filter((r) => r.test_day_id === day.id);
  const resultOf = (pid: string, key: string, attempt: number) => results.find((r) => r.player_id === pid && r.test_key === key && r.attempt === attempt);
  const priorBest = (pid: string, t: FitnessTest) => bestOf(t, data.fitnessResults.filter((r) => r.player_id === pid && r.test_key === t.key && r.test_day_id !== day.id).map((r) => r.value));

  async function record(pid: string, attempt: number, value: number | null) {
    if (value === null) {
      const r = resultOf(pid, test.key, attempt);
      if (!r) return;
      const { error } = await supabase.from("fitness_results").delete().eq("id", r.id);
      if (error) return toast(errMsg(error));
      patch((x) => ({ ...x, fitnessResults: x.fitnessResults.filter((y) => y.id !== r.id) }));
      return;
    }
    const row = { team_id: team.id, test_day_id: day.id, player_id: pid, test_key: test.key, attempt, value };
    const { data: saved, error } = await supabase.from("fitness_results").upsert(row, { onConflict: "test_day_id,player_id,test_key,attempt" }).select("id,team_id,test_day_id,player_id,test_key,attempt,value,tested_on").single();
    if (error) return toast(errMsg(error));
    const s = { ...(saved as FitnessResult), value: Number(saved.value) };
    patch((x) => ({ ...x, fitnessResults: [...x.fitnessResults.filter((y) => y.id !== s.id && !(y.test_day_id === day.id && y.player_id === pid && y.test_key === test.key && y.attempt === attempt)), s] }));
    const pb = priorBest(pid, test);
    if (pb !== null && better(test, value, pb)) toast(`New PB for ${shortName(players.find((p) => p.id === pid)?.full_name ?? "")}!`);
  }

  const ui = (
    <div className="fr" role="dialog" aria-modal="true" aria-label={`Test day: ${test?.name}`}>
      <header className="fr-top">
        <div>
          <small>
            Test day · {ti + 1} of {tests.length}
          </small>
          <b>{test?.name}</b>
        </div>
        <button type="button" className="fr-x" onClick={onClose} aria-label="Close test day">
          ✕
        </button>
      </header>
      <div className="fr-tabs" role="tablist">
        {tests.map((t, i) => (
          <button key={t.key} role="tab" aria-selected={i === ti} onClick={() => setTi(i)}>
            {t.short}
          </button>
        ))}
      </div>
      {test && test.mode === "stopwatch" && <StopwatchMode key={test.key} test={test} players={players} resultOf={resultOf} record={record} priorBest={priorBest} />}
      {test && test.mode === "gacon" && <GaconMode key={test.key} test={test} players={players} resultOf={resultOf} record={record} />}
      {test && test.mode === "enter" && <EnterMode key={test.key} test={test} players={players} resultOf={resultOf} record={record} priorBest={priorBest} />}
      <footer className="fr-foot">
        {ti < tests.length - 1 ? (
          <button type="button" className="fr-next" onClick={() => setTi(ti + 1)}>
            Next test: {tests[ti + 1].name} →
          </button>
        ) : (
          <button type="button" className="fr-next" onClick={onClose}>
            Finish test day ✓
          </button>
        )}
      </footer>
    </div>
  );
  return createPortal(ui, document.querySelector(".look-root") ?? document.body);
}

type ModeProps = {
  test: FitnessTest;
  players: Player[];
  resultOf: (pid: string, key: string, attempt: number) => FitnessResult | undefined;
  record: (pid: string, attempt: number, v: number | null) => Promise<void>;
  priorBest?: (pid: string, t: FitnessTest) => number | null;
};

function ResultCell({ test, r, pb }: { test: FitnessTest; r?: FitnessResult; pb?: boolean }) {
  return <span className={`fr-v${pb ? " pb" : ""}`}>{r ? `${formatResult(test, r.value)}${pb ? " ★" : ""}` : "–"}</span>;
}

function StopwatchMode({ test, players, resultOf, record, priorBest }: ModeProps) {
  // Everyone does try 1, then everyone does try 2.
  const queue = useMemo(() => Array.from({ length: test.attempts }, (_, a) => players.map((p) => ({ p, attempt: a + 1 }))).flat(), [players, test.attempts]);
  const firstOpen = queue.findIndex((q) => !resultOf(q.p.id, test.key, q.attempt));
  const [idx, setIdx] = useState(firstOpen < 0 ? 0 : firstOpen);
  const [start, setStart] = useState<number | null>(null);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState("");
  const now = useNow(start !== null);
  const cur = queue[idx];
  const elapsed = start !== null ? (now - start) / 1000 : 0;
  const advance = () => {
    const nextOpen = queue.findIndex((q, i) => i > idx && !resultOf(q.p.id, test.key, q.attempt));
    setIdx(nextOpen < 0 ? Math.min(idx + 1, queue.length - 1) : nextOpen);
  };
  async function stop() {
    if (start === null || !cur) return;
    const v = Math.round(((performance.now() - start) / 1000) * 100) / 100;
    setStart(null);
    await record(cur.p.id, cur.attempt, v);
    advance();
  }
  async function saveTyped(e: React.FormEvent) {
    e.preventDefault();
    const v = parseResult(test, typed);
    if (v === null || !cur) return;
    await record(cur.p.id, cur.attempt, v);
    setTyped("");
    setTyping(false);
    advance();
  }
  return (
    <div className="fr-body">
      {cur && (
        <div className="fr-clock">
          <div className="fr-who">
            Up now: <b>#{badge(cur.p)} {cur.p.full_name}</b>
            {test.attempts > 1 ? ` · try ${cur.attempt}` : ""}
          </div>
          {typing ? (
            <form className="fr-type" onSubmit={saveTyped}>
              <input autoFocus inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="e.g. 3.42" aria-label="Time in seconds" />
              <button className="fr-b go" type="submit">
                Save
              </button>
            </form>
          ) : (
            <div className="fr-t" aria-live="off">
              {elapsed.toFixed(2)}
            </div>
          )}
          <div className="fr-btns">
            <button type="button" className="fr-b" onClick={() => (setTyping(!typing), setStart(null))}>
              {typing ? "Use stopwatch" : "Type time"}
            </button>
            {!typing &&
              (start === null ? (
                <button type="button" className="fr-b go" onClick={() => (beep(660, 120), setStart(performance.now()))}>
                  Start
                </button>
              ) : (
                <button type="button" className="fr-b stop" onClick={stop}>
                  Stop
                </button>
              ))}
          </div>
          <button type="button" className="fr-skip" onClick={advance}>
            Skip {cur.p.full_name.split(" ")[0]} for now
          </button>
        </div>
      )}
      <ul className="fr-list">
        {players.map((p) => {
          const vals = Array.from({ length: test.attempts }, (_, a) => resultOf(p.id, test.key, a + 1));
          const best = bestOf(test, vals.filter(Boolean).map((r) => r!.value));
          const prior = priorBest?.(p.id, test) ?? null;
          const pb = best !== null && (prior === null ? false : better(test, best, prior));
          const now = cur?.p.id === p.id;
          return (
            <li key={p.id} className={now ? "now" : ""}>
              <button type="button" className="fr-row" onClick={() => setIdx(queue.findIndex((q) => q.p.id === p.id && !resultOf(p.id, test.key, q.attempt)) >= 0 ? queue.findIndex((q) => q.p.id === p.id && !resultOf(p.id, test.key, q.attempt)) : queue.findIndex((q) => q.p.id === p.id))}>
                <span className="fr-num">{badge(p)}</span>
                <span className="fr-name">
                  <b>{p.full_name}</b>
                  <small>{test.attempts > 1 ? vals.map((r, i) => `T${i + 1} ${r ? formatResult(test, r.value) : "–"}`).join(" · ") : prior !== null ? `PB ${formatResult(test, prior)}` : "First time"}</small>
                </span>
                <ResultCell test={test} r={best !== null ? ({ value: best } as FitnessResult) : undefined} pb={pb} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function EnterMode({ test, players, resultOf, record, priorBest }: ModeProps) {
  return (
    <div className="fr-body">
      <p className="fr-hint">
        Type each player&apos;s result{test.format === "mmss" ? " as 4:05 or 245 seconds" : ""}. It saves as soon as you leave the box.
      </p>
      <ul className="fr-list">
        {players.map((p) => {
          const prior = priorBest?.(p.id, test) ?? null;
          return (
            <li key={p.id}>
              <div className="fr-row">
                <span className="fr-num">{badge(p)}</span>
                <span className="fr-name">
                  <b>{p.full_name}</b>
                  <small>{prior !== null ? `PB ${formatResult(test, prior)}` : "First time"}</small>
                </span>
                <span className="fr-inputs">
                  {Array.from({ length: test.attempts }, (_, a) => {
                    const r = resultOf(p.id, test.key, a + 1);
                    return (
                      <input
                        key={`${a}-${r?.value ?? ""}`}
                        className="fr-in"
                        inputMode="decimal"
                        defaultValue={r ? (test.format === "mmss" ? formatResult(test, r.value) : String(r.value)) : ""}
                        placeholder={test.attempts > 1 ? `Try ${a + 1}` : test.unit || "–"}
                        aria-label={`${p.full_name} ${test.name}${test.attempts > 1 ? ` try ${a + 1}` : ""}`}
                        onBlur={(e) => {
                          const raw = e.target.value;
                          const v = parseResult(test, raw);
                          if (raw.trim() && v === null) return;
                          if ((r?.value ?? null) !== v) record(p.id, a + 1, v);
                        }}
                      />
                    );
                  })}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GaconMode({ test, players, resultOf, record }: ModeProps) {
  // Elapsed time drives the stage: each minute is a 45 s run then a 15 s rest.
  const [start, setStart] = useState<number | null>(null);
  const [out, setOut] = useState<Record<string, number>>({});
  const now = useNow(start !== null);
  const t = start !== null ? (now - start) / 1000 : 0;
  const stageNo = Math.min(GACON.stages, Math.floor(t / 60) + 1);
  const inRun = t % 60 < 45;
  const left = inRun ? 45 - (t % 60) : 60 - (t % 60);
  const st = gaconStage(stageNo);
  const lastPhase = useRef("");
  useEffect(() => {
    if (start === null) return;
    const ph = `${stageNo}-${inRun}`;
    if (ph !== lastPhase.current) {
      if (lastPhase.current) beep(inRun ? 880 : 520, inRun ? 260 : 420);
      lastPhase.current = ph;
    }
  }, [stageNo, inRun, start]);
  const running = players.filter((p) => out[p.id] === undefined);
  // Out during stage n's run or after missing stage n's cone: they completed stage n - 1.
  const completed = (n: number) => (n >= 1 ? gaconStage(n).kmh : null);
  async function tapOut(p: Player) {
    const done = stageNo - 1;
    setOut((o) => ({ ...o, [p.id]: done }));
    await record(p.id, 1, completed(done));
  }
  async function finish() {
    const done = inRun ? stageNo - 1 : stageNo;
    for (const p of running) {
      setOut((o) => ({ ...o, [p.id]: done }));
      await record(p.id, 1, completed(done));
    }
    setStart(null);
  }
  let cum = 0;
  for (let i = 1; i <= stageNo; i++) cum += gaconStage(i).metres;
  return (
    <div className="fr-body">
      <div className={`fr-clock gacon${start !== null ? (inRun ? " run" : " rest") : ""}`}>
        <div className="fr-who">{start === null ? "Everyone runs together. Tap a player the moment they're out." : inRun ? "RUN" : "REST · walk to your cone"}</div>
        <div className="fr-stage">
          <span>
            Stage <b>{stageNo}</b>
          </span>
          <span>
            <b>{st.kmh.toFixed(1)}</b> km/h
          </span>
          <span>
            Cone at <b>{Math.round(cum)}</b> m
          </span>
        </div>
        <div className="fr-t">{start === null ? "0:45" : `0:${String(Math.ceil(left)).padStart(2, "0")}`}</div>
        <div className="fr-btns">
          {start === null ? (
            <button type="button" className="fr-b go" onClick={() => (beep(880, 300), (lastPhase.current = ""), setOut({}), setStart(performance.now()))} disabled={!players.length}>
              Start the test
            </button>
          ) : (
            <button type="button" className="fr-b stop" onClick={finish}>
              End test{running.length ? ` · ${running.length} still running` : ""}
            </button>
          )}
        </div>
      </div>
      <ul className="fr-list">
        {players.map((p) => {
          const r = resultOf(p.id, test.key, 1);
          const isOut = out[p.id] !== undefined;
          return (
            <li key={p.id} className={start !== null && !isOut ? "now" : ""}>
              <button type="button" className="fr-row" disabled={start === null || isOut} onClick={() => tapOut(p)}>
                <span className="fr-num">{badge(p)}</span>
                <span className="fr-name">
                  <b>{p.full_name}</b>
                  <small>{start !== null && !isOut ? "Running · tap when out" : r ? `Completed stage ${Math.round((r.value - GACON.startKmh) / GACON.stepKmh) + 1}` : "Waiting"}</small>
                </span>
                <ResultCell test={test} r={r} />
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------------ leaderboard */

type Row = { player_id: string; full_name: string; shirt_number: number | null; best: number; previous_best: number | null; last_tested: string };
function Leaderboard({ team, testKeys, staff }: { team: Team; testKeys: string[]; staff: boolean }) {
  const { supabase, myPlayers } = useApp();
  const [key, setKey] = useState(testKeys[0]);
  const [rows, setRows] = useState<Row[] | null>(null);
  const test = TEST_BY_KEY.get(key);
  useEffect(() => {
    if (!test) return;
    setRows(null);
    supabase.rpc("fitness_leaderboard", { p_team: team.id, p_test: test.key, p_lower_better: test.lowerIsBetter }).then(({ data }) => setRows(((data ?? []) as Row[]).map((r) => ({ ...r, best: Number(r.best), previous_best: r.previous_best === null ? null : Number(r.previous_best) }))));
  }, [supabase, team.id, test]);
  if (!testKeys.length || !test) return null;
  const mine = new Set(myPlayers.map((p) => p.id));
  const age = teamAge(team);
  return (
    <section className="md-sec">
      <div className="md-sec-h">
        <h2>Leaderboard</h2>
        {staff && age !== null && age < 13 && <span className="fl-note">Only coaches see rankings for under-13s</span>}
      </div>
      <div className="dchips" role="group" aria-label="Test">
        {testKeys.map((k) => (
          <button key={k} type="button" className="chip" aria-pressed={k === key} onClick={() => setKey(k)}>
            {TEST_BY_KEY.get(k)?.short}
          </button>
        ))}
      </div>
      <ol className="fl-list">
        {rows === null ? (
          <li className="fl-empty">Loading…</li>
        ) : rows.length ? (
          rows.map((r, i) => {
            const delta = r.previous_best !== null && better(test, r.best, r.previous_best) ? Math.abs(r.best - r.previous_best) : null;
            return (
              <li key={r.player_id} className={mine.has(r.player_id) ? "mine" : ""}>
                <span className={`fl-rk${i === 0 ? " gold" : ""}`}>{i + 1}</span>
                <span className="fl-num">{r.shirt_number ?? "–"}</span>
                <span className="fl-t">
                  <b>
                    {shortName(r.full_name)}
                    {delta !== null && <span className="fl-pb">PB</span>}
                  </b>
                  <small>{shortDate(r.last_tested)}</small>
                </span>
                <span className="fl-v">
                  {formatResult(test, r.best)}
                  {delta !== null && (
                    <small>
                      {test.lowerIsBetter ? "−" : "+"}
                      {test.format === "secs" ? delta.toFixed(2) : test.format === "count" ? Math.round(delta) : delta.toFixed(1)}
                    </small>
                  )}
                </span>
              </li>
            );
          })
        ) : (
          <li className="fl-empty">No results for this test yet.</li>
        )}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------ one player's results */

export function PlayerFitness({ player, compact }: { player: Player; compact?: boolean }) {
  const { data, canDo, supabase, toast, patch } = useApp();
  const team = data.teams.find((t) => t.id === player.team_id);
  const mine = data.fitnessResults.filter((r) => r.player_id === player.id);
  const keys = TESTS.map((t) => t.key).filter((k) => mine.some((r) => r.test_key === k));
  const [chartKey, setChartKey] = useState(keys[0]);
  if (!keys.length) return compact ? null : <p className="fl-empty">No fitness results yet.</p>;
  const group = ageGroupFor(player.birth_year, team?.name ?? "");
  const canGoal = player.team_ids.some((t) => canDo("idp.edit", t));

  // Best result on each date, per test.
  const byDate = (k: string) => {
    const t = TEST_BY_KEY.get(k)!;
    const dates = [...new Set(mine.filter((r) => r.test_key === k).map((r) => r.tested_on))].sort();
    return dates.map((d) => ({ d, v: bestOf(t, mine.filter((r) => r.test_key === k && r.tested_on === d).map((r) => r.value))! }));
  };

  async function makeGoal(t: FitnessTest, best: number) {
    const target = t.lowerIsBetter ? best * 0.97 : best * 1.06;
    const nice = t.format === "secs" ? target.toFixed(2) + "s" : t.format === "count" ? String(Math.ceil(target)) : t.format === "mmss" ? formatResult(t, target) : target.toFixed(1);
    const title = `${t.name}: ${t.lowerIsBetter ? "under" : "reach"} ${nice}`;
    const { data: g, error } = await supabase.from("player_goals").insert({ player_id: player.id, area: "physical", title, detail: `From fitness testing. Current best ${formatResult(t, best)}.`, status: "active" }).select("*").single();
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, goals: [...x.goals, g as (typeof x.goals)[number]] }));
    toast(`Goal added to ${player.full_name.split(" ")[0]}'s development plan`);
  }

  const shown = compact ? keys.slice(0, 4) : keys;
  const ct = TEST_BY_KEY.get(chartKey ?? keys[0])!;
  const series = byDate(ct.key);
  return (
    <div className="pf">
      <div className="pf-tiles">
        {shown.map((k) => {
          const t = TEST_BY_KEY.get(k)!;
          const s = byDate(k);
          const latest = s[s.length - 1];
          const best = bestOf(t, s.map((x) => x.v))!;
          const prev = s.length > 1 ? bestOf(t, s.slice(0, -1).map((x) => x.v)) : null;
          const isPb = prev !== null && better(t, latest.v, prev);
          const change = s.length > 1 ? latest.v - s[s.length - 2].v : null;
          const pos = bandPosition(t, latest.v, typicalFor(t, group, data.fitnessBands));
          return (
            <button type="button" key={k} className={`pf-tile${k === ct.key && !compact ? " on" : ""}`} onClick={() => setChartKey(k)}>
              <small>{t.name}</small>
              <b>{formatResult(t, latest.v)}</b>
              <span className={`pf-d${isPb ? " pb" : ""}`}>
                {isPb ? "★ PB" : best === latest.v && s.length === 1 ? "First result" : `Best ${formatResult(t, best)}`}
                {change !== null && change !== 0 && ` · ${better(t, latest.v, s[s.length - 2].v) ? "better" : "down"} ${t.format === "secs" ? Math.abs(change).toFixed(2) + "s" : t.format === "count" ? Math.abs(Math.round(change)) : Math.abs(change).toFixed(1)}`}
              </span>
              <span className="pf-band" aria-label={`${bandWord(pos)} for age`}>
                <i />
                <i />
                <i />
                <em style={{ left: `${pos * 100}%` }} />
              </span>
              <span className="pf-bandl">
                <span>Developing</span>
                <span>Typical</span>
                <span>Strong</span>
              </span>
            </button>
          );
        })}
      </div>
      {!compact && series.length > 0 && (
        <section className="pf-chart">
          <div className="pf-chart-h">
            <b>{ct.name}</b>
            <span>{ct.lowerIsBetter ? "Lower is better · up means improving" : "Higher is better"}</span>
          </div>
          <ProgressChart test={ct} series={series} />
          {canGoal && (
            <button type="button" className="pf-goal" onClick={() => makeGoal(ct, bestOf(ct, series.map((x) => x.v))!)}>
              ◎ Make this a development goal
            </button>
          )}
        </section>
      )}
      {!compact && <p className="fl-note">Bands are a rough guide for {AGE_LABEL[group].toLowerCase()} players. Clubs can change them.</p>}
    </div>
  );
}

/** One series over time. For lower-is-better tests the axis is flipped so improving always goes up. */
function ProgressChart({ test, series }: { test: FitnessTest; series: { d: string; v: number }[] }) {
  const W = 320,
    H = 140,
    pl = 40,
    pr = 14,
    pt = 18,
    pb = 26;
  const vs = series.map((s) => s.v);
  let lo = Math.min(...vs),
    hi = Math.max(...vs);
  if (lo === hi) (lo -= 1), (hi += 1);
  const pad = (hi - lo) * 0.15;
  lo -= pad;
  hi += pad;
  const X = (i: number) => (series.length === 1 ? (pl + W - pr) / 2 : pl + (i * (W - pl - pr)) / (series.length - 1));
  const Y = (v: number) => {
    const f = (v - lo) / (hi - lo);
    return pt + (test.lowerIsBetter ? f : 1 - f) * (H - pt - pb);
  };
  const ticks = [lo + pad, (lo + hi) / 2, hi - pad];
  const best = bestOf(test, vs)!;
  const bi = vs.indexOf(best);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="pf-svg" role="img" aria-label={`${test.name} over time`} onMouseLeave={() => setHover(null)}>
      {ticks.map((v, i) => (
        <g key={i}>
          <line x1={pl} x2={W - pr} y1={Y(v)} y2={Y(v)} stroke="#eef0f3" />
          <text x={pl - 6} y={Y(v) + 3.5} fontSize="10" textAnchor="end" fill="#8a919c">
            {formatResult(test, v)}
          </text>
        </g>
      ))}
      {series.length > 1 && <path d={series.map((s, i) => `${i ? "L" : "M"}${X(i)} ${Y(s.v)}`).join(" ")} fill="none" stroke="#c2691c" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />}
      {series.map((s, i) => (
        <g key={s.d} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
          <circle cx={X(i)} cy={Y(s.v)} r="12" fill="transparent" />
          <circle cx={X(i)} cy={Y(s.v)} r="4.5" fill="#c2691c" stroke="#fff" strokeWidth="2" />
          <text x={X(i)} y={H - 8} fontSize="10" textAnchor="middle" fill="#667085">
            {fmtNum(s.d)} {fmtMon(s.d)}
          </text>
        </g>
      ))}
      {hover === null && (
        <text x={X(bi)} y={Y(best) - 9} fontSize="10.5" fontWeight="700" textAnchor={bi === series.length - 1 && series.length > 1 ? "end" : "middle"} fill="#15171a">
          {formatResult(test, best)} best
        </text>
      )}
      {hover !== null && (
        <g>
          <rect x={Math.min(Math.max(X(hover) - 42, 2), W - 86)} y={Math.max(Y(series[hover].v) - 34, 2)} width="84" height="24" rx="6" fill="#15171a" />
          <text x={Math.min(Math.max(X(hover), 44), W - 44)} y={Math.max(Y(series[hover].v) - 18, 18)} fontSize="11" fontWeight="700" textAnchor="middle" fill="#fff">
            {formatResult(test, series[hover].v)} · {fmtNum(series[hover].d)} {fmtMon(series[hover].d)}
          </text>
        </g>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ the page */

export function FitnessPage() {
  const { data, team, squad, canDo, isAdmin, myPlayers, kidName } = useApp();
  const staff = data.role === "admin" || data.role === "coach" || data.role === "assistant";
  const [planning, setPlanning] = useState<FitnessDay | null | undefined>(undefined);
  const [running, setRunning] = useState<FitnessDay | null>(null);
  const [guide, setGuide] = useState<FitnessTest | null>(null);
  const [viewing, setViewing] = useState<string | null>(null);

  if (!staff) {
    return (
      <div className="md-home fit">
        <header className="md-hello">
          <span className="eyebrow">Fitness</span>
          <h1>{myPlayers.length === 1 && data.role === "parent" ? `${kidName(myPlayers[0])}'s fitness` : "Fitness results"}</h1>
        </header>
        {myPlayers.map((p) => {
          const t = data.teams.find((x) => x.id === p.team_id);
          const keys = TESTS.map((x) => x.key).filter((k) => data.fitnessResults.some((r) => r.team_id === p.team_id && r.test_key === k));
          return (
            <div key={p.id} style={{ display: "grid", gap: 16 }}>
              {myPlayers.length > 1 && <h2 className="fit-kid">{p.full_name}</h2>}
              <PlayerFitness player={p} />
              {t && (teamAge(t) ?? 99) >= 13 && keys.length > 0 && <Leaderboard team={t} testKeys={keys} staff={false} />}
            </div>
          );
        })}
        {!myPlayers.length && <p className="fl-empty">Your account isn&apos;t linked to a player yet.</p>}
      </div>
    );
  }
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const canRun = canDo("attendance.edit", team.id);
  const players = squad();
  const today = todayIso();
  const days = data.fitnessDays.filter((d) => d.team_id === team.id);
  const next = days.find((d) => d.date >= today);
  const past = days.filter((d) => d.date < today || d !== next).filter((d) => d !== next).reverse();
  const keys = TESTS.map((t) => t.key).filter((k) => data.fitnessResults.some((r) => r.team_id === team.id && r.test_key === k));
  const vp = viewing ? players.find((p) => p.id === viewing) : null;

  return (
    <div className="md-home fit">
      <div className="phead">
        <div>
          <div className="eyebrow">{team.name} · Fitness</div>
          <h1>Fitness tests</h1>
        </div>
        {canRun && (
          <button className="btn primary" onClick={() => setPlanning(null)}>
            <Icon id="i-plus" />
            Plan a test day
          </button>
        )}
      </div>

      {next ? (
        <section className="ticket">
          <div className="ticket-top">
            <span className="ticket-kicker">{next.date === today ? "Today · test day" : "Next test day"}</span>
            {canRun && (
              <button type="button" className="fit-edit" onClick={() => setPlanning(next)}>
                Edit
              </button>
            )}
          </div>
          <div className="ticket-big">
            <span>
              {shortDate(next.date)} · {next.title}
            </span>
          </div>
          <p className="ticket-sub">{next.tests.map((k) => TEST_BY_KEY.get(k)?.name).filter(Boolean).join(" · ")}</p>
          {canRun && (
            <div className="ticket-actions">
              <button className="btn primary" onClick={() => setRunning(next)} disabled={!players.length}>
                Start test day
              </button>
            </div>
          )}
        </section>
      ) : (
        <section className="ticket empty">
          <span className="ticket-kicker">No test day planned</span>
          <p className="ticket-sub">Plan one to track speed, endurance and skills across the season. Every test has a how-to guide.</p>
          {canRun && (
            <div className="ticket-actions">
              <button className="btn primary" onClick={() => setPlanning(null)}>
                Plan a test day
              </button>
            </div>
          )}
        </section>
      )}

      <div className="md-cols">
        <Leaderboard key={team.id} team={team} testKeys={keys} staff />
        <section className="md-sec">
          <div className="md-sec-h">
            <h2>Players</h2>
          </div>
          <ul className="md-list fit-players">
            {players.map((p) => {
              const n = data.fitnessResults.filter((r) => r.player_id === p.id).length;
              return (
                <li key={p.id}>
                  <button type="button" className="md-row" onClick={() => setViewing(p.id)}>
                    <span className="fl-num">{badge(p)}</span>
                    <span className="md-row-main">
                      <b>{p.full_name}</b>
                      <small>{n ? `${n} result${n === 1 ? "" : "s"}` : "Not tested yet"}</small>
                    </span>
                    <span className="chev">›</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>

      {past.length > 0 && (
        <section className="md-sec">
          <div className="md-sec-h">
            <h2>Test days</h2>
          </div>
          <div className="md-list">
            {past.map((d) => (
              <div key={d.id} className="md-row static">
                <span className="dtile">
                  <small>{fmtDay(d.date)}</small>
                  <b>{fmtNum(d.date)}</b>
                </span>
                <span className="md-row-main">
                  <b>{d.title}</b>
                  <small>{d.tests.map((k) => TEST_BY_KEY.get(k)?.short).join(" · ")}</small>
                </span>
                {canRun && (
                  <span className="fit-acts">
                    <button className="btn sm" onClick={() => setRunning(d)}>
                      Results
                    </button>
                    <button className="btn sm" onClick={() => setPlanning(d)}>
                      Edit
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="md-sec">
        <div className="md-sec-h">
          <h2>How to run each test</h2>
        </div>
        <div className="fit-lib">
          {TESTS.map((t) => (
            <button key={t.key} type="button" className="fit-card" onClick={() => setGuide(t)}>
              <FitnessDiagram test={t} />
              <span>
                <small>{GROUP_LABEL[t.group]}</small>
                <b>{t.name}</b>
              </span>
            </button>
          ))}
        </div>
      </section>

      {planning !== undefined && <PlanDay team={team} day={planning} onClose={() => setPlanning(undefined)} />}
      {running && <Runner day={running} team={team} players={players} onClose={() => setRunning(null)} />}
      {guide && <TestGuide test={guide} onClose={() => setGuide(null)} />}
      {vp && (
        <Modal title={vp.full_name} onClose={() => setViewing(null)}>
          <PlayerFitness player={vp} />
          <Link href={`/players/${vp.id}`} className="pp-link">
            Full progress report →
          </Link>
        </Modal>
      )}
    </div>
  );
}
