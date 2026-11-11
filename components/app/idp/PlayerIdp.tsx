"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { Icon, Shirt } from "@/components/ui";
import { RadarChart, RatingBar, Sparkline } from "./Charts";
import { AREAS, areaLabel, overall, reviewDue, type Goal } from "@/lib/idp";
import { fmtMins, weeklyAverage } from "@/lib/load";
import { errMsg, fmtMon, fmtNum, parseD, todayIso } from "@/lib/format";
import { timeAgo } from "../views/Announcements";

const longDate = (d: string) => parseD(d).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });

export function PlayerIdp({ playerId }: { playerId: string }) {
  const { data, can, canDo, evaluationsOf, goalsOf, loadOf, playerRate, open, myPlayers, kidName } = useApp();
  const player = data.players.find((p) => p.id === playerId);
  const mine = myPlayers.some((p) => p.id === playerId);
  if (!player || (!can("idp.view") && !mine))
    return (
      <div className="empty">
        This development plan isn&apos;t available. <Link href="/development">Back to Development</Link>
      </div>
    );

  const canEdit = player.team_ids.some((t) => canDo("idp.edit", t));
  const evs = evaluationsOf(playerId);
  const latest = evs[0];
  const previous = evs[1];
  const goals = goalsOf(playerId);
  const active = goals.filter((g) => g.status === "active");
  const done = goals.filter((g) => g.status !== "active");
  const ov = overall(latest?.ratings);
  const teams = player.team_ids.map((t) => data.teams.find((x) => x.id === t)?.name).filter(Boolean);
  const history = [...evs].reverse();
  const load = loadOf(playerId);
  const rate = playerRate(player);
  const who = mine && data.role === "parent" ? kidName(player) : null;

  return (
    <>
      <div className="phead" style={{ alignItems: "center" }}>
        <div style={{ display: "flex", gap: 14, alignItems: "center", minWidth: 0 }}>
          <Shirt p={player} />
          <div style={{ minWidth: 0 }}>
            {can("idp.view") && (
              <Link href="/development" className="eyebrow" style={{ textDecoration: "none" }}>
                ← Development
              </Link>
            )}
            <h1 style={{ fontSize: "clamp(30px,4.5vw,44px)" }}>{player.full_name}</h1>
            <div className="muted" style={{ fontSize: 13.5 }}>
              {player.position} · {teams.join(", ")}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link className="btn" href={`/players/${playerId}`}>
            Progress report
          </Link>
        {canEdit && (
          <>
            <button className="btn" onClick={() => open({ kind: "goal", playerId, id: null })}>
              <Icon id="i-plus" />
              Add goal
            </button>
            <button className="btn primary" onClick={() => open({ kind: "evaluation", playerId, id: null })}>
              <Icon id="i-plus" />
              New evaluation
            </button>
          </>
        )}
        </div>
      </div>

      {latest ? (
        <>
          <div className="idp-grid">
            <section className="card card-b">
              <div className="idp-ov">
                <div>
                  <span className="eyebrow">Overall</span>
                  <div className="ov-big tnum">
                    {ov}
                    <small className="muted" style={{ fontSize: 18 }}>
                      /10
                    </small>
                  </div>
                </div>
                <div style={{ textAlign: "right", fontSize: 13 }} className="muted">
                  Evaluated {longDate(latest.evaluated_on)}
                  <br />
                  by {latest.author_name}
                  {!latest.shared && (
                    <>
                      <br />
                      <span className="rbadge wait">Private coach note</span>
                    </>
                  )}
                  {canEdit && reviewDue(latest) && (
                    <>
                      <br />
                      <span className="rbadge wait">Due for review</span>
                    </>
                  )}
                </div>
              </div>
              <RadarChart latest={latest.ratings} previous={previous?.ratings} latestDate={latest.evaluated_on} previousDate={previous?.evaluated_on} />
            </section>
            <section className="card">
              <div className="card-h">
                <h2>By area</h2>
                {previous && <span className="muted" style={{ fontSize: 13 }}>Marker = previous</span>}
              </div>
              <div className="card-b area-list">
                {AREAS.map((a) => (
                  <div key={a.key} className="area-row">
                    <div className="area-head">
                      <b>{a.label}</b>
                      <Sparkline label={a.label} values={history.filter((e) => typeof e.ratings[a.key] === "number").map((e) => ({ v: e.ratings[a.key]!, d: e.evaluated_on }))} />
                    </div>
                    <RatingBar value={latest.ratings[a.key]} previous={previous?.ratings[a.key]} />
                    {latest.comments[a.key] && <p className="area-comment">{latest.comments[a.key]}</p>}
                  </div>
                ))}
              </div>
            </section>
          </div>

          {(latest.strengths || latest.improvements) && (
            <div className="ovgrid">
              <section className="card idp-note good">
                <div className="card-h">
                  <h2>Where {who ? `${who} is` : mine ? "you are" : "they are"} now</h2>
                </div>
                <div className="card-b">
                  <p>{latest.strengths || "No strengths written yet."}</p>
                </div>
              </section>
              <section className="card idp-note work">
                <div className="card-h">
                  <h2>Working towards</h2>
                </div>
                <div className="card-b">
                  <p>{latest.improvements || "Nothing written yet."}</p>
                </div>
              </section>
            </div>
          )}
          {latest.summary && (
            <section className="card card-b" style={{ marginTop: 16, paddingTop: 16 }}>
              <span className="eyebrow">Coach summary</span>
              <p style={{ margin: "6px 0 0", whiteSpace: "pre-wrap" }}>{latest.summary}</p>
            </section>
          )}
        </>
      ) : (
        <div className="empty" style={{ marginBottom: 16 }}>
          {canEdit ? (
            <>
              No evaluations yet.{" "}
              <button className="btn sm primary" onClick={() => open({ kind: "evaluation", playerId, id: null })}>
                Write the first evaluation
              </button>
            </>
          ) : (
            "No evaluations have been shared yet. Your coach will add one soon."
          )}
        </div>
      )}

      <section style={{ marginTop: 20 }}>
        <div className="phead" style={{ marginBottom: 12 }}>
          <h2 className="sec-title">Goals</h2>
          {canEdit && (
            <button className="btn sm" onClick={() => open({ kind: "goal", playerId, id: null })}>
              <Icon id="i-plus" />
              Add goal
            </button>
          )}
        </div>
        {active.length ? (
          <div className="goal-list">
            {active.map((g) => (
              <GoalCard key={g.id} g={g} canEdit={canEdit} canNote={canEdit || mine} />
            ))}
          </div>
        ) : (
          <div className="empty">{canEdit ? "No active goals. Add one to give them something to aim for." : "No active goals yet."}</div>
        )}
        {done.length > 0 && (
          <details className="done-goals">
            <summary>
              {done.filter((g) => g.status === "achieved").length} achieved, {done.filter((g) => g.status === "dropped").length} dropped
            </summary>
            <div className="goal-list">
              {done.map((g) => (
                <GoalCard key={g.id} g={g} canEdit={canEdit} canNote={false} />
              ))}
            </div>
          </details>
        )}
      </section>

      {(rate !== null || load) && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="card-h">
            <h2>Evidence</h2>
            <span className="muted" style={{ fontSize: 13 }}>
              From attendance and training load
            </span>
          </div>
          <div className="card-b evidence">
            {rate !== null && (
              <div>
                <span className="eyebrow">Attendance</span>
                <b className="tnum">{rate}%</b>
                <span className="muted">of completed sessions</span>
              </div>
            )}
            {load && (
              <>
                <div>
                  <span className="eyebrow">Sessions, last 4 weeks</span>
                  <b className="tnum">{load.sessions_28d}</b>
                  <span className="muted">{fmtMins(load.mins_28d)} in total</span>
                </div>
                <div>
                  <span className="eyebrow">Usual week</span>
                  <b className="tnum">{fmtMins(weeklyAverage(load))}</b>
                  <span className="muted">last 7 days: {fmtMins(load.mins_7d)}</span>
                </div>
              </>
            )}
            <div>
              <span className="eyebrow">Goals achieved</span>
              <b className="tnum">{goals.filter((g) => g.status === "achieved").length}</b>
              <span className="muted">{active.length} in progress</span>
            </div>
          </div>
        </section>
      )}

      {evs.length > 0 && (
        <section className="card" style={{ marginTop: 20 }}>
          <div className="card-h">
            <h2>Evaluation history</h2>
          </div>
          <div className="card-b rows">
            {evs.map((e, i) => {
              const o = overall(e.ratings);
              const po = overall(evs[i + 1]?.ratings);
              const body = (
                <>
                  <span className="dchip">
                    <small>{fmtMon(e.evaluated_on)}</small>
                    <b>{fmtNum(e.evaluated_on)}</b>
                  </span>
                  <span className="rt">
                    <b>
                      Overall {o ?? "–"}
                      {o !== null && po !== null && o !== po && (
                        <span className={`delta ${o > po ? "up" : "down"}`} style={{ marginLeft: 8 }}>
                          {o > po ? "▲" : "▼"} {Math.abs(Math.round((o - po) * 10) / 10)}
                        </span>
                      )}
                    </b>
                    <span>
                      {parseD(e.evaluated_on).getFullYear()} · by {e.author_name}
                      {!e.shared ? " · private" : ""}
                    </span>
                  </span>
                  <span className="dev-mini" aria-hidden="true">
                    {AREAS.map((a) => (
                      <span key={a.key} title={`${a.label}: ${e.ratings[a.key] ?? "–"}`}>
                        <i style={{ height: `${((e.ratings[a.key] ?? 0) / 10) * 100}%` }} />
                      </span>
                    ))}
                  </span>
                </>
              );
              return canEdit ? (
                <button key={e.id} className="rowi" onClick={() => open({ kind: "evaluation", playerId, id: e.id })}>
                  {body}
                </button>
              ) : (
                <div key={e.id} className="rowi">
                  {body}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </>
  );
}

function GoalCard({ g, canEdit, canNote }: { g: Goal; canEdit: boolean; canNote: boolean }) {
  const { data, updatesOf, supabase, refresh, toast, open, patch } = useApp();
  const updates = updatesOf(g.id);
  const [note, setNote] = useState("");
  const [progress, setProgress] = useState(g.progress);
  const [busy, setBusy] = useState(false);
  const overdue = g.status === "active" && g.target_date && g.target_date < todayIso();

  async function post(e: React.FormEvent) {
    e.preventDefault();
    const text = note.trim() || (canEdit && progress !== g.progress ? `Progress updated to ${progress}%` : "");
    if (!text) return;
    setBusy(true);
    if (canEdit && progress !== g.progress) {
      patch((d) => ({ ...d, goals: d.goals.map((x) => (x.id === g.id ? { ...x, progress } : x)) }));
      const { error } = await supabase.from("player_goals").update({ progress }).eq("id", g.id);
      if (error) {
        setBusy(false);
        refresh();
        return toast(errMsg(error));
      }
    }
    const { error } = await supabase.from("goal_updates").insert({ goal_id: g.id, note: text, progress: canEdit ? progress : null });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setNote("");
    toast("Update added");
    refresh();
  }
  async function setStatus(status: Goal["status"]) {
    setBusy(true);
    const { error } = await supabase.from("player_goals").update({ status }).eq("id", g.id);
    if (!error && status === "achieved") await supabase.from("goal_updates").insert({ goal_id: g.id, note: "Goal achieved" });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(status === "achieved" ? "Goal achieved. Nice work!" : status === "active" ? "Goal reopened" : "Goal dropped");
    refresh();
  }

  return (
    <article className={`card goal ${g.status}`}>
      <div className="goal-head">
        <span className="news-to">{areaLabel(g.area)}</span>
        {g.status === "achieved" && <span className="rbadge yes">✓ Achieved {g.achieved_on ? `${fmtNum(g.achieved_on)} ${fmtMon(g.achieved_on)}` : ""}</span>}
        {g.status === "dropped" && <span className="rbadge wait">Dropped</span>}
        {g.target_date && g.status === "active" && (
          <span className={overdue ? "rbadge no" : "muted"} style={{ fontSize: 13 }}>
            {overdue ? "Overdue · " : "Target "}
            {fmtNum(g.target_date)} {fmtMon(g.target_date)}
          </span>
        )}
        {canEdit && (
          <button className="btn sm" style={{ marginLeft: "auto" }} onClick={() => open({ kind: "goal", playerId: g.player_id, id: g.id })}>
            Edit
          </button>
        )}
      </div>
      <h3>{g.title}</h3>
      {g.detail && <p className="muted" style={{ margin: 0, whiteSpace: "pre-wrap" }}>{g.detail}</p>}
      <div className="goal-progress">
        <span className="bar">
          <i style={{ width: `${g.progress}%`, background: g.status === "achieved" ? "var(--good)" : undefined }} />
        </span>
        <b className="tnum">{g.progress}%</b>
      </div>
      {updates.length > 0 && (
        <ul className="goal-log">
          {updates.map((u) => (
            <li key={u.id} className={u.by_staff ? "staff" : "player"}>
              <span className="who">
                {u.author_name} {u.by_staff ? "· coach" : u.author_id === data.userId ? "· you" : ""}
                <span className="muted"> · {timeAgo(u.created_at)}</span>
              </span>
              <span>{u.note}</span>
            </li>
          ))}
        </ul>
      )}
      {g.status === "active" && (canNote || canEdit) && (
        <form className="goal-form" onSubmit={post}>
          {canEdit && (
            <label className="goal-slider">
              <span className="muted">Progress {progress}%</span>
              <input type="range" className="slider" min={0} max={100} step={5} value={progress} onChange={(e) => setProgress(+e.target.value)} aria-label="Goal progress" />
            </label>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <input className="input" style={{ flex: "1 1 220px" }} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={canEdit ? "Add a coach note (optional when updating progress)" : "Add a note: how is it going?"} aria-label="Goal note" />
            <button className="btn sm primary" type="submit" disabled={busy || (!note.trim() && !(canEdit && progress !== g.progress))}>
              {canEdit && progress !== g.progress && !note.trim() ? "Save progress" : "Add update"}
            </button>
            {canEdit && (
              <button className="btn sm" type="button" disabled={busy} onClick={() => setStatus("achieved")}>
                ✓ Mark achieved
              </button>
            )}
          </div>
        </form>
      )}
      {g.status !== "active" && canEdit && (
        <div>
          <button className="btn sm" disabled={busy} onClick={() => setStatus("active")}>
            Reopen goal
          </button>
        </div>
      )}
    </article>
  );
}
