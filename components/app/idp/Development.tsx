"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Shirt } from "@/components/ui";
import { NoTeams } from "../views/Overview";
import { PlayerIdp } from "./PlayerIdp";
import { AREAS, overall, reviewDue, REVIEW_DAYS } from "@/lib/idp";
import { fmtMon, fmtNum } from "@/lib/format";

/** Coaches: the team's development overview. Players and parents: their own plan(s). */
export function DevelopmentHome() {
  const { data, team, can, isAdmin, myPlayers, kidName } = useApp();
  const staffView = can("idp.view");
  if (!staffView) {
    if (myPlayers.length === 1) return <PlayerIdp playerId={myPlayers[0].id} />;
    return (
      <>
        <div className="phead">
          <div>
            <div className="eyebrow">{data.club.name}</div>
            <h1>Development</h1>
          </div>
        </div>
        {myPlayers.length ? (
          <div className="pgrid">
            {myPlayers.map((p) => (
              <Link key={p.id} href={`/development/${p.id}`} className="card pcard" style={{ textDecoration: "none", color: "inherit" }}>
                <Shirt p={p} />
                <span className="nm">{kidName(p)}&apos;s development plan</span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="empty">Your account isn&apos;t linked to a player yet. Ask your club admin to link you on the Club &amp; members page.</div>
        )}
      </>
    );
  }
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  return <TeamDevelopment />;
}

function TeamDevelopment() {
  const { team, squad, evaluationsOf, goalsOf, canDo } = useApp();
  const [filter, setFilter] = useState<"all" | "due" | "goals">("all");
  const players = squad();
  const rows = players.map((p) => {
    const evs = evaluationsOf(p.id);
    const goals = goalsOf(p.id);
    return { p, latest: evs[0], previous: evs[1], active: goals.filter((g) => g.status === "active"), achieved: goals.filter((g) => g.status === "achieved") };
  });
  const due = rows.filter((r) => reviewDue(r.latest));
  const evaluated = rows.filter((r) => r.latest);
  const activeGoals = rows.reduce((n, r) => n + r.active.length, 0);
  const achievedGoals = rows.reduce((n, r) => n + r.achieved.length, 0);
  const teamAvg = AREAS.map((a) => {
    const vals = evaluated.map((r) => r.latest!.ratings[a.key]).filter((v): v is number => typeof v === "number");
    return { a, avg: vals.length ? Math.round((10 * vals.reduce((s, v) => s + v, 0)) / vals.length) / 10 : null, n: vals.length };
  });
  const shown = rows.filter((r) => filter === "all" || (filter === "due" ? reviewDue(r.latest) : r.active.length > 0));
  const canEdit = canDo("idp.edit", team!.id);

  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">{team!.name}</div>
          <h1>Development</h1>
        </div>
      </div>
      <div className="stats" style={{ marginTop: 0 }}>
        <div className="card stat">
          <span className="eyebrow">Reviewed</span>
          <div className="v tnum">
            {players.length - due.length}
            <small>/{players.length}</small>
          </div>
          <span className="sub">evaluated in the last {REVIEW_DAYS} days</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Due for review</span>
          <div className="v tnum" style={{ color: due.length ? "var(--warn)" : undefined }}>
            {due.length}
          </div>
          <span className="sub">{due.length ? "players need an evaluation" : "everyone is up to date"}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Active goals</span>
          <div className="v tnum">{activeGoals}</div>
          <span className="sub">{achievedGoals} achieved so far</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Team average</span>
          <div className="v tnum">
            {overall(Object.fromEntries(teamAvg.filter((x) => x.avg !== null).map((x) => [x.a.key, x.avg!]))) ?? "–"}
            <small>/10</small>
          </div>
          <span className="sub">latest evaluations, all areas</span>
        </div>
      </div>

      {evaluated.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h2>Team profile</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              Average of each player&apos;s latest evaluation
            </span>
          </div>
          <div className="card-b team-profile">
            {teamAvg.map(({ a, avg, n }) => (
              <div key={a.key} className="tp-row" title={`${a.label}: ${avg ?? "no ratings"} (from ${n} players)`}>
                <span className="tp-label">{a.label}</span>
                <span className="rating-track" aria-hidden="true">
                  <i style={{ width: `${((avg ?? 0) / 10) * 100}%` }} />
                </span>
                <b className="tnum">{avg ?? "–"}</b>
              </div>
            ))}
            <p className="muted" style={{ margin: "4px 0 0", fontSize: 13 }}>
              Lowest area: <b style={{ color: "var(--ink)" }}>{[...teamAvg].filter((x) => x.avg !== null).sort((x, y) => x.avg! - y.avg!)[0]?.a.label ?? "–"}</b>. A good theme for upcoming sessions.
            </p>
          </div>
        </section>
      )}

      <div className="toolbar" style={{ marginTop: 18 }}>
        <div className="chips">
          <button className="chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>
            All players<span className="n">{rows.length}</span>
          </button>
          <button className="chip" aria-pressed={filter === "due"} onClick={() => setFilter("due")}>
            Due for review<span className="n">{due.length}</span>
          </button>
          <button className="chip" aria-pressed={filter === "goals"} onClick={() => setFilter("goals")}>
            With active goals<span className="n">{rows.filter((r) => r.active.length).length}</span>
          </button>
        </div>
      </div>

      {shown.length ? (
        <div className="dev-list">
          {shown.map(({ p, latest, previous, active }) => {
            const ov = overall(latest?.ratings);
            const pov = overall(previous?.ratings);
            const isDue = reviewDue(latest);
            return (
              <Link key={p.id} href={`/development/${p.id}`} className="card dev-row">
                <Shirt p={p} />
                <span className="dev-main">
                  <b>{p.full_name}</b>
                  <span className="muted">
                    {latest ? `Last evaluated ${fmtNum(latest.evaluated_on)} ${fmtMon(latest.evaluated_on)}` : "Not evaluated yet"}
                    {isDue && <span className="rbadge wait" style={{ marginLeft: 8 }}>{latest ? "Due for review" : canEdit ? "Needs first evaluation" : "Not evaluated"}</span>}
                  </span>
                  {active.length > 0 && (
                    <span className="dev-goals">
                      {active.slice(0, 2).map((g) => (
                        <span key={g.id} className="dev-goal" title={`${g.title}: ${g.progress}%`}>
                          <span className="bar">
                            <i style={{ width: `${g.progress}%` }} />
                          </span>
                          {g.title}
                        </span>
                      ))}
                      {active.length > 2 && <span className="muted">+{active.length - 2} more</span>}
                    </span>
                  )}
                </span>
                <span className="dev-mini" aria-hidden="true">
                  {AREAS.map((a) => (
                    <span key={a.key} title={`${a.label}: ${latest?.ratings[a.key] ?? "–"}`}>
                      <i style={{ height: `${((latest?.ratings[a.key] ?? 0) / 10) * 100}%` }} />
                    </span>
                  ))}
                </span>
                <span className="dev-ov">
                  <b className="tnum">{ov ?? "–"}</b>
                  {ov !== null && pov !== null && ov !== pov && <span className={`delta ${ov > pov ? "up" : "down"}`}>{ov > pov ? "▲" : "▼"} {Math.abs(Math.round((ov - pov) * 10) / 10)}</span>}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="empty">{rows.length ? "No players match this filter." : "No players in this team yet."}</div>
      )}
    </>
  );
}
