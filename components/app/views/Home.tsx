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
import { SelfReviewPrompts } from "../idp/SelfReview";
import { isStaffRole } from "@/lib/permissions";
import { initials } from "@/lib/format";
import type { Match, Session } from "@/lib/types";

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

/* ---------------------------------------------------------------- Shared bits */

type Ev = { kind: "session" | "match"; id: string; date: string; time: string; team_id: string; title: string; place: string; s?: Session; m?: Match };
const sessEv = (s: Session): Ev => ({ kind: "session", id: s.id, date: s.date, time: s.start_time, team_id: s.team_id, title: s.title || "Training", place: s.location, s });
const matchEv = (m: Match): Ev => ({ kind: "match", id: m.id, date: m.date, time: m.kickoff, team_id: m.team_id, title: `vs ${m.opponent}`, place: m.venue, m });
const byWhen = (a: Ev, b: Ev) => (a.date + a.time).localeCompare(b.date + b.time);

/** "6:00 pm" */
export function time12(t: string) {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}
/** "Tonight", "Tomorrow", "Sat 28 Nov" */
function dayWord(date: string, time: string) {
  const w = whenLabel(date);
  if (w === "Today") return Number(time.slice(0, 2)) >= 17 ? "Tonight" : "Today";
  if (w === "Tomorrow") return w;
  return `${fmtDay(date)} ${fmtNum(date)} ${fmtMon(date)}`;
}
const greet = () => {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
};
const mapsUrl = (q: string) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;

function Faces({ names, extra }: { names: string[]; extra: number }) {
  if (!names.length) return null;
  return (
    <span className="faces" aria-hidden="true">
      {names.map((n, i) => (
        <i key={i}>{initials(n)}</i>
      ))}
      {extra > 0 && <i className="more">+{extra}</i>}
    </span>
  );
}

function DateTile({ date }: { date: string }) {
  return (
    <span className="dtile">
      <small>{fmtDay(date)}</small>
      <b>{fmtNum(date)}</b>
    </span>
  );
}

/* ---------------------------------------------------------------- Coaches */

