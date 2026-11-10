"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Crest, Icon, PitchLines, Shirt, Timeline, totalMins } from "@/components/ui";
import { STATUS } from "@/lib/constants";
import { ReplyButtons } from "../Replies";
import { LoadWatch, MyLoadLine } from "../Load";
import { AnnouncementItem } from "./Announcements";
import { addMins, errMsg, fmtDay, fmtLongDay, fmtLongMon, fmtMon, fmtNum, hhmm, iso, todayIso, whenLabel } from "@/lib/format";
import type { Status } from "@/lib/types";

export function Overview() {
  const { data, team, squad, sessionsOf, attendedSet, drillMap, can, canDo, playerRate, isAdmin, open, setTeam, myPlayers, kidName } = useApp();
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const canEdit = canDo("sessions.edit", team.id);

  const today = todayIso();
  const sq = squad();
  const ss = sessionsOf();
  const next = ss.find((s) => s.date >= today);
  const pastAll = ss.filter((s) => s.date < today);
  const past = pastAll.slice(-8);
  const c = { available: 0, injured: 0, unavailable: 0 };
  sq.forEach((p) => c[p.status]++);
  const wkEnd = iso(new Date(Date.now() + 7 * 864e5));
  const thisWeek = ss.filter((s) => s.date >= today && s.date <= wkEnd);
  const upcoming = ss.filter((s) => s.date >= today).slice(0, 5);
  const out = sq.filter((p) => p.status !== "available");
  const pcts = past.map((s) => (sq.length ? Math.round((100 * attendedSet(s.id).size) / sq.length) : 0));
  const avgAtt = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : 0;
  const C = 2 * Math.PI * 26;
  const frac = sq.length ? c.available / sq.length : 0;
  const parent = data.role === "parent";

  return (
    <>
      {next ? (
        <section className="hero">
          <PitchLines />
          <div style={{ minWidth: 0 }}>
            <span className="kick">Next session · {whenLabel(next.date)}</span>
            <h2>{next.title || "Training session"}</h2>
            <div className="hmeta">
              <span>
                <Icon id="i-clock" />
                {hhmm(next.start_time)}–{addMins(next.start_time, totalMins(next))}
              </span>
              {next.location && (
                <span>
                  <Icon id="i-pin" />
                  {next.location}
                </span>
              )}
              {next.focus && (
                <span>
                  <Icon id="i-target" />
                  {next.focus}
                </span>
              )}
              <span>
                <Icon id="i-people" />
                {c.available} of {sq.length} available
              </span>
            </div>
            <Timeline s={next} drills={drillMap} lg />
            <div className="hdrills">
              {next.plan.map((x, i) => {
                const d = drillMap.get(x.drill_id);
                return d ? (
                  <span key={i} className="cat" data-cat={d.category}>
                    <b>{d.name}</b>&nbsp;{x.mins}′
                  </span>
                ) : null;
              })}
            </div>
            <div className="hacts">
              <button className="btn gold" onClick={() => open({ kind: "session", id: next.id })}>
                {canEdit ? "Open session plan" : "View session plan"}
              </button>
              {canEdit && (
                <button className="btn ghost-dark" onClick={() => open({ kind: "session", id: null })}>
                  <Icon id="i-plus" />
                  Plan another
                </button>
              )}
            </div>
          </div>
          <div className="score">
            <small>{fmtLongDay(next.date)}</small>
            <div className="big">{fmtNum(next.date)}</div>
            <small>{fmtLongMon(next.date)}</small>
            <div className="t">{hhmm(next.start_time)}</div>
          </div>
        </section>
      ) : (
        <section className="hero">
          <PitchLines />
          <div>
            <span className="kick">{team.name}</span>
            <h2>No session planned yet</h2>
            <p style={{ color: "var(--on-navy-muted)", margin: 0 }}>
              {canEdit ? "Plan the next training session for your squad." : "Your coach hasn't planned the next session yet."}
            </p>
            {canEdit && (
              <div className="hacts">
                <button className="btn gold" onClick={() => open({ kind: "session", id: null })}>
                  <Icon id="i-plus" />
                  Plan a session
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {!myPlayers.length && (data.role === "player" || data.role === "parent") && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h2>{data.role === "parent" ? "Link your child" : "Link your player profile"}</h2>
          </div>
          <div className="card-b">
            <p className="muted" style={{ margin: 0 }}>
              {data.role === "parent"
                ? "Your account isn't linked to your child yet, so you can't reply to sessions or update their availability. Ask your club admin to link you on the Club & members page."
                : "Your account isn't linked to your player profile yet, so you can't reply to sessions or update your availability. Ask your club admin to link you on the Club & members page."}
            </p>
          </div>
        </section>
      )}

      {myPlayers.map((p) => (
        <TrainingReplies key={p.id} playerId={p.id} teamIds={p.team_ids} parent={parent} name={kidName(p)} />
      ))}

      {data.announcements.length > 0 && (
        <section className="card" style={{ marginTop: 16 }}>
          <div className="card-h">
            <h2>Announcements</h2>
            <Link className="btn sm" href="/announcements">
              All announcements
            </Link>
          </div>
          <div className="card-b">
            {data.announcements.slice(0, 3).map((a) => (
              <AnnouncementItem key={a.id} a={a} compact />
            ))}
          </div>
        </section>
      )}

      {myPlayers.map((p) => (
        <MyAvailability key={p.id} playerId={p.id} status={p.status} note={p.status_note} name={kidName(p)} parent={parent} />
      ))}

      <div className="stats">
        <div className="card stat">
          <span className="eyebrow">Availability</span>
          <div className="stat-row">
            <div className="v tnum">
              {c.available}
              <small>/{sq.length}</small>
            </div>
            <svg className="ring" viewBox="0 0 62 62" aria-hidden="true">
              <circle cx="31" cy="31" r="26" style={{ stroke: "var(--surface-2)" }} />
              <circle cx="31" cy="31" r="26" style={{ stroke: "var(--good)" }} strokeLinecap="round" strokeDasharray={`${C * frac} ${C}`} transform="rotate(-90 31 31)" />
            </svg>
          </div>
          <span className="sub">
            {c.injured} injured · {c.unavailable} away
          </span>
        </div>
        {can("attendance.view") ? (
        <div className="card stat">
          <span className="eyebrow">Attendance</span>
          <div className="stat-row">
            <div className="v tnum">
              {avgAtt}
              <small>%</small>
            </div>
            <div className="mbars" aria-hidden="true">
              {pcts.map((p, i) => (
                <i key={i} style={{ height: `${Math.max(6, p)}%` }} />
              ))}
            </div>
          </div>
          <span className="sub">{past.length ? `Average, last ${past.length} sessions` : "No completed sessions yet"}</span>
        </div>
        ) : myPlayers.length === 1 && playerRate(myPlayers[0]) !== null ? (
          <div className="card stat">
            <span className="eyebrow">{parent ? `${kidName(myPlayers[0])}'s attendance` : "Your attendance"}</span>
            <div className="v tnum">
              {playerRate(myPlayers[0])}
              <small>%</small>
            </div>
            <div className="bar" style={{ flex: "none" }} aria-hidden="true">
              <i style={{ width: `${playerRate(myPlayers[0])}%` }} />
            </div>
            <span className="sub">of completed sessions</span>
          </div>
        ) : myPlayers.length > 1 ? (
          <div className="card stat">
            <span className="eyebrow">Attendance</span>
            <div style={{ display: "grid", gap: 8, marginTop: 4 }}>
              {myPlayers.map((p) => {
                const r = playerRate(p);
                return (
                  <div key={p.id} className="att" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
                    <span style={{ minWidth: 56 }}>{kidName(p)}</span>
                    <span className="bar">
                      <i style={{ width: `${r ?? 0}%` }} />
                    </span>
                    <b className="tnum">{r === null ? "–" : `${r}%`}</b>
                  </div>
                );
              })}
            </div>
            <span className="sub">of completed sessions</span>
          </div>
        ) : null}
        <div className="card stat">
          <span className="eyebrow">Training load</span>
          <div className="v tnum">
            {thisWeek.reduce((n, s) => n + totalMins(s), 0)}
            <small> min</small>
          </div>
          <span className="sub">
            {thisWeek.length} session{thisWeek.length === 1 ? "" : "s"} in the next 7 days
          </span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Block progress</span>
          <div className="v tnum">
            {pastAll.length}
            <small>/{ss.length}</small>
          </div>
          <div className="bar" style={{ flex: "none" }} aria-hidden="true">
            <i style={{ width: `${ss.length ? (100 * pastAll.length) / ss.length : 0}%` }} />
          </div>
          <span className="sub">Sessions completed</span>
        </div>
      </div>

      <div className="ovgrid">
        <section className="card">
          <div className="card-h">
            <h2>Coming up</h2>
            <Link className="btn sm" href="/sessions">
              All sessions
            </Link>
          </div>
          <div className="card-b rows">
            {upcoming.length ? (
              upcoming.map((s) => (
                <button key={s.id} className="rowi" onClick={() => open({ kind: "session", id: s.id })}>
                  <span className="dchip">
                    <small>{fmtDay(s.date)}</small>
                    <b>{fmtNum(s.date)}</b>
                  </span>
                  <span className="rt">
                    <b>{s.title || "Training session"}</b>
                    <span>
                      {hhmm(s.start_time)}
                      {s.location ? ` · ${s.location}` : ""} · {totalMins(s)} min
                    </span>
                  </span>
                  <span style={{ width: 80, flex: "none" }}>
                    <Timeline s={s} drills={drillMap} />
                  </span>
                </button>
              ))
            ) : (
              <p className="muted">Nothing planned.</p>
            )}
          </div>
        </section>
        <section className="card">
          <div className="card-h">
            <h2>Out of action</h2>
            <Link className="btn sm" href="/squad">
              Squad
            </Link>
          </div>
          <div className="card-b rows">
            {out.length ? (
              out.map((p) => (
                <button key={p.id} className="rowi" onClick={() => open({ kind: "player", id: p.id })}>
                  <Shirt p={p} small />
                  <span className="rt">
                    <b>{p.full_name}</b>
                    <span>{p.status_note || STATUS[p.status]}</span>
                  </span>
                  <span className={`status s-${p.status}`}>{STATUS[p.status]}</span>
                </button>
              ))
            ) : (
              <p className="muted">{sq.length ? "Full squad available." : "No players in this team yet."}</p>
            )}
          </div>
        </section>
      </div>

      {can("attendance.view") && <LoadWatch />}

      <section className="card" style={{ marginTop: 16 }}>
        <div className="card-h">
          <h2>Club teams</h2>
          {isAdmin && (
            <button className="btn sm" onClick={() => open({ kind: "team", id: null })}>
              <Icon id="i-plus" />
              Add team
            </button>
          )}
        </div>
        <div className="card-b teams">
          {data.teams.map((t) => {
            const n = sessionsOf(t.id).find((s) => s.date >= today);
            return (
              <button key={t.id} className="tcard" aria-current={t.id === team.id} onClick={() => setTeam(t.id)}>
                <Crest url={t.logo_url ?? data.club.logo_url} size={40} />
                <span style={{ minWidth: 0 }}>
                  <b>{t.name}</b>
                  <span>
                    {squad(t.id).length} players · {t.coach_name || "No coach set"}
                  </span>
                  <span>{n ? `Next: ${fmtDay(n.date)} ${fmtNum(n.date)} ${fmtMon(n.date)}, ${hhmm(n.start_time)}` : "No session planned"}</span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </>
  );
}

function TrainingReplies({ playerId, teamIds, parent, name }: { playerId: string; teamIds: string[]; parent: boolean; name: string }) {
  const { data } = useApp();
  const today = todayIso();
  const upcoming = data.sessions
    .filter((s) => teamIds.includes(s.team_id) && s.date >= today)
    .sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time))
    .slice(0, 6);
  const tName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "";
  const teamName = teamIds.map(tName).join(", ");
  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-h">
        <h2>{parent ? `Is ${name} coming?` : "Are you coming?"}</h2>
        {teamName && <span className="muted" style={{ fontSize: 13 }}>{teamName}</span>}
      </div>
      <div style={{ padding: "6px 18px 0" }}>
        <MyLoadLine playerId={playerId} />
      </div>
      <div className="card-b train-list">
        {!upcoming.length && <p className="muted" style={{ margin: 0 }}>No upcoming sessions yet. When your coach plans one, you can reply here.</p>}
        {upcoming.map((s) => (
          <div key={s.id} className="train-row">
            <span className="dchip">
              <small>{fmtDay(s.date)}</small>
              <b>{fmtNum(s.date)}</b>
            </span>
            <span className="rt">
              <b>{s.title || "Training session"}</b>
              <span>
                {teamIds.length > 1 ? `${tName(s.team_id)} · ` : ""}
                {whenLabel(s.date)} · {hhmm(s.start_time)}
                {s.location ? ` · ${s.location}` : ""}
              </span>
            </span>
            <ReplyButtons sessionId={s.id} playerId={playerId} />
          </div>
        ))}
      </div>
    </section>
  );
}

function MyAvailability({ playerId, status, note, name, parent }: { playerId: string; status: Status; note: string; name: string; parent: boolean }) {
  const { supabase, refresh, toast, patch } = useApp();
  const [st, setSt] = useState<Status>(status);
  const [nt, setNt] = useState(note);
  const [busy, setBusy] = useState(false);
  const dirty = st !== status || nt !== note;

  async function save() {
    const note = st === "available" ? "" : nt.trim();
    patch((d) => ({ ...d, players: d.players.map((p) => (p.id === playerId ? { ...p, status: st, status_note: note } : p)) }));
    setBusy(true);
    const { error } = await supabase.rpc("set_availability", { p_player: playerId, p_status: st, p_note: note });
    setBusy(false);
    if (error) {
      refresh();
      return toast(errMsg(error));
    }
    toast("Availability updated");
    refresh();
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-h">
        <h2>{parent ? `${name}'s availability` : "Your availability"}</h2>
      </div>
      <div className="card-b avail-me">
        <span className="muted" style={{ fontSize: 13.5 }}>
          Let your coach know if {parent ? `${name} can't` : "you can't"} make training.
        </span>
        <div className="chips" role="group" aria-label="Availability">
          {(Object.keys(STATUS) as Status[]).map((k) => (
            <button key={k} type="button" className={`chip s-${k}`} aria-pressed={st === k} onClick={() => setSt(k)}>
              {STATUS[k]}
            </button>
          ))}
        </div>
        {st !== "available" && (
          <input className="input" id="my-note" maxLength={120} value={nt} onChange={(e) => setNt(e.target.value)} placeholder={st === "injured" ? "e.g. Sore ankle, seeing physio" : "e.g. Away on holiday until Monday"} />
        )}
        {dirty && (
          <div>
            <button className="btn primary sm" onClick={save} disabled={busy}>
              {busy ? "Saving…" : "Update availability"}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

export function NoTeams({ isAdmin }: { isAdmin: boolean }) {
  const { open } = useApp();
  return (
    <section className="hero">
      <PitchLines />
      <div>
        <span className="kick">Welcome</span>
        <h2>{isAdmin ? "Add your first team" : "No teams yet"}</h2>
        <p style={{ color: "var(--on-navy-muted)", margin: 0, maxWidth: "52ch" }}>
          {isAdmin
            ? "Create a team for each squad in your club. Then add players, plan sessions and invite your coaches from Club & members."
            : "Your club admin hasn't set up any teams yet. Check back soon."}
        </p>
        {isAdmin && (
          <div className="hacts">
            <button className="btn gold" onClick={() => open({ kind: "team", id: null })}>
              <Icon id="i-plus" />
              Add a team
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
