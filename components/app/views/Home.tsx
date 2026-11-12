"use client";

import Link from "next/link";
import { useApp } from "../AppProvider";
import { ReplyBadge, ReplyButtons } from "../Replies";
import { MyAvailability, NoTeams } from "./Overview";
import { Linkify } from "@/components/Linkify";
import { totalMins } from "@/components/ui";
import { overall } from "@/lib/idp";
import { fmtMins, isHighLoad } from "@/lib/load";
import { addMins, fmtDay, fmtLongDay, fmtLongMon, fmtMon, fmtNum, hhmm, iso, parseD, todayIso, whenLabel } from "@/lib/format";
import { timeAgo } from "./Announcements";
import { STATUS } from "@/lib/constants";
import { InstallHint } from "./Notifications";
import { isStaffRole } from "@/lib/permissions";

/** Coaches and admins get the pro home; players and parents the calm one. */
export function Home() {
  const { data } = useApp();
  return (
    <>
      <InstallHint />
      {isStaffRole(data.role) ? <CoachHome /> : <FamilyHome />}
    </>
  );
}

/* ---------------------------------------------------------------- Coaches */

function CoachHome() {
  const { data, team, squad, sessionsOf, drillMap, can, canDo, open, repliesFor, loadOf, evaluationsOf, isAdmin, setTeam } = useApp();
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const today = todayIso();
  const ss = sessionsOf();
  const next = ss.find((s) => s.date >= today);
  const upcoming = ss.filter((s) => s.date >= today).slice(next ? 1 : 0, 5);
  const sq = squad();
  const replies = next ? repliesFor(next.id) : new Map();
  const going = sq.filter((p) => replies.get(p.id)?.going === true).length;
  const notGoing = sq.filter((p) => replies.get(p.id)?.going === false).length;
  const seeLoad = can("attendance.view");
  const seeIdp = can("idp.view");
  const high = sq.filter((p) => isHighLoad(loadOf(p.id))).length;
  const out = sq.filter((p) => p.status !== "available").length;
  const posts = data.announcements.slice(0, 4);

  const status = (pid: string, st: string) => {
    if (st !== "available") return { cls: "bad", label: STATUS[st as keyof typeof STATUS] };
    const r = replies.get(pid);
    if (!next) return { cls: "ok", label: "Available" };
    if (!r) return { cls: "muted", label: "No reply" };
    return r.going ? { cls: "ok", label: "Going" } : { cls: "bad", label: "Not going" };
  };

  return (
    <div className="pro-home">
      <section className="pro-next">
        <div className="pro-row">
          <span className="pro-label">{next ? `Next session · ${whenLabel(next.date)}` : team.name}</span>
          {next && (
            <span className="mono pro-label">
              {fmtDay(next.date)} {fmtNum(next.date)} {fmtMon(next.date)} · {hhmm(next.start_time)}
            </span>
          )}
        </div>
        {next ? (
          <>
            <h1>{next.title || "Training session"}</h1>
            <p className="pro-meta">
              {[next.location, totalMins(next) ? `${hhmm(next.start_time)}–${addMins(next.start_time, totalMins(next))}` : `Starts ${hhmm(next.start_time)}`, totalMins(next) ? `${totalMins(next)} min` : "No drills planned yet", next.focus && `Focus: ${next.focus}`].filter(Boolean).join(" · ")}
            </p>
            {next.plan.length > 0 && (
              <div className="pro-plan" aria-hidden="true">
                {next.plan.map((x, i) => {
                  const d = drillMap.get(x.drill_id);
                  return d ? <i key={i} data-cat={d.category} style={{ flex: Math.max(1, x.mins) }} title={`${d.name} · ${x.mins} min`} /> : null;
                })}
              </div>
            )}
            <p className="mono pro-counts">
              <span className="ok">● {going} going</span>
              <span className="bad">● {notGoing} not</span>
              <span className="muted">○ {sq.length - going - notGoing} no reply</span>
              {out > 0 && <span className="muted">· {out} unavailable</span>}
            </p>
            <div className="pro-actions">
              <button className="btn primary" onClick={() => open({ kind: "session", id: next.id })}>
                Open plan
              </button>
              {canDo("sessions.edit", team.id) && (
                <button className="btn" onClick={() => open({ kind: "session", id: null })}>
                  Plan a session
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <h1>No session planned</h1>
            {canDo("sessions.edit", team.id) && (
              <div className="pro-actions">
                <button className="btn primary" onClick={() => open({ kind: "session", id: null })}>
                  Plan a session
                </button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="pro-sec">
        <div className="pro-sec-h">
          <h2>Squad</h2>
          <span className="pro-label">
            {sq.length} players{seeLoad && high ? ` · ${high} on high load` : ""}
          </span>
        </div>
        {sq.length ? (
          <div className="pro-table" role="table" aria-label="Squad">
            <div className="pro-tr pro-th" role="row">
              <span role="columnheader">Player</span>
              <span role="columnheader">{next ? "Next session" : "Status"}</span>
              {seeLoad && <span role="columnheader" className="r">Load 7d</span>}
              {seeIdp && <span role="columnheader" className="r">IDP</span>}
            </div>
            {sq.map((p) => {
              const st = status(p.id, p.status);
              const l = loadOf(p.id);
              const ov = overall(evaluationsOf(p.id)[0]?.ratings);
              return (
                <button key={p.id} className="pro-tr" role="row" onClick={() => open({ kind: "player", id: p.id })}>
                  <span role="cell" className="pro-name">
                    <span className="mono pro-num">{p.shirt_number ?? ""}</span>
                    {p.full_name}
                  </span>
                  <span role="cell" className={`pro-st ${st.cls}`}>
                    {st.cls === "muted" ? "○" : "●"} {st.label}
                  </span>
                  {seeLoad && (
                    <span role="cell" className={`mono r ${isHighLoad(l) ? "warn" : ""}`} title={isHighLoad(l) ? "Well above their usual week" : undefined}>
                      {l && l.mins_7d ? fmtMins(l.mins_7d) : "–"}
                      {isHighLoad(l) ? " ↑" : ""}
                    </span>
                  )}
                  {seeIdp && (
                    <span role="cell" className="mono r">
                      {ov ?? "–"}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="pro-empty">No players yet.</p>
        )}
      </section>

      <div className="pro-cols">
        <section className="pro-sec">
          <div className="pro-sec-h">
            <h2>Coming up</h2>
            <Link href="/sessions" className="pro-link">
              All sessions
            </Link>
          </div>
          {upcoming.length ? (
            upcoming.map((s) => (
              <button key={s.id} className="pro-li" onClick={() => open({ kind: "session", id: s.id })}>
                <span className="mono pro-when">
                  {fmtDay(s.date)} {fmtNum(s.date)}
                </span>
                <span className="pro-li-main">{s.title || "Training session"}</span>
                <span className="mono pro-label">{totalMins(s) ? `${totalMins(s)}m` : hhmm(s.start_time)}</span>
              </button>
            ))
          ) : (
            <p className="pro-empty">Nothing else planned.</p>
          )}
        </section>
        <section className="pro-sec">
          <div className="pro-sec-h">
            <h2>Announcements</h2>
            <Link href="/announcements" className="pro-link">
              All
            </Link>
          </div>
          {posts.length ? (
            posts.map((a) => (
              <div key={a.id} className="pro-li static">
                <span className="mono pro-when">{timeAgo(a.created_at).replace(" ago", "")}</span>
                <span className="pro-li-main">
                  {a.title}
                  {a.team_id ? <span className="pro-label"> · {data.teams.find((t) => t.id === a.team_id)?.name}</span> : null}
                </span>
              </div>
            ))
          ) : (
            <p className="pro-empty">No announcements.</p>
          )}
        </section>
      </div>

      {(isAdmin || data.teams.length > 1) && (
        <section className="pro-sec">
          <div className="pro-sec-h">
            <h2>Teams</h2>
          </div>
          {data.teams.map((t) => {
            const n = sessionsOf(t.id).find((s) => s.date >= today);
            return (
              <button key={t.id} className="pro-li" aria-current={t.id === team.id} onClick={() => setTeam(t.id)}>
                <span className="pro-li-main">{t.name}</span>
                <span className="pro-label">{squad(t.id).length} players</span>
                <span className="mono pro-label">{n ? `${fmtDay(n.date)} ${fmtNum(n.date)} · ${hhmm(n.start_time)}` : "–"}</span>
              </button>
            );
          })}
        </section>
      )}
    </div>
  );
}

/* ---------------------------------------------------------- Players & parents */

function FamilyHome() {
  const { data, myPlayers, kidName, goalsOf, repliesFor } = useApp();
  const parent = data.role === "parent";
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (data.myName || "").split(" ")[0];
  const today = todayIso();
  const weekEnd = iso(new Date(Date.now() + 6 * 864e5));
  const teamIds = [...new Set(myPlayers.flatMap((p) => p.team_ids))];
  const upcoming = data.sessions.filter((s) => teamIds.includes(s.team_id) && s.date >= today).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const week = upcoming.filter((s) => s.date <= weekEnd);
  const tName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "";
  const nextMatch = data.matches
    .filter((m) => teamIds.includes(m.team_id) && m.date >= today && m.status !== "played")
    .sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff))[0];

  // Things that need doing or knowing, as plain sentences.
  const attention: string[] = [];
  for (const p of myPlayers) {
    const who = parent ? kidName(p) : "You";
    const unreplied = upcoming.filter((s) => p.team_ids.includes(s.team_id) && s.date <= weekEnd && !repliesFor(s.id).get(p.id));
    if (unreplied.length) attention.push(`${who} ${parent ? "hasn't" : "haven't"} replied to ${unreplied.length} session${unreplied.length === 1 ? "" : "s"} this week.`);
    if (p.status !== "available") attention.push(`${who} ${parent ? "is" : "are"} marked ${STATUS[p.status].toLowerCase()}${p.status_note ? ` (${p.status_note})` : ""}.`);
    const overdue = goalsOf(p.id).filter((g) => g.status === "active" && g.target_date && g.target_date < today);
    if (overdue.length) attention.push(`${overdue.length} of ${parent ? `${kidName(p)}'s` : "your"} goals ${overdue.length === 1 ? "is" : "are"} past ${overdue.length === 1 ? "its" : "their"} target date.`);
  }

  if (!myPlayers.length)
    return (
      <div className="calm-home">
        <h1>
          {greeting}
          {first ? `, ${first}` : ""}
        </h1>
        <p>
          Your account isn&apos;t linked to {parent ? "your child" : "your player profile"} yet, so there&apos;s nothing to show here. Ask your club admin to link you on the Club &amp; members page.
        </p>
      </div>
    );

  return (
    <div className="calm-home">
      <h1>
        {greeting}
        {first ? `, ${first}` : ""}
      </h1>

      {myPlayers.map((p) => {
        const nxt = upcoming.find((s) => p.team_ids.includes(s.team_id));
        if (!nxt) return null;
        return (
          <section key={p.id} className="calm-callout">
            <span className="calm-meta">
              {parent || myPlayers.length > 1 ? `${kidName(p)} · ` : ""}Next session · {fmtLongDay(nxt.date)} {fmtNum(nxt.date)} {fmtLongMon(nxt.date)}
            </span>
            <h2>{nxt.title || "Training session"}</h2>
            <p>
              {hhmm(nxt.start_time)}
              {totalMins(nxt) ? ` to ${addMins(nxt.start_time, totalMins(nxt))}` : ""}
              {nxt.location ? ` at ${nxt.location}` : ""}
              {teamIds.length > 1 ? ` · ${tName(nxt.team_id)}` : ""}
            </p>
            <ReplyButtons sessionId={nxt.id} playerId={p.id} label={parent ? `Is ${kidName(p)} coming?` : "Are you coming?"} who={parent ? kidName(p) : undefined} />
          </section>
        );
      })}

      {nextMatch && (
        <section className="calm-callout">
          <span className="calm-meta">
            Next match · {fmtLongDay(nextMatch.date)} {parseD(nextMatch.date).getDate()} {fmtLongMon(nextMatch.date)}
          </span>
          <h2>
            {tName(nextMatch.team_id)} vs {nextMatch.opponent}
          </h2>
          <p>
            {nextMatch.status === "scheduled" ? `Kick-off ${hhmm(nextMatch.kickoff)}` : nextMatch.status === "postponed" ? "Postponed" : "Cancelled"}
            {nextMatch.meet_time && nextMatch.status === "scheduled" ? `, arrive by ${hhmm(nextMatch.meet_time)}` : ""}
            {nextMatch.venue && ` at ${nextMatch.venue}`}
          </p>
          {nextMatch.status === "scheduled" &&
            myPlayers
              .filter((p) => p.team_ids.includes(nextMatch.team_id))
              .map((p) => <ReplyButtons key={p.id} matchId={nextMatch.id} playerId={p.id} label={parent ? `Can ${kidName(p)} play?` : "Can you play?"} who={parent ? kidName(p) : undefined} />)}
          <Link href="/matches">All matches →</Link>
        </section>
      )}

      {week.length > 0 && (
        <section className="calm-sec">
          <h2>This week</h2>
          <ul className="calm-list">
            {week.map((s) => (
              <li key={s.id}>
                <span>
                  {fmtDay(s.date)} · {s.title || "Training session"}
                  {totalMins(s) ? ` · ${totalMins(s)} min` : ` · ${hhmm(s.start_time)}`}
                  {teamIds.length > 1 ? <span className="calm-muted"> · {tName(s.team_id)}</span> : null}
                </span>
                <span className="calm-badges">
                  {myPlayers
                    .filter((p) => p.team_ids.includes(s.team_id))
                    .map((p) => (
                      <ReplyBadge key={p.id} sessionId={s.id} playerId={p.id} name={myPlayers.length > 1 ? kidName(p) : undefined} />
                    ))}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {attention.length > 0 && (
        <section className="calm-sec">
          <h2>Needs attention</h2>
          {attention.map((t, i) => (
            <p key={i}>{t}</p>
          ))}
        </section>
      )}

      {myPlayers.map((p) => {
        const goals = goalsOf(p.id).filter((g) => g.status === "active");
        if (!goals.length) return null;
        return (
          <section key={"g" + p.id} className="calm-sec">
            <h2>{parent ? `${kidName(p)}'s goals` : "Your goals"}</h2>
            <ul className="calm-list">
              {goals.map((g) => (
                <li key={g.id}>
                  <Link href={`/development/${p.id}`}>{g.title}</Link>
                  <span className="calm-muted">{g.progress}%</span>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {data.announcements.length > 0 && (
        <section className="calm-sec">
          <h2>Announcements</h2>
          {data.announcements.slice(0, 3).map((a) => (
            <p key={a.id}>
              <b>{a.title}</b>
              {a.body ? (
                <>
                  {" "}
                  <Linkify text={a.body} />
                </>
              ) : null}{" "}
              <span className="calm-muted">{timeAgo(a.created_at)}</span>
            </p>
          ))}
          <Link href="/announcements">All announcements</Link>
        </section>
      )}

      {myPlayers.map((p) => (
        <MyAvailability key={"a" + p.id} playerId={p.id} status={p.status} note={p.status_note} name={kidName(p)} parent={parent} />
      ))}
    </div>
  );
}