function CoachHome() {
  const { data, team, squad, sessionsOf, matchesOf, canDo, open, repliesFor, matchRepliesFor, squadOf, isAdmin, setTeam } = useApp();
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const today = todayIso();
  const weekEnd = iso(new Date(Date.now() + 6 * 864e5));
  const evs = [
    ...sessionsOf().filter((s) => s.date >= today).map(sessEv),
    ...matchesOf().filter((m) => m.date >= today && m.status === "scheduled").map(matchEv),
  ].sort(byWhen);
  const next = evs[0];
  const week = evs.slice(1).filter((e) => e.date <= weekEnd);
  const sq = squad();
  const canEdit = canDo("sessions.edit", team.id);
  const canMatch = canDo("matches.edit", team.id);
  const first = (data.myName || "").split(" ")[0];

  const repliesOf = (e: Ev) => (e.kind === "session" ? repliesFor(e.id) : matchRepliesFor(e.id)) as Map<string, { going: boolean }>;
  const tally = (e: Ev) => {
    const r = repliesOf(e);
    const yes = sq.filter((p) => r.get(p.id)?.going === true);
    const no = sq.filter((p) => r.get(p.id)?.going === false).length;
    return { yes, no, wait: sq.length - yes.length - no };
  };

  const out = sq.filter((p) => p.status !== "available");
  const needs: { key: string; text: string; sub?: string; act: () => void }[] = [];
  if (next) {
    const t = tally(next);
    if (t.wait > 0) needs.push({ key: "reply", text: `${t.wait} haven't replied`, sub: `${next.kind === "match" ? next.title : next.title} · ${dayWord(next.date, next.time)}`, act: () => open({ kind: next.kind, id: next.id }) });
  }
  for (const e of evs.filter((x) => x.date <= weekEnd)) {
    if (e.kind === "session" && canEdit && e.s && e.s.plan.length === 0)
      needs.push({ key: "plan" + e.id, text: `Plan ${fmtDay(e.date)}'s session`, sub: "No drills yet", act: () => open({ kind: "session", id: e.id }) });
    if (e.kind === "match" && canMatch && squadOf(e.id).length === 0)
      needs.push({ key: "squad" + e.id, text: `Pick the squad ${e.title}`, sub: `${fmtDay(e.date)} ${fmtNum(e.date)} · ${time12(e.time)}`, act: () => open({ kind: "match", id: e.id }) });
  }
  if (out.length) needs.push({ key: "out", text: `${out.length} player${out.length === 1 ? "" : "s"} out`, sub: out.slice(0, 3).map((p) => `${p.full_name.split(" ")[0]} (${STATUS[p.status].toLowerCase()})`).join(", "), act: () => (location.href = "/squad") });

  const t = next ? tally(next) : null;

  return (
    <div className="md-home">
      <header className="md-hello">
        <span className="eyebrow">{fmtDay(today)} {fmtNum(today)} {fmtLongMon(today)}</span>
        <h1>
          {greet()}
          {first ? `, ${first}` : ""}
        </h1>
      </header>

      {next && t ? (
        <section className="ticket">
          <div className="ticket-top">
            <span className="ticket-kicker">
              {dayWord(next.date, next.time)} · {next.kind === "match" ? "Matchday" : "Training"}
            </span>
            <span className="ticket-team">{team.name}</span>
          </div>
          <div className="ticket-big">
            <b>{time12(next.time)}</b>
            <span>{next.kind === "match" ? next.title : next.place || next.title}</span>
          </div>
          <p className="ticket-sub">
            {next.kind === "match"
              ? [next.m?.home_away === "home" ? "Home" : next.m?.home_away === "away" ? "Away" : "", next.place, next.m?.meet_time ? `Arrive ${time12(next.m.meet_time)}` : ""].filter(Boolean).join(" · ")
              : [next.s?.title && next.place ? next.s.title : "", next.s && totalMins(next.s) ? `${next.s.plan.length} drills · ${totalMins(next.s)} min` : "No drills planned yet", next.s?.focus ? `Focus: ${next.s.focus}` : ""].filter(Boolean).join(" · ")}
          </p>
          <div className="ticket-replies">
            <Faces names={t.yes.slice(0, 5).map((p) => p.full_name)} extra={t.yes.length - 5} />
            <span>
              <b>{t.yes.length} coming</b> · {t.no} can&apos;t · {t.wait} no reply
            </span>
          </div>
          <div className="ticket-actions">
            {next.kind === "session" ? (
              <>
                <button className="btn primary" onClick={() => open({ kind: "session", id: next.id })}>
                  {next.date === today ? "Take attendance" : "Open session"}
                </button>
                {canEdit && (
                  <button className="btn ghost-light" onClick={() => open({ kind: "session", id: null })}>
                    Plan another
                  </button>
                )}
              </>
            ) : (
              <>
                <button className="btn primary" onClick={() => open({ kind: "match", id: next.id })}>
                  {squadOf(next.id).length ? "Line-up" : "Pick squad"}
                </button>
                {next.place && (
                  <a className="btn ghost-light" href={mapsUrl(next.place)} target="_blank" rel="noreferrer">
                    Directions
                  </a>
                )}
              </>
            )}
          </div>
        </section>
      ) : (
        <section className="ticket empty">
          <span className="ticket-kicker">{team.name}</span>
          <div className="ticket-big">
            <b>Nothing planned</b>
          </div>
          <p className="ticket-sub">Add a session or import your draw to fill the week.</p>
          <div className="ticket-actions">
            {canEdit && (
              <button className="btn primary" onClick={() => open({ kind: "session", id: null })}>
                Plan a session
              </button>
            )}
            {canMatch && (
              <button className="btn ghost-light" onClick={() => open({ kind: "import-draw" })}>
                Import draw
              </button>
            )}
          </div>
        </section>
      )}

      <div className="md-cols">
        <section className="md-sec">
          <div className="md-sec-h">
            <h2>This week</h2>
            <Link href="/sessions">Schedule</Link>
          </div>
          {week.length ? (
            <div className="md-list">
              {week.map((e) => {
                const x = tally(e);
                const noSquad = e.kind === "match" && squadOf(e.id).length === 0;
                return (
                  <button key={e.kind + e.id} className="md-row" onClick={() => open({ kind: e.kind, id: e.id })}>
                    <DateTile date={e.date} />
                    <span className="md-row-main">
                      <b>
                        {e.kind === "match" && <span className="tag-match">Match</span>}
                        {e.title}
                      </b>
                      <small>{[time12(e.time), e.place].filter(Boolean).join(" · ")}</small>
                    </span>
                    {noSquad && canMatch ? (
                      <span className="pill accent">Pick squad</span>
                    ) : (
                      <span className="pill">
                        {x.yes.length}/{sq.length}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="md-empty">Nothing else this week.</p>
          )}
        </section>

        <section className="md-sec">
          <div className="md-sec-h">
            <h2>Needs you</h2>
          </div>
          {needs.length ? (
            <div className="md-list">
              {needs.slice(0, 5).map((n) => (
                <button key={n.key} className="md-row need" onClick={n.act}>
                  <span className="need-dot" aria-hidden="true" />
                  <span className="md-row-main">
                    <b>{n.text}</b>
                    {n.sub && <small>{n.sub}</small>}
                  </span>
                  <span className="chev" aria-hidden="true">
                    ›
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="md-empty">You&apos;re all set. Nice work.</p>
          )}
        </section>
      </div>

      <section className="md-sec">
        <div className="md-sec-h">
          <h2>Squad</h2>
          <Link href="/squad">{sq.length} players</Link>
        </div>
        <div className="md-stats">
          <Link href="/squad" className="md-stat ok">
            <b>{sq.filter((p) => p.status === "available").length}</b>
            <small>Available</small>
          </Link>
          <Link href="/squad" className="md-stat bad">
            <b>{sq.filter((p) => p.status === "injured").length}</b>
            <small>Injured</small>
          </Link>
          <Link href="/squad" className="md-stat">
            <b>{sq.filter((p) => p.status === "unavailable").length}</b>
            <small>Unavailable</small>
          </Link>
        </div>
      </section>

      {(isAdmin || data.teams.length > 1) && data.teams.length > 1 && (
        <section className="md-sec">
          <div className="md-sec-h">
            <h2>Teams</h2>
          </div>
          <div className="md-teams">
            {data.teams.map((tm) => (
              <button key={tm.id} className="chip" aria-pressed={tm.id === team.id} onClick={() => setTeam(tm.id)}>
                {tm.name}
              </button>
            ))}
          </div>
        </section>
      )}

      <ClubNews />
    </div>
  );
}

function ClubNews() {
  const { data } = useApp();
  const posts = data.announcements.slice(0, 2);
  if (!posts.length) return null;
  return (
    <section className="md-sec">
      <div className="md-sec-h">
        <h2>From the club</h2>
        <Link href="/announcements">All</Link>
      </div>
      <div className="md-news">
        {posts.map((a) => (
          <Link key={a.id} href="/announcements" className="md-post">
            <small>
              {timeAgo(a.created_at)}
              {a.team_id ? ` · ${data.teams.find((x) => x.id === a.team_id)?.name ?? ""}` : ""}
            </small>
            <b>{a.title}</b>
            {a.body && <p>{a.body}</p>}
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- Players & parents */

function FamilyHome() {
  const { data, myPlayers, kidName, goalsOf, repliesFor, squadOf } = useApp();
  const parent = data.role === "parent";
  const greeting = greet();
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

  const evsFor = (teamIdsOf: string[]) =>
    [
      ...upcoming.filter((s) => teamIdsOf.includes(s.team_id)).map(sessEv),
      ...data.matches.filter((m) => teamIdsOf.includes(m.team_id) && m.date >= today && m.status === "scheduled").map(matchEv),
    ].sort(byWhen);
  const shownMatch = new Set<string>();

  return (
    <div className="md-home">
      <header className="md-hello">
        <span className="eyebrow">{fmtDay(today)} {fmtNum(today)} {fmtLongMon(today)}</span>
        <h1>
          {greeting}
          {first ? `, ${first}` : ""}
        </h1>
      </header>

      {myPlayers.map((p) => {
        const e = evsFor(p.team_ids)[0];
        if (!e) return null;
        if (e.m) shownMatch.add(e.id);
        const mp = e.m && e.m.squad_published ? squadOf(e.id).find((x) => x.player_id === p.id) : undefined;
        return (
          <section key={p.id} className="ticket">
            <div className="ticket-top">
              <span className="ticket-kicker">
                {dayWord(e.date, e.time)} · {e.kind === "match" ? "Matchday" : "Training"}
              </span>
              <span className="ticket-team">{parent || myPlayers.length > 1 ? kidName(p) : tName(e.team_id)}</span>
            </div>
            <div className="ticket-big">
              <b>{time12(e.time)}</b>
              <span>{e.kind === "match" ? e.title : e.place || e.title}</span>
            </div>
            <p className="ticket-sub">
              {e.kind === "match"
                ? [e.place, e.m?.meet_time ? `Arrive by ${time12(e.m.meet_time)}` : "", mp ? `${parent ? kidName(p) + " is" : "You're"} ${mp.role === "start" ? "starting" : "on the bench"}` : ""].filter(Boolean).join(" · ")
                : [e.place ? e.title : "", e.s && totalMins(e.s) ? `Finishes ${addMins(e.time, totalMins(e.s))}` : ""].filter(Boolean).join(" · ")}
            </p>
            {e.kind === "session" ? (
              <ReplyButtons sessionId={e.id} playerId={p.id} label={parent ? `Is ${kidName(p)} coming?` : "Are you coming?"} who={parent ? kidName(p) : undefined} />
            ) : (
              <ReplyButtons matchId={e.id} playerId={p.id} label={parent ? `Can ${kidName(p)} play?` : "Can you play?"} who={parent ? kidName(p) : undefined} />
            )}
            {e.kind === "match" && (
              <div className="ticket-actions">
                {e.place && (
                  <a className="btn ghost-light" href={mapsUrl(e.place)} target="_blank" rel="noreferrer">
                    Directions
                  </a>
                )}
                <Link className="btn ghost-light" href={`/matches?m=${e.id}`}>
                  {e.m?.squad_published ? "Line-up" : "Match details"}
                </Link>
              </div>
            )}
          </section>
        );
      })}

      {nextMatch && !shownMatch.has(nextMatch.id) && (
        <section className="md-match">
          <div className="md-match-h">
            <span className="eyebrow">
              {dayWord(nextMatch.date, nextMatch.kickoff)} · Matchday
            </span>
            <span className="pill">{time12(nextMatch.kickoff)}</span>
          </div>
          <h2>
            {tName(nextMatch.team_id)} <span>vs</span> {nextMatch.opponent}
          </h2>
          <p className="md-muted">
            {[nextMatch.venue, nextMatch.meet_time ? `Arrive by ${time12(nextMatch.meet_time)}` : ""].filter(Boolean).join(" · ")}
          </p>
          {myPlayers
            .filter((p) => p.team_ids.includes(nextMatch.team_id))
            .map((p) => (
              <ReplyButtons key={p.id} matchId={nextMatch.id} playerId={p.id} label={parent ? `Can ${kidName(p)} play?` : "Can you play?"} who={parent ? kidName(p) : undefined} />
            ))}
          <div className="md-match-actions">
            {nextMatch.venue && (
              <a className="btn" href={mapsUrl(nextMatch.venue)} target="_blank" rel="noreferrer">
                Directions
              </a>
            )}
            <Link className="btn" href={`/matches?m=${nextMatch.id}`}>
              {nextMatch.squad_published ? "Line-up" : "Match details"}
            </Link>
          </div>
        </section>
      )}

      <SelfReviewPrompts />

      {week.length > 0 && (
        <section className="md-sec">
          <div className="md-sec-h">
            <h2>This week</h2>
            <Link href="/sessions">Schedule</Link>
          </div>
          <div className="md-list">
            {week.map((s) => (
              <div key={s.id} className="md-row static">
                <DateTile date={s.date} />
                <span className="md-row-main">
                  <b>{s.title || "Training"}</b>
                  <small>{[time12(s.start_time), s.location, teamIds.length > 1 ? tName(s.team_id) : ""].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="calm-badges">
                  {myPlayers
                    .filter((p) => p.team_ids.includes(s.team_id))
                    .map((p) => (
                      <ReplyBadge key={p.id} sessionId={s.id} playerId={p.id} name={myPlayers.length > 1 ? kidName(p) : undefined} />
                    ))}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {attention.length > 0 && (
        <section className="md-sec">
          <div className="md-sec-h">
            <h2>Heads up</h2>
          </div>
          <div className="md-list">
            {attention.map((t, i) => (
              <div key={i} className="md-row static need">
                <span className="need-dot" aria-hidden="true" />
                <span className="md-row-main">
                  <b>{t}</b>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {myPlayers.map((p) => {
        const goals = goalsOf(p.id).filter((g) => g.status === "active");
        if (!goals.length) return null;
        return (
          <section key={"g" + p.id} className="md-sec">
            <div className="md-sec-h">
              <h2>{parent ? `${kidName(p)}'s goals` : "Your goals"}</h2>
              <Link href={`/development/${p.id}`}>My plan</Link>
            </div>
            <div className="md-list">
              {goals.map((g) => (
                <Link key={g.id} href={`/development/${p.id}`} className="md-row goal">
                  <span className="md-row-main">
                    <b>{g.title}</b>
                    <span className="goalbar" aria-hidden="true">
                      <i style={{ width: `${Math.max(4, g.progress)}%` }} />
                    </span>
                  </span>
                  <span className="pill">{g.progress}%</span>
                </Link>
              ))}
            </div>
          </section>
        );
      })}

      <ClubNews />

      {myPlayers.map((p) => (
        <MyAvailability key={"a" + p.id} playerId={p.id} status={p.status} note={p.status_note} name={kidName(p)} parent={parent} />
      ))}
    </div>
  );
}
