"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { injuryLabel, STAGES } from "../injuries/Injuries";
import { fmtDay, fmtMon, fmtNum, iso, parseD, todayIso, weekKey } from "@/lib/format";
import type { Player } from "@/lib/types";

/* Coach insights: how the team is turning up, replying, playing and recovering. Staff only. */

const LINE = "#c2691c";
const RANGES = [
  { k: "4w", l: "4 weeks", days: 28 },
  { k: "8w", l: "8 weeks", days: 56 },
  { k: "season", l: "This year", days: 0 },
] as const;
type RangeKey = (typeof RANGES)[number]["k"];
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const short = (d: string) => `${fmtNum(d)} ${fmtMon(d)}`;

export function InsightsPage() {
  const {
    data,
    team,
    squad,
    sessionsOf,
    attendedSet,
    repliesFor,
    matchesOf,
    squadOf,
    can,
    open,
  } = useApp();
  const [range, setRange] = useState<RangeKey>("8w");
  const today = todayIso();
  const from = useMemo(() => {
    const r = RANGES.find((x) => x.k === range)!;
    return r.days
      ? iso(new Date(Date.now() - r.days * 864e5))
      : `${today.slice(0, 4)}-01-01`;
  }, [range, today]);

  if (!team || !can("attendance.view"))
    return (
      <div className="md-home">
        <h1>Coach insights</h1>
        <p className="md-muted">Insights are for coaches and club staff.</p>
      </div>
    );

  const players = squad(team.id);
  const n = players.length;
  const all = sessionsOf(team.id).filter((s) => s.date >= from);
  const past = all.filter((s) => s.date < today || s.date === today);
  // Only sessions where a register was really taken (a few ticks don't count), so players
  // aren't marked absent for sessions where the coach just didn't tick anyone.
  const minTicks = Math.max(2, Math.ceil(n * 0.25));
  const taken = past.filter((s) => attendedSet(s.id).size >= minTicks);
  const untaken = past.length - taken.length;
  // The most recent session without a proper register, to fix in one tap.
  const lastUntaken = [...past].reverse().find((x) => !taken.includes(x));

  // Weekly attendance % (attended ÷ squad size, averaged over the week's sessions).
  const weeks = new Map<string, { a: number; s: number; d: string }>();
  for (const s of taken) {
    const k = weekKey(s.date);
    const w = weeks.get(k) ?? { a: 0, s: 0, d: k };
    w.a += [...attendedSet(s.id)].filter((id) =>
      players.some((p) => p.id === id),
    ).length;
    w.s += n;
    weeks.set(k, w);
  }
  const trend = [...weeks.values()]
    .sort((a, b) => a.d.localeCompare(b.d))
    .map((w) => ({ d: w.d, v: pct(w.a, w.s) }));
  const attAvg = taken.length
    ? Math.round(trend.reduce((t, w) => t + w.v, 0) / trend.length)
    : null;

  // Replies.
  const asked = all.filter(
    (s) => s.date >= from && s.date <= iso(new Date(Date.now() + 7 * 864e5)),
  );
  // Like registers: only judge replies on sessions where families were actually replying.
  const replyActive = asked.filter((s) => repliesFor(s.id).size >= minTicks);
  const repliedBy = (p: Player) =>
    replyActive.filter((s) => repliesFor(s.id).has(p.id)).length;
  const replyAvg =
    asked.length && n
      ? pct(
          players.reduce((t, p) => t + repliedBy(p), 0),
          asked.length * n,
        )
      : null;

  // Per-player attendance, to spot who is dropping off.
  const rows = players.map((p) => {
    const seq = taken.map((s) => attendedSet(s.id).has(p.id));
    const recent = seq.slice(-4);
    const before = seq.slice(0, -4);
    const rRate = recent.length
      ? pct(recent.filter(Boolean).length, recent.length)
      : null;
    const bRate = before.length
      ? pct(before.filter(Boolean).length, before.length)
      : null;
    let streak = 0;
    for (let i = seq.length - 1; i >= 0 && !seq[i]; i--) streak++;
    // A run of misses only matters if they used to come.
    const cameBefore = seq.slice(0, seq.length - streak).some(Boolean);
    return {
      p,
      rate: seq.length ? pct(seq.filter(Boolean).length, seq.length) : null,
      rRate,
      bRate,
      streak,
      cameBefore,
      seen: seq.some(Boolean),
      n: seq.length,
      replied: repliedBy(p),
    };
  });
  const dropping = rows
    .filter(
      (r) =>
        (r.streak >= 3 && r.cameBefore) ||
        (r.rRate !== null && r.bRate !== null && r.bRate >= 50 && r.bRate - r.rRate >= 30),
    )
    .sort((a, b) => b.streak - a.streak);
  // Never ticked at a register in this range: could be new, injured, or not on the register yet.
  const notSeen = rows.filter((r) => r.n >= 3 && !r.seen);
  const quiet =
    replyActive.length >= 2
      ? rows
          .filter((r) => pct(r.replied, replyActive.length) < 50)
          .sort((a, b) => a.replied - b.replied)
      : [];

  // Minutes played in finished matches.
  const played = matchesOf(team.id).filter(
    (m) => m.status === "played" && m.date >= from,
  );
  const mins = players
    .map((p) => {
      const ms = played
        .map((m) => squadOf(m.id).find((x) => x.player_id === p.id))
        .filter(Boolean);
      return {
        p,
        mins: ms.reduce((t, x) => t + (x!.minutes ?? 0), 0),
        apps: ms.filter((x) => (x!.minutes ?? 0) > 0).length,
      };
    })
    .sort((a, b) => b.mins - a.mins);
  const maxMins = Math.max(1, ...mins.map((m) => m.mins));
  const possible = played.reduce((t, m) => t + (m.length_mins || 90), 0);

  // Injuries.
  const ids = new Set(players.map((p) => p.id));
  const inj = data.injuries.filter((i) => ids.has(i.player_id));
  const injOpen = inj.filter((i) => i.status === "active");
  const injRange = inj.filter((i) => i.occurred_on >= from);
  const daysLost = injRange.reduce(
    (t, i) =>
      t +
      Math.max(
        0,
        Math.round(
          (+parseD(i.recovered_on ?? today) - +parseD(i.occurred_on)) / 864e5,
        ),
      ),
    0,
  );
  const parts = new Map<string, number>();
  for (const i of injRange)
    parts.set(
      injuryLabel({ ...i, side: "na" }),
      (parts.get(injuryLabel({ ...i, side: "na" })) ?? 0) + 1,
    );

  // Fitness.
  const fit = data.fitnessResults.filter(
    (r) => r.team_id === team.id && r.tested_on >= from,
  );
  const fitDays = data.fitnessDays.filter(
    (d) => d.team_id === team.id && d.date >= from && d.date <= today,
  );
  const tested = new Set(fit.map((r) => r.player_id)).size;

  const who = (p: Player) => (
    <button
      type="button"
      className="in-who"
      onClick={() => open({ kind: "player", id: p.id })}
    >
      {p.full_name}
    </button>
  );

  return (
    <div className="md-home in">
      <div className="phead">
        <div>
          <div className="eyebrow">{team.name} · Insights</div>
          <h1>Coach insights</h1>
        </div>
        <div className="seg in-range" role="group" aria-label="Time range">
          {RANGES.map((r) => (
            <button
              key={r.k}
              type="button"
              aria-selected={range === r.k}
              onClick={() => setRange(r.k)}
            >
              {r.l}
            </button>
          ))}
        </div>
      </div>

      <div className="in-tiles">
        <div>
          <small>Attendance</small>
          <b>{attAvg === null ? "–" : `${attAvg}%`}</b>
          <span>
            register taken at {taken.length} of {past.length} session{past.length === 1 ? "" : "s"}
          </span>
        </div>
        <div>
          <small>Replies</small>
          <b>{replyAvg === null ? "–" : `${replyAvg}%`}</b>
          <span>of players reply before sessions</span>
        </div>
        <div>
          <small>Injured now</small>
          <b>{injOpen.length}</b>
          <span>
            {injRange.length} new in this range · {daysLost} days lost
          </span>
        </div>
        <div>
          <small>Fitness tested</small>
          <b>
            {tested}/{n}
          </b>
          <span>
            {fitDays.length} test day{fitDays.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      <section className="in-card in-wide">
        <div className="in-h">
          <h2>Attendance by week</h2>
          <span className="fl-note">% of the squad at training</span>
        </div>
        {trend.length >= 2 ? (
          <TrendChart points={trend} />
        ) : (
          <p className="md-muted">
            Take attendance at a couple more sessions to see a trend.
          </p>
        )}
        {trend.length >= 2 && (
          <details className="in-table">
            <summary>Show as a table</summary>
            <table>
              <thead>
                <tr>
                  <th>Week of</th>
                  <th>Attendance</th>
                </tr>
              </thead>
              <tbody>
                {trend.map((t) => (
                  <tr key={t.d}>
                    <td>{short(t.d)}</td>
                    <td>{t.v}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        )}
      </section>

      <div className="in-grid">
        <section className="in-card">
          <div className="in-h">
            <h2>Worth a check-in</h2>
            <span className="fl-note">dropping off at training</span>
          </div>
          {dropping.length ? (
            <ul className="in-list">
              {dropping.map((r) => (
                <li key={r.p.id}>
                  {who(r.p)}
                  <span>
                    {r.streak >= 3 && r.cameBefore
                      ? `Hasn't been for ${r.streak} sessions`
                      : `${r.bRate}% → ${r.rRate}% in the last 4`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="md-muted">Nobody is dropping off. Nice.</p>
          )}
          {notSeen.length > 0 && (
            <p className="in-foot">
              Not ticked at any register in this range: {notSeen.map((r) => r.p.full_name.split(" ")[0]).join(", ")}. New, injured, or missed off the register?
            </p>
          )}
          {untaken > 0 && (
            <div className="in-foot in-reg">
              <span>
                Registers weren&apos;t taken at {untaken} of {past.length} past session{past.length === 1 ? "" : "s"}, so those are left out.
              </span>
              {lastUntaken && (
                <button type="button" className="btn sm" onClick={() => open({ kind: "session", id: lastUntaken.id, tab: "attendance" })}>
                  Take the register for {fmtDay(lastUntaken.date)} {fmtNum(lastUntaken.date)} {fmtMon(lastUntaken.date)}
                </button>
              )}
            </div>
          )}
        </section>

        <section className="in-card">
          <div className="in-h">
            <h2>Slow to reply</h2>
            <span className="fl-note">replied to under half</span>
          </div>
          {quiet.length ? (
            <ul className="in-list">
              {quiet.map((r) => (
                <li key={r.p.id}>
                  {who(r.p)}
                  <span>
                    {r.replied} of {replyActive.length}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="md-muted">
              {replyActive.length >= 2 ? (
                "Everyone's replying. 👍"
              ) : asked.length >= 2 ? (
                <>
                  Families haven&apos;t started replying to sessions yet. Share the <Link href="/get-app">Get the app</Link> guide so they can reply in one tap.
                </>
              ) : (
                "Not enough sessions yet."
              )}
            </p>
          )}
        </section>

        <section className="in-card in-wide">
          <div className="in-h">
            <h2>Minutes played</h2>
            <span className="fl-note">
              {played.length} match{played.length === 1 ? "" : "es"}
              {possible ? ` · ${possible} possible` : ""}
            </span>
          </div>
          {played.length && mins.some((m) => m.mins > 0) ? (
            <ul className="in-bars" aria-label="Minutes played by player">
              {mins.map((m) => (
                <li
                  key={m.p.id}
                  title={`${m.p.full_name}: ${m.mins} mins in ${m.apps} match${m.apps === 1 ? "" : "es"}${possible ? ` (${pct(m.mins, possible)}% of possible)` : ""}`}
                >
                  {who(m.p)}
                  <span className="in-bar">
                    <i style={{ width: `${(m.mins / maxMins) * 100}%` }} />
                  </span>
                  <span className="in-val">{m.mins}&prime;</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="md-muted">
              Record minutes on finished matches to see who&apos;s getting game
              time.
            </p>
          )}
        </section>

        <section className="in-card">
          <div className="in-h">
            <h2>Injuries</h2>
            <Link href="/squad" className="in-more">
              Squad →
            </Link>
          </div>
          {injOpen.length ? (
            <ul className="in-list">
              {injOpen.map((i) => {
                const p = players.find((x) => x.id === i.player_id)!;
                return (
                  <li key={i.id}>
                    {who(p)}
                    <span>
                      {injuryLabel(i)} · step {i.stage}/6,{" "}
                      {STAGES[i.stage - 1].t.toLowerCase()}
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="md-muted">No one is injured right now.</p>
          )}
          {parts.size > 0 && (
            <p className="in-foot">
              In this range:{" "}
              {[...parts.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([k, v]) => `${k}${v > 1 ? ` ×${v}` : ""}`)
                .join(", ")}
            </p>
          )}
        </section>

        <section className="in-card">
          <div className="in-h">
            <h2>Fitness</h2>
            <Link href="/fitness" className="in-more">
              Results →
            </Link>
          </div>
          {fit.length ? (
            <p className="in-foot">
              {fit.length} result{fit.length === 1 ? "" : "s"} from {tested}{" "}
              player{tested === 1 ? "" : "s"}.{" "}
              {n - tested > 0
                ? `${n - tested} not tested yet: ${players
                    .filter((p) => !fit.some((r) => r.player_id === p.id))
                    .map((p) => p.full_name.split(" ")[0])
                    .join(", ")}.`
                : "Everyone's been tested."}
            </p>
          ) : (
            <p className="md-muted">No fitness tests in this range.</p>
          )}
        </section>
      </div>
    </div>
  );
}

/** Single-series line: weekly attendance %, crosshair + tooltip on hover. */
function TrendChart({ points }: { points: { d: string; v: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(720);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setW(Math.max(280, Math.round(el.clientWidth))),
    );
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const H = W < 500 ? 190 : 220,
    L = 40,
    R = 16,
    T = 14,
    B = 28;
  const x = (i: number) =>
    L + (points.length === 1 ? 0 : (i / (points.length - 1)) * (W - L - R));
  const y = (v: number) => T + (1 - v / 100) * (H - T - B);
  const path = points
    .map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`)
    .join("");
  const every = Math.ceil(
    points.length / Math.max(2, Math.floor((W - L - R) / 80)),
  );
  const showTick = (i: number) =>
    i === points.length - 1
      ? true
      : i % every === 0 &&
        (points.length - 1 - i >= every || points.length - 1 - i === 0);
  const h = hover === null ? null : points[hover];
  return (
    <div className="in-chart" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Weekly attendance percentage"
        onMouseLeave={() => setHover(null)}
      >
        {[0, 25, 50, 75, 100].map((g) => (
          <g key={g}>
            <line
              x1={L}
              x2={W - R}
              y1={y(g)}
              y2={y(g)}
              stroke="#e4e7ec"
              strokeWidth={1}
            />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" className="in-ax">
              {g}%
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          showTick(i) ? (
            <text
              key={p.d}
              x={x(i)}
              y={H - 8}
              textAnchor={
                i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"
              }
              className="in-ax"
            >
              {short(p.d)}
            </text>
          ) : null,
        )}
        {h && (
          <line
            x1={x(hover!)}
            x2={x(hover!)}
            y1={T}
            y2={H - B}
            stroke="#98a2b3"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        )}
        <path
          d={path}
          fill="none"
          stroke={LINE}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {points.map((p, i) => (
          <g key={p.d}>
            <circle
              cx={x(i)}
              cy={y(p.v)}
              r={hover === i ? 5 : 4}
              fill={LINE}
              stroke="#fff"
              strokeWidth={2}
            />
            <rect
              x={x(i) - (W - L - R) / Math.max(1, points.length - 1) / 2}
              y={T}
              width={(W - L - R) / Math.max(1, points.length - 1)}
              height={H - T - B}
              fill="transparent"
              onMouseEnter={() => setHover(i)}
              onTouchStart={() => setHover(i)}
            />
          </g>
        ))}
        <text
          x={x(points.length - 1)}
          y={y(points[points.length - 1].v) - 10}
          textAnchor="end"
          className="in-lab"
        >
          {points[points.length - 1].v}%
        </text>
      </svg>
      {h && (
        <div
          className="in-tip"
          style={{
            left: `${(x(hover!) / W) * 100}%`,
            top: `${(y(h.v) / H) * 100}%`,
          }}
        >
          <small>Week of {short(h.d)}</small>
          <b>{h.v}%</b>
        </div>
      )}
    </div>
  );
}
