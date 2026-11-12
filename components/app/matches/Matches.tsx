"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { DateBox, Icon } from "@/components/ui";
import { NoTeams } from "../views/Overview";
import { ReplyButtons } from "../Replies";
import { HA_LABEL, RESULT_WORD, playerTotals, resultOf, seasonOf, teamRecord, type PlayerTotals, type Result } from "@/lib/matches";
import { hhmm, parseD, todayIso } from "@/lib/format";
import type { Match, Player } from "@/lib/types";

const longDate = (d: string) => parseD(d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

/** Opens a match when the page is reached from a notification (?m=<id>). */
function useOpenFromUrl() {
  const { open, data } = useApp();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("m");
    if (id && data.matches.some((m) => m.id === id)) {
      open({ kind: "match", id });
      window.history.replaceState(null, "", "/matches");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

export function Matches() {
  const { data } = useApp();
  useOpenFromUrl();
  return data.role === "player" || data.role === "parent" ? <FamilyMatches /> : <TeamMatches />;
}

export function ResultBadge({ r }: { r: Result }) {
  return (
    <span className={`res-badge ${r}`} title={RESULT_WORD[r]}>
      {r}
    </span>
  );
}

/* ================================================================ coaches */

function TeamMatches() {
  const { team, matchesOf, canDo, isAdmin, open, squad, matchRepliesFor, squadOf } = useApp();
  const [tab, setTab] = useState<"upcoming" | "results" | "stats">("upcoming");
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const canEdit = canDo("matches.edit", team.id);
  const today = todayIso();
  const all = matchesOf();
  const upcoming = all.filter((m) => m.status !== "played" && m.date >= today);
  const results = all.filter((m) => m.status === "played" || m.date < today).reverse();
  const players = squad();

  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">{team.name}</div>
          <h1>Matches</h1>
        </div>
        {canEdit && (
          <div className="phead-actions">
            <button className="btn" onClick={() => open({ kind: "import-draw" })}>
              Import draw
            </button>
            <button className="btn primary" onClick={() => open({ kind: "match", id: null })}>
              <Icon id="i-plus" />
              Add match
            </button>
          </div>
        )}
      </div>
      <div className="toolbar">
        <div className="chips">
          <button className="chip" aria-pressed={tab === "upcoming"} onClick={() => setTab("upcoming")}>
            Fixtures<span className="n">{upcoming.length}</span>
          </button>
          <button className="chip" aria-pressed={tab === "results"} onClick={() => setTab("results")}>
            Results<span className="n">{results.length}</span>
          </button>
          <button className="chip" aria-pressed={tab === "stats"} onClick={() => setTab("stats")}>
            Season stats
          </button>
        </div>
      </div>

      {tab === "stats" ? (
        <SeasonStats matches={all} players={players} />
      ) : (tab === "upcoming" ? upcoming : results).length ? (
        <div className="match-list">
          {(tab === "upcoming" ? upcoming : results).map((m) => {
            const res = resultOf(m);
            const replies = matchRepliesFor(m.id);
            const yes = players.filter((p) => replies.get(p.id)?.going).length;
            const no = players.filter((p) => replies.get(p.id)?.going === false).length;
            const picked = squadOf(m.id).length;
            return (
              <button key={m.id} className={`card scard match-card${m.status !== "scheduled" && !res ? " off" : ""}`} onClick={() => open({ kind: "match", id: m.id })}>
                <DateBox date={m.date} />
                <div style={{ minWidth: 0 }}>
                  <h3>
                    vs {m.opponent} <span className={`ha ${m.home_away}`}>{HA_LABEL[m.home_away]}</span>
                    {m.status === "postponed" && <span className="tag-off">Postponed</span>}
                    {m.status === "cancelled" && <span className="tag-off">Cancelled</span>}
                  </h3>
                  <p className="muted match-meta">
                    {hhmm(m.kickoff)}
                    {m.venue && ` · ${m.venue}`}
                    {(m.competition || m.round) && ` · ${[m.competition, m.round && `Round ${m.round}`].filter(Boolean).join(" ")}`}
                  </p>
                  {tab === "upcoming" && m.status === "scheduled" && (
                    <p className="match-meta">
                      <span className="ok">✓ {yes}</span> <span className="bad">✕ {no}</span> <span className="muted">? {players.length - yes - no}</span>
                      <span className="muted"> · {m.squad_published ? "Squad announced" : picked ? `Squad picked (${picked}), not announced` : "Squad not picked"}</span>
                    </p>
                  )}
                </div>
                {res ? (
                  <span className="match-score">
                    <ResultBadge r={res} />
                    <b className="tnum">
                      {m.our_score}–{m.their_score}
                    </b>
                  </span>
                ) : m.date < today && m.status === "scheduled" ? (
                  <span className="muted" style={{ fontSize: 13 }}>
                    Add result
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="empty">
          {tab === "upcoming" ? (
            <>
              No fixtures yet.{" "}
              {canEdit && (
                <>
                  <button className="linklike" onClick={() => open({ kind: "import-draw" })}>
                    Import your draw
                  </button>{" "}
                  or add matches one by one.
                </>
              )}
            </>
          ) : (
            "No results yet."
          )}
        </div>
      )}
    </>
  );
}

type SortKey = "name" | keyof PlayerTotals;
const COLS: { key: SortKey; label: string; title?: string }[] = [
  { key: "name", label: "Player" },
  { key: "apps", label: "Apps", title: "Appearances" },
  { key: "starts", label: "Starts" },
  { key: "minutes", label: "Mins", title: "Minutes played" },
  { key: "goals", label: "Goals" },
  { key: "assists", label: "Assists" },
  { key: "yellow", label: "YC", title: "Yellow cards" },
  { key: "red", label: "RC", title: "Red cards" },
];

function SeasonStats({ matches, players }: { matches: Match[]; players: Player[] }) {
  const { data } = useApp();
  const seasons = [...new Set(matches.filter((m) => m.status === "played").map(seasonOf))].sort().reverse();
  const [season, setSeason] = useState(seasons[0] ?? String(new Date().getFullYear()));
  const [sort, setSort] = useState<{ k: SortKey; desc: boolean }>({ k: "goals", desc: true });
  const inSeason = matches.filter((m) => seasonOf(m) === season);
  const rec = teamRecord(inSeason);
  const totals = useMemo(() => playerTotals(inSeason, data.matchPlayers), [inSeason, data.matchPlayers]);
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const ids = [...new Set([...players.map((p) => p.id), ...totals.keys()])];
  const tableRows = ids
    .map((id) => ({ p: byId.get(id), t: totals.get(id) }))
    .filter((r): r is { p: Player; t: PlayerTotals | undefined } => !!r.p)
    .map((r) => ({ p: r.p, t: r.t ?? { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0 } }));
  tableRows.sort((a, b) => {
    const d = sort.k === "name" ? a.p.full_name.localeCompare(b.p.full_name) : a.t[sort.k] - b.t[sort.k];
    return (sort.desc ? -d : d) || a.p.full_name.localeCompare(b.p.full_name);
  });
  const top = [...tableRows].filter((r) => r.t.goals > 0).sort((a, b) => b.t.goals - a.t.goals).slice(0, 3);

  if (!rec.played)
    return <div className="empty">No results {seasons.length ? `in ${season}` : "yet"}. Season stats appear here once you add results.</div>;
  return (
    <div className="season">
      {seasons.length > 1 && (
        <label className="field" style={{ maxWidth: 160 }}>
          <span>Season</span>
          <select className="input" value={season} onChange={(e) => setSeason(e.target.value)}>
            {seasons.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      <section className="prog-tiles" aria-label="Team record">
        <div className="prog-tile">
          <span>Played</span>
          <b className="tnum">{rec.played}</b>
          <small>
            {rec.won} won · {rec.drawn} drawn · {rec.lost} lost
          </small>
        </div>
        <div className="prog-tile">
          <span>Goals</span>
          <b className="tnum">
            {rec.gf}–{rec.ga}
          </b>
          <small>
            Goal difference {rec.gf - rec.ga > 0 ? "+" : ""}
            {rec.gf - rec.ga}
          </small>
        </div>
        <div className="prog-tile">
          <span>Form (last {rec.form.length})</span>
          <span className="form-row">
            {rec.form.map((f) => (
              <span key={f.m.id} title={`${longDate(f.m.date)} vs ${f.m.opponent}: ${f.m.our_score}–${f.m.their_score}`}>
                <ResultBadge r={f.r} />
              </span>
            ))}
          </span>
          <small>Oldest to newest</small>
        </div>
        <div className="prog-tile">
          <span>Top scorers</span>
          {top.length ? (
            <small className="top-scorers">
              {top.map((r) => (
                <span key={r.p.id}>
                  {r.p.full_name} <b className="tnum">{r.t.goals}</b>
                </span>
              ))}
            </small>
          ) : (
            <small>No goals recorded yet</small>
          )}
        </div>
      </section>
      <div className="stats-wrap">
        <table className="stats-table season-table">
          <thead>
            <tr>
              {COLS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort.k === c.key ? (sort.desc ? "descending" : "ascending") : undefined}>
                  <button type="button" title={c.title} onClick={() => setSort((s) => ({ k: c.key, desc: s.k === c.key ? !s.desc : c.key !== "name" }))}>
                    {c.label}
                    {sort.k === c.key ? (sort.desc ? " ↓" : " ↑") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tableRows.map(({ p, t }) => (
              <tr key={p.id}>
                <th scope="row">{p.full_name}</th>
                <td>{t.apps}</td>
                <td>{t.starts}</td>
                <td>{t.minutes}</td>
                <td>{t.goals}</td>
                <td>{t.assists}</td>
                <td>{t.yellow}</td>
                <td>{t.red}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ================================================================ players and parents */

function FamilyMatches() {
  const { data, myPlayers, kidName, squadOf, open } = useApp();
  const [tab, setTab] = useState<"upcoming" | "results">("upcoming");
  const today = todayIso();
  const teamIds = new Set(myPlayers.flatMap((p) => p.team_ids));
  const all = data.matches.filter((m) => teamIds.has(m.team_id)).sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff));
  const upcoming = all.filter((m) => m.status !== "played" && m.date >= today);
  const results = all.filter((m) => m.status === "played").reverse();
  const parent = data.role === "parent";
  const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "";

  return (
    <div className="calm-home">
      <h1>Matches</h1>
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>
          Coming up
        </button>
        <button role="tab" aria-selected={tab === "results"} onClick={() => setTab("results")}>
          Results
        </button>
      </div>
      {(tab === "upcoming" ? upcoming : results).length === 0 && (
        <p className="calm-muted">{tab === "upcoming" ? "No matches coming up yet. Your coach will add the draw." : "No results yet."}</p>
      )}
      {(tab === "upcoming" ? upcoming : results).map((m) => {
        const kids = myPlayers.filter((p) => p.team_ids.includes(m.team_id));
        const rows = squadOf(m.id);
        const res = resultOf(m);
        return (
          <section key={m.id} className="calm-session">
            <div className="calm-session-head">
              <div className="calm-date">
                <small>{parseD(m.date).toLocaleDateString("en-AU", { weekday: "short" })}</small>
                <b>{parseD(m.date).getDate()}</b>
              </div>
              <div style={{ minWidth: 0 }}>
                <h2>
                  <button className="linklike" onClick={() => open({ kind: "match", id: m.id })}>
                    {teamName(m.team_id)} vs {m.opponent}
                  </button>
                </h2>
                <p className="calm-meta">
                  {longDate(m.date)}, {hhmm(m.kickoff)}
                  {m.meet_time && ` (arrive ${hhmm(m.meet_time)})`} · {HA_LABEL[m.home_away]}
                  {m.venue && ` at ${m.venue}`}
                </p>
                {m.status === "postponed" && <p className="bad-text">Postponed</p>}
                {m.status === "cancelled" && <p className="bad-text">Cancelled</p>}
              </div>
              {res && (
                <span className="match-score">
                  <ResultBadge r={res} />
                  <b className="tnum">
                    {m.our_score}–{m.their_score}
                  </b>
                </span>
              )}
            </div>
            {tab === "upcoming" &&
              m.status === "scheduled" &&
              kids.map((p) => <ReplyButtons key={p.id} matchId={m.id} playerId={p.id} label={parent ? `Can ${kidName(p)} play?` : "Can you play?"} who={parent ? kidName(p) : undefined} />)}
            {rows.length > 0 &&
              kids.map((p) => {
                const r = rows.find((x) => x.player_id === p.id);
                const who = parent ? kidName(p) : "You";
                const be = parent ? "is" : "are";
                let text = !r ? `${who} ${parent ? "wasn't" : "weren't"} in the squad.` : r.role === "start" ? `${who} ${be} starting.` : `${who} ${be} on the bench.`;
                if (res && r) text = `${who} played${r.minutes ? ` ${r.minutes} minutes` : ""}${r.goals ? `, scored ${r.goals}` : ""}${r.assists ? `, ${r.assists} assist${r.assists > 1 ? "s" : ""}` : ""}.`;
                if (!res && !r) text = `${who} ${parent ? "isn't" : "aren't"} in the squad this time.`;
                return (
                  <p key={p.id} className="squad-me">
                    {text}{" "}
                    <button className="linklike" onClick={() => open({ kind: "match", id: m.id })}>
                      {res ? "See the match" : "See the line-up"}
                    </button>
                  </p>
                );
              })}
            {m.report && res && <p className="calm-meta">{m.report}</p>}
          </section>
        );
      })}
    </div>
  );
}
