"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { Shirt, totalMins } from "@/components/ui";
import { AREAS, areaLabel, overall, type Evaluation } from "@/lib/idp";
import { fmtMins } from "@/lib/load";
import { iso, parseD, todayIso, weekKey } from "@/lib/format";
import type { Session } from "@/lib/types";

/*
 * Player progression: one page per player with training, attendance, development ratings and goals
 * over a chosen period. Shows only what the viewer may see (the database already filters the data).
 * Injuries, fitness tests and match stats join this page when those features are built.
 */

type Period = "3m" | "6m" | "12m" | "all";
const PERIODS: { key: Period; label: string }[] = [
  { key: "3m", label: "3 months" },
  { key: "6m", label: "6 months" },
  { key: "12m", label: "12 months" },
  { key: "all", label: "All time" },
];
type Mark = "attended" | "excused" | "missed";
type Row = { s: Session; mark: Mark; mins: number };

const day = (d: string) => parseD(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const longDay = (d: string) => parseD(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" });
const monthLabel = (k: string, withYear: boolean) => parseD(k + "-01").toLocaleDateString("en-AU", { month: "short", ...(withYear ? { year: "2-digit" } : {}) });
const round1 = (n: number) => Math.round(n * 10) / 10;

function monthsAgo(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return iso(d);
}

export function Progress({ playerId }: { playerId: string }) {
  const { data, can, myPlayers, attendedSet, repliesFor, evaluationsOf, goalsOf, kidName } = useApp();
  const [period, setPeriod] = useState<Period>("6m");
  const player = data.players.find((p) => p.id === playerId);
  const mine = myPlayers.some((p) => p.id === playerId);
  const family = data.role === "player" || data.role === "parent";
  const showAttendance = mine || can("attendance.view");
  const showIdp = mine || can("idp.view");

  const today = todayIso();
  const allSessions = useMemo(
    () => (player ? data.sessions.filter((s) => player.team_ids.includes(s.team_id) && s.date < today).sort((a, b) => a.date.localeCompare(b.date)) : []),
    [data.sessions, player, today],
  );
  const evs = useMemo(() => [...(player ? evaluationsOf(player.id) : [])].sort((a, b) => a.evaluated_on.localeCompare(b.evaluated_on)), [evaluationsOf, player]);

  const from = useMemo(() => {
    if (period !== "all") return monthsAgo(period === "3m" ? 3 : period === "6m" ? 6 : 12);
    const first = [allSessions[0]?.date, evs[0]?.evaluated_on].filter(Boolean).sort()[0];
    return first && first < monthsAgo(3) ? first : monthsAgo(3);
  }, [period, allSessions, evs]);

  if (!player || (!showAttendance && !showIdp))
    return (
      <div className="empty">
        This progress report isn&apos;t available. <Link href="/">Back to home</Link>
      </div>
    );

  const rows: Row[] = allSessions
    .filter((s) => s.date >= from)
    .map((s) => {
      const came = attendedSet(s.id).has(player.id);
      const said = repliesFor(s.id).get(player.id);
      return { s, mark: came ? "attended" : said && !said.going ? "excused" : "missed", mins: came ? totalMins(s) : 0 };
    });
  const attended = rows.filter((r) => r.mark === "attended");
  const excused = rows.filter((r) => r.mark === "excused").length;
  const rate = rows.length ? Math.round((100 * attended.length) / rows.length) : null;
  const weeksWithTraining = new Set(rows.map((r) => weekKey(r.s.date))).size;
  const totalAttendedMins = attended.reduce((n, r) => n + r.mins, 0);
  const typicalWeek = weeksWithTraining ? Math.round(totalAttendedMins / weeksWithTraining) : 0;

  const evsIn = evs.filter((e) => e.evaluated_on >= from);
  const latest = evs[evs.length - 1];
  const before = evs.filter((e) => e.evaluated_on < from).pop();
  const startEv = before ?? evsIn[0];
  const ovNow = overall(latest?.ratings);
  const ovStart = startEv && startEv !== latest ? overall(startEv.ratings) : null;
  const goals = goalsOf(player.id);
  const achievedIn = goals.filter((g) => g.status === "achieved" && (g.achieved_on ?? g.updated_at.slice(0, 10)) >= from).length;
  const active = goals.filter((g) => g.status === "active");

  const teams = player.team_ids.map((t) => data.teams.find((x) => x.id === t)?.name).filter(Boolean);
  const name = mine && data.role === "parent" ? kidName(player) : player.full_name.split(" ")[0];
  const you = mine && data.role === "player";
  const periodText = period === "all" ? `since ${day(from)}` : `in the last ${PERIODS.find((p) => p.key === period)!.label}`;

  function downloadCsv() {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const lines = [["Date", "Session", "Team", "Attendance", "Minutes"].map(esc).join(",")];
    for (const r of rows)
      lines.push(
        [r.s.date, r.s.title, data.teams.find((t) => t.id === r.s.team_id)?.name ?? "", r.mark === "attended" ? "Attended" : r.mark === "excused" ? "Said no" : "Missed", r.mins]
          .map(esc)
          .join(","),
      );
    if (showIdp && evsIn.length) {
      lines.push("", ["Review date", ...AREAS.map((a) => a.label), "Overall"].map(esc).join(","));
      for (const e of evsIn) lines.push([e.evaluated_on, ...AREAS.map((a) => e.ratings[a.key] ?? ""), overall(e.ratings) ?? ""].map(esc).join(","));
    }
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${player!.full_name.replace(/[^\w ]+/g, "").trim().replace(/\s+/g, "-")}-progress-${today}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <div className="prog">
      <div className="phead prog-head">
        <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
          {!family && (
            <span className="no-print">
              <Shirt p={player} />
            </span>
          )}
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">
              {data.club.name} · Progress report
            </div>
            <h1>{player.full_name}</h1>
            <div className="muted" style={{ fontSize: 14 }}>
              {[player.position, teams.join(", ")].filter(Boolean).join(" · ")}
              <span className="print-only"> · {PERIODS.find((p) => p.key === period)!.label} to {day(today)}</span>
            </div>
          </div>
        </div>
        <div className="prog-actions no-print">
          {showIdp && (
            <Link className="btn" href={`/development/${player.id}`}>
              Development plan
            </Link>
          )}
          <button className="btn" type="button" onClick={downloadCsv}>
            Download CSV
          </button>
          <button className="btn primary" type="button" onClick={() => window.print()}>
            Print or save PDF
          </button>
        </div>
      </div>

      <div className="subtabs no-print" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.key} role="tab" aria-selected={period === p.key} onClick={() => setPeriod(p.key)}>
            {p.label}
          </button>
        ))}
      </div>

      <section className="prog-tiles" aria-label="Summary">
        {showAttendance && (
          <div className="prog-tile">
            <span>Attendance</span>
            <b className="tnum">{rate === null ? "–" : `${rate}%`}</b>
            <small>
              {attended.length} of {rows.length} sessions{excused ? `, ${excused} said no` : ""}
            </small>
          </div>
        )}
        {showAttendance && (
          <div className="prog-tile">
            <span>Typical week</span>
            <b className="tnum">{typicalWeek ? fmtMins(typicalWeek) : "–"}</b>
            <small>{totalAttendedMins ? `${fmtMins(totalAttendedMins)} trained ${periodText}` : "No planned minutes yet"}</small>
          </div>
        )}
        {showIdp && (
          <div className="prog-tile">
            <span>Development rating</span>
            <b className="tnum">{ovNow ?? "–"}</b>
            <small>
              {ovNow === null ? "No reviews yet" : ovStart !== null ? <Delta now={ovNow} then={ovStart} since={startEv!.evaluated_on} /> : `From the review on ${day(latest!.evaluated_on)}`}
            </small>
          </div>
        )}
        {showIdp && (
          <div className="prog-tile">
            <span>Goals</span>
            <b className="tnum">{goals.length ? achievedIn : "–"}</b>
            <small>{goals.length ? `achieved ${periodText} · ${active.length} in progress` : "No goals set yet"}</small>
          </div>
        )}
      </section>

      {showAttendance && (
        <section className="prog-sec">
          <div className="prog-sec-h">
            <h2>Training</h2>
            <p>
              Minutes {you ? "you" : name} trained each {bucketUnit(from)}, from the session plans of sessions {you ? "you" : "they"} came to.
            </p>
          </div>
          {rows.length ? <TrainingChart rows={rows} from={from} to={today} /> : <p className="prog-empty">No sessions {periodText}.</p>}
        </section>
      )}

      {showAttendance && rows.length > 0 && (
        <section className="prog-sec">
          <div className="prog-sec-h">
            <h2>Attendance</h2>
            <p>Every session {periodText}, oldest first.</p>
          </div>
          <AttendanceStrip rows={rows} teamName={(id) => (player.team_ids.length > 1 ? data.teams.find((t) => t.id === id)?.name : undefined)} />
        </section>
      )}

      {showIdp && (
        <section className="prog-sec">
          <div className="prog-sec-h">
            <h2>Development ratings</h2>
            <p>Overall and each area on the 1 to 10 scale, from {family ? "reviews shared with you" : "each review"}.</p>
          </div>
          {evs.length ? <Ratings evs={evs} from={from} to={today} /> : <p className="prog-empty">No reviews yet.</p>}
        </section>
      )}

      {showIdp && goals.length > 0 && (
        <section className="prog-sec">
          <div className="prog-sec-h">
            <h2>Goals</h2>
          </div>
          <ul className="prog-goals">
            {[...active, ...goals.filter((g) => g.status === "achieved"), ...goals.filter((g) => g.status === "dropped")].map((g) => (
              <li key={g.id}>
                <span>
                  <b>{g.title}</b>
                  <small>
                    {areaLabel(g.area)}
                    {g.status === "achieved" ? ` · Achieved${g.achieved_on ? ` ${day(g.achieved_on)}` : ""}` : g.status === "dropped" ? " · Stopped" : g.target_date ? ` · Target ${day(g.target_date)}` : ""}
                  </small>
                </span>
                <span className="prog-goal-bar" role="img" aria-label={`${g.status === "achieved" ? 100 : g.progress}% done`}>
                  <i style={{ width: `${g.status === "achieved" ? 100 : g.progress}%` }} />
                </span>
                <span className="tnum prog-goal-pct">{g.status === "achieved" ? "Done" : g.status === "dropped" ? "–" : `${g.progress}%`}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="prog-foot">
        Printed {longDay(today)} from Overlap. {showAttendance ? "Training minutes come from session plans; sessions without a plan count as 0 minutes." : ""}
      </p>
    </div>
  );
}

function Delta({ now, then, since }: { now: number; then: number; since: string }) {
  const d = round1(now - then);
  if (!d) return <>No change since {day(since)}</>;
  return (
    <>
      <span className={d > 0 ? "up" : "down"}>
        {d > 0 ? "▲" : "▼"} {Math.abs(d)}
      </span>{" "}
      since {day(since)}
    </>
  );
}

/* ------------------------------------------------------------------ shared chart bits */

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

type TipState = { x: number; y: number; lines: string[] } | null;
function Tip({ tip }: { tip: TipState }) {
  if (!tip) return null;
  return (
    <div className="viz-tip" role="status" style={{ left: tip.x, top: tip.y }}>
      <b>{tip.lines[0]}</b>
      {tip.lines.slice(1).map((l, i) => (
        <span key={i}>{l}</span>
      ))}
    </div>
  );
}

const byWeek = (from: string) => (parseD(todayIso()).getTime() - parseD(from).getTime()) / 864e5 <= 190;
const bucketUnit = (from: string) => (byWeek(from) ? "week" : "month");

/* ------------------------------------------------------------------ training: bars per week or month */

function TrainingChart({ rows, from, to }: { rows: Row[]; from: string; to: string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [tip, setTip] = useState<TipState>(null);
  const weekly = byWeek(from);

  const buckets = useMemo(() => {
    const keys: string[] = [];
    if (weekly) {
      const d = parseD(weekKey(from));
      while (iso(d) <= to) {
        keys.push(iso(d));
        d.setDate(d.getDate() + 7);
      }
    } else {
      const d = parseD(from.slice(0, 7) + "-01");
      while (iso(d).slice(0, 7) <= to.slice(0, 7)) {
        keys.push(iso(d).slice(0, 7));
        d.setMonth(d.getMonth() + 1);
      }
    }
    return keys.map((k) => {
      const inB = rows.filter((r) => (weekly ? weekKey(r.s.date) : r.s.date.slice(0, 7)) === k);
      return { k, mins: inB.reduce((n, r) => n + r.mins, 0), came: inB.filter((r) => r.mark === "attended").length, held: inB.length };
    });
  }, [rows, from, to, weekly]);

  const label = (k: string, i: number) => (weekly ? day(k) : monthLabel(k, i === 0 || k.endsWith("-01")));
  const max = Math.max(60, ...buckets.map((b) => b.mins));
  const step = max <= 180 ? 60 : max <= 480 ? 120 : max <= 960 ? 240 : 480;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);

  const H = 200,
    padL = 40,
    padR = 6,
    padT = 10,
    padB = 26;
  const plotW = Math.max(0, w - padL - padR);
  const plotH = H - padT - padB;
  const slot = buckets.length ? plotW / buckets.length : 0;
  const barW = Math.max(2, Math.min(32, slot - 2));
  const y = (m: number) => padT + plotH - (m / top) * plotH;
  const labelEvery = Math.max(1, Math.ceil(buckets.length / Math.max(1, Math.floor(plotW / 54))));

  return (
    <figure className="viz">
      <div ref={ref} className="viz-plot" onPointerLeave={() => setTip(null)}>
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label={`Training minutes per ${weekly ? "week" : "month"}. Highest: ${fmtMins(Math.max(...buckets.map((b) => b.mins)))}.`}>
            {ticks.map((t) => (
              <g key={t}>
                <line className={t === 0 ? "viz-base" : "viz-grid"} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
                <text className="viz-tick" x={padL - 6} y={y(t) + 4} textAnchor="end">
                  {t === 0 ? "0" : `${t / 60}h`}
                </text>
              </g>
            ))}
            {buckets.map((b, i) => {
              const x = padL + i * slot + (slot - barW) / 2;
              const h = Math.max(0, y(0) - y(b.mins));
              const r = Math.min(4, barW / 2, h);
              return (
                <g key={b.k}>
                  {b.mins > 0 && (
                    <path
                      className="viz-bar"
                      d={`M${x},${y(0)} V${y(b.mins) + r} Q${x},${y(b.mins)} ${x + r},${y(b.mins)} H${x + barW - r} Q${x + barW},${y(b.mins)} ${x + barW},${y(b.mins) + r} V${y(0)} Z`}
                    />
                  )}
                  {i % labelEvery === 0 && (
                    <text className="viz-tick" x={x + barW / 2} y={H - 8} textAnchor="middle">
                      {label(b.k, i)}
                    </text>
                  )}
                  <rect
                    className="viz-hit"
                    x={padL + i * slot}
                    y={padT}
                    width={slot}
                    height={plotH}
                    onPointerEnter={() =>
                      setTip({
                        x: Math.min(Math.max(padL + i * slot + slot / 2, 80), w - 80),
                        y: y(b.mins) - 8,
                        lines: [
                          weekly ? `Week of ${day(b.k)}` : monthLabel(b.k, true),
                          b.held ? `${b.mins ? fmtMins(b.mins) : "0 min"} · came to ${b.came} of ${b.held} session${b.held === 1 ? "" : "s"}` : "No sessions",
                        ],
                      })
                    }
                  />
                </g>
              );
            })}
          </svg>
        )}
        <Tip tip={tip} />
      </div>
      <details className="viz-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{weekly ? "Week of" : "Month"}</th>
              <th scope="col">Minutes</th>
              <th scope="col">Sessions came to</th>
            </tr>
          </thead>
          <tbody>
            {buckets.map((b) => (
              <tr key={b.k}>
                <th scope="row">{weekly ? day(b.k) : monthLabel(b.k, true)}</th>
                <td>{b.mins ? fmtMins(b.mins) : "–"}</td>
                <td>{b.held ? `${b.came} of ${b.held}` : "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/* ------------------------------------------------------------------ attendance: one mark per session */

function AttendanceStrip({ rows, teamName }: { rows: Row[]; teamName: (id: string) => string | undefined }) {
  const [tip, setTip] = useState<TipState>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const word: Record<Mark, string> = { attended: "Came", excused: "Said no", missed: "Didn't come" };
  function show(e: React.PointerEvent | React.FocusEvent, r: Row) {
    const box = wrap.current!.getBoundingClientRect();
    const el = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const team = teamName(r.s.team_id);
    setTip({
      x: Math.min(Math.max(el.left - box.left + el.width / 2, 80), box.width - 80),
      y: el.top - box.top - 6,
      lines: [longDay(r.s.date), `${r.s.title}${team ? ` (${team})` : ""}`, word[r.mark] + (r.mins ? ` · ${fmtMins(r.mins)}` : "")],
    });
  }
  return (
    <figure className="viz">
      <div ref={wrap} className="viz-plot" onPointerLeave={() => setTip(null)}>
        <div className="att-strip" role="list" aria-label="Sessions">
          {rows.map((r) => (
            <span
              key={r.s.id}
              role="listitem"
              tabIndex={0}
              className={`att-mark ${r.mark}`}
              aria-label={`${longDay(r.s.date)}, ${r.s.title}: ${word[r.mark]}`}
              onPointerEnter={(e) => show(e, r)}
              onFocus={(e) => show(e, r)}
              onBlur={() => setTip(null)}
            />
          ))}
        </div>
        <Tip tip={tip} />
      </div>
      <figcaption className="chart-legend">
        <span>
          <i className="att-mark attended" /> Came ({rows.filter((r) => r.mark === "attended").length})
        </span>
        <span>
          <i className="att-mark excused" /> Said no ({rows.filter((r) => r.mark === "excused").length})
        </span>
        <span>
          <i className="att-mark missed" /> Didn&apos;t come ({rows.filter((r) => r.mark === "missed").length})
        </span>
      </figcaption>
    </figure>
  );
}

/* ------------------------------------------------------------------ ratings: overall plus five small multiples */

function Ratings({ evs, from, to }: { evs: Evaluation[]; from: string; to: string }) {
  // Include the last review before the period, so the line starts from where they were.
  const before = evs.filter((e) => e.evaluated_on < from).pop();
  const shown = [...(before ? [before] : []), ...evs.filter((e) => e.evaluated_on >= from)];
  const start = shown[0].evaluated_on < from ? shown[0].evaluated_on : from;
  const series = (get: (e: Evaluation) => number | null | undefined) =>
    shown.map((e) => ({ d: e.evaluated_on, v: get(e) })).filter((p): p is { d: string; v: number } => typeof p.v === "number");

  return (
    <>
      <RatingLine title="Overall" points={series((e) => overall(e.ratings))} from={start} to={to} big />
      <div className="prog-multiples">
        {AREAS.map((a) => (
          <RatingLine key={a.key} title={a.label} points={series((e) => e.ratings[a.key])} from={start} to={to} />
        ))}
      </div>
      <details className="viz-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">Review</th>
              {AREAS.map((a) => (
                <th key={a.key} scope="col">
                  {a.label}
                </th>
              ))}
              <th scope="col">Overall</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => (
              <tr key={e.id}>
                <th scope="row">{day(e.evaluated_on)}</th>
                {AREAS.map((a) => (
                  <td key={a.key}>{e.ratings[a.key] ?? "–"}</td>
                ))}
                <td>{overall(e.ratings) ?? "–"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

function RatingLine({ title, points, from, to, big }: { title: string; points: { d: string; v: number }[]; from: string; to: string; big?: boolean }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const last = points[points.length - 1];
  const first = points[0];
  const change = last && first && points.length > 1 ? round1(last.v - first.v) : 0;

  const H = big ? 190 : 104,
    padL = big ? 28 : 6,
    padR = 10,
    padT = 10,
    padB = big ? 26 : 8;
  const t0 = parseD(from).getTime(),
    t1 = Math.max(parseD(to).getTime(), t0 + 864e5);
  const x = (d: string) => padL + ((parseD(d).getTime() - t0) / (t1 - t0)) * Math.max(0, w - padL - padR);
  const y = (v: number) => padT + (1 - (v - 1) / 9) * (H - padT - padB);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.d)},${y(p.v)}`).join(" ");

  function move(e: React.PointerEvent) {
    if (!points.length) return;
    const px = e.clientX - (e.currentTarget as Element).getBoundingClientRect().left;
    let best = 0;
    points.forEach((p, i) => {
      if (Math.abs(x(p.d) - px) < Math.abs(x(points[best].d) - px)) best = i;
    });
    setHover(best);
  }
  const hp = hover !== null ? points[hover] : null;

  return (
    <figure className={`viz ${big ? "" : "viz-small"}`}>
      <figcaption className="viz-title">
        <b>{title}</b>
        <span className="tnum">{last ? last.v : "–"}</span>
        {change !== 0 && (
          <span className={`delta ${change > 0 ? "up" : "down"}`} aria-label={`${change > 0 ? "up" : "down"} ${Math.abs(change)} over this period`}>
            {change > 0 ? "▲" : "▼"} {Math.abs(change)}
          </span>
        )}
      </figcaption>
      <div ref={ref} className="viz-plot" onPointerMove={move} onPointerLeave={() => setHover(null)}>
        {w > 0 && (
          <svg width={w} height={H} role="img" aria-label={`${title} rating: ${points.map((p) => `${day(p.d)} ${p.v}`).join(", ") || "not rated"}`}>
            {(big ? [1, 5, 10] : [1, 10]).map((t) => (
              <g key={t}>
                <line className={t === 1 ? "viz-base" : "viz-grid"} x1={padL} x2={w - padR} y1={y(t)} y2={y(t)} />
                {big && (
                  <text className="viz-tick" x={padL - 6} y={y(t) + 4} textAnchor="end">
                    {t}
                  </text>
                )}
              </g>
            ))}
            {big && (
              <>
                <text className="viz-tick" x={padL} y={H - 8}>
                  {day(from)}
                </text>
                <text className="viz-tick" x={w - padR} y={H - 8} textAnchor="end">
                  {day(to)}
                </text>
              </>
            )}
            {hp && <line className="viz-cross" x1={x(hp.d)} x2={x(hp.d)} y1={padT} y2={H - padB} />}
            {points.length > 1 && <path className="viz-line" d={path} />}
            {points.map((p, i) => (
              <circle key={p.d + i} className="viz-dot" cx={x(p.d)} cy={y(p.v)} r={hover === i ? 5 : 4} />
            ))}
          </svg>
        )}
        {hp && w > 0 && <Tip tip={{ x: Math.min(Math.max(x(hp.d), 70), w - 70), y: y(hp.v) - 10, lines: [`${title}: ${hp.v}`, `Review on ${day(hp.d)}`] }} />}
      </div>
    </figure>
  );
}

