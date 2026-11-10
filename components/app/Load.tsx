"use client";

import { useApp } from "./AppProvider";
import { Shirt } from "@/components/ui";
import { fmtMins, isHighLoad, weeklyAverage } from "@/lib/load";

const HIGH_HELP = "Much more than their usual week. Sudden jumps in training load raise injury risk, so consider a lighter session.";

/** Full load breakdown for one player (player view). */
export function LoadCard({ playerId }: { playerId: string }) {
  const { loadOf } = useApp();
  const l = loadOf(playerId);
  if (!l || (!l.sessions_28d && !l.planned_sessions_7d)) return null;
  const avg = weeklyAverage(l);
  const high = isHighLoad(l);
  const max = Math.max(l.mins_7d, avg, 1);
  return (
    <div className={`card load-card${high ? " high" : ""}`}>
      <div className="load-head">
        <span className="eyebrow">Training load · all teams</span>
        {high && <span className="rbadge no">High load</span>}
      </div>
      <div className="load-rows">
        <div className="load-row">
          <span>Last 7 days</span>
          <span className="bar">
            <i style={{ width: `${(100 * l.mins_7d) / max}%`, background: high ? "var(--bad)" : "var(--accent)" }} />
          </span>
          <b>{fmtMins(l.mins_7d)}</b>
        </div>
        <div className="load-row">
          <span>Usual week</span>
          <span className="bar">
            <i style={{ width: `${(100 * avg) / max}%`, background: "var(--muted)" }} />
          </span>
          <b>{fmtMins(avg)}</b>
        </div>
      </div>
      <span className="sub">
        {l.sessions_7d} session{l.sessions_7d === 1 ? "" : "s"} in the last 7 days{l.teams_7d > 1 ? ` with ${l.teams_7d} teams` : ""} · {l.planned_sessions_7d} planned in the next 7 days ({fmtMins(l.planned_mins_7d)})
      </span>
      {high && <span className="sub" style={{ color: "var(--bad)" }}>{HIGH_HELP}</span>}
    </div>
  );
}

/** One-line summary for squad cards. */
export function LoadLine({ playerId }: { playerId: string }) {
  const { loadOf } = useApp();
  const l = loadOf(playerId);
  if (!l || !l.sessions_28d) return null;
  const high = isHighLoad(l);
  return (
    <span className="load-line" title={high ? HIGH_HELP : "Minutes trained in the last 7 days, across all teams"}>
      Load 7 days: <b>{fmtMins(l.mins_7d)}</b>
      {l.teams_7d > 1 && <span className="team-tag">{l.teams_7d} teams</span>}
      {high && <span className="rbadge no">High</span>}
    </span>
  );
}

/** Overview card for coaches: who in this team has trained the most this week, across all teams. */
export function LoadWatch() {
  const { squad, loadOf, open } = useApp();
  const rows = squad()
    .map((p) => ({ p, l: loadOf(p.id) }))
    .filter((x) => x.l && (x.l.mins_7d > 0 || x.l.planned_mins_7d > 0))
    .sort((a, b) => b.l!.mins_7d - a.l!.mins_7d || b.l!.planned_mins_7d - a.l!.planned_mins_7d)
    .slice(0, 6);
  if (!rows.length) return null;
  const highCount = squad().filter((p) => isHighLoad(loadOf(p.id))).length;
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-h">
        <h2>Load watch</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {highCount ? `${highCount} on high load` : "Last 7 days, all teams"}
        </span>
      </div>
      <div className="card-b rows">
        {rows.map(({ p, l }) => (
          <button key={p.id} className="rowi" onClick={() => open({ kind: "player", id: p.id })}>
            <Shirt p={p} small />
            <span className="rt">
              <b>{p.full_name}</b>
              <span>
                {l!.sessions_7d} session{l!.sessions_7d === 1 ? "" : "s"}
                {l!.teams_7d > 1 ? ` · ${l!.teams_7d} teams` : ""} · usual week {fmtMins(weeklyAverage(l!))} · next 7 days {fmtMins(l!.planned_mins_7d)}
              </span>
            </span>
            <span style={{ display: "grid", justifyItems: "end", gap: 2 }}>
              <b className="tnum">{fmtMins(l!.mins_7d)}</b>
              {isHighLoad(l) && <span className="rbadge no">High</span>}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

/** Short "this week" line for players and parents. */
export function MyLoadLine({ playerId }: { playerId: string }) {
  const { loadOf } = useApp();
  const l = loadOf(playerId);
  if (!l) return null;
  return (
    <span className="muted" style={{ fontSize: 13 }}>
      Last 7 days: <b style={{ color: "var(--ink)" }}>{fmtMins(l.mins_7d)}</b> · next 7 days: <b style={{ color: "var(--ink)" }}>{fmtMins(l.planned_mins_7d)}</b>
      {isHighLoad(l) && (
        <>
          {" "}
          <span className="rbadge no">High load</span>
        </>
      )}
    </span>
  );
}
