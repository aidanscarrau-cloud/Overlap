"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Crest, Icon, PitchLines, Shirt, Timeline, totalMins } from "@/components/ui";
import { STATUS } from "@/lib/constants";
import { addMins, errMsg, fmtDay, fmtLongDay, fmtLongMon, fmtMon, fmtNum, hhmm, iso, todayIso, whenLabel } from "@/lib/format";
import type { Status } from "@/lib/types";

export function Overview() {
  const { data, team, squad, sessionsOf, attendedSet, drillMap, can, canDo, playerRate, isAdmin, open, setTeam } = useApp();
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
  const myPlayer = data.me?.player_id ? data.players.find((p) => p.id === data.me.player_id) : null;

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

      {myPlayer && <MyAvailability playerId={myPlayer.id} status={myPlayer.status} note={myPlayer.status_note} name={myPlayer.full_name} parent={data.role === "parent"} />}

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
        ) : myPlayer && playerRate(myPlayer) !== null ? (
          <div className="card stat">
            <span className="eyebrow">Your attendance</span>
            <div className="v tnum">
              {playerRate(myPlayer)}
              <small>%</small>
            </div>
            <div className="bar" style={{ flex: "none" }} aria-hidden="true">
              <i style={{ width: `${playerRate(myPlayer)}%` }} />
            </div>
            <span className="sub">of completed sessions{data.role === "parent" ? ` for ${myPlayer.full_name.split(" ")[0]}` : ""}</span>
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

function MyAvailability({ playerId, status, note, name, parent }: { playerId: string; status: Status; note: string; name: string; parent: boolean }) {
  const { supabase, refresh, toast } = useApp();
  const [st, setSt] = useState<Status>(status);
  const [nt, setNt] = useState(note);
  const [busy, setBusy] = useState(false);
  const dirty = st !== status || nt !== note;

  async function save() {
    setBusy(true);
    const { error } = await supabase.rpc("set_availability", { p_player: playerId, p_status: st, p_note: st === "available" ? "" : nt.trim() });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Availability updated");
    refresh();
  }

  return (
    <section className="card" style={{ marginTop: 16 }}>
      <div className="card-h">
        <h2>{parent ? `${name.split(" ")[0]}'s availability` : "Your availability"}</h2>
      </div>
      <div className="card-b avail-me">
        <span className="muted" style={{ fontSize: 13.5 }}>
          Let your coach know if {parent ? `${name.split(" ")[0]} can't` : "you can't"} make training.
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
