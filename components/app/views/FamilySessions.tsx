"use client";

import { CalendarSync } from "../CalendarSync";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { ReplyButtons } from "../Replies";
import { totalMins } from "@/components/ui";
import { addMins, fmtDay, fmtLongDay, fmtLongMon, fmtMon, fmtNum, hhmm, todayIso } from "@/lib/format";

/** Players and parents: every session for their teams, with Yes/No right on the page. */
export function FamilySessions() {
  const { data, myPlayers, kidName, attendedSet, open } = useApp();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const parent = data.role === "parent";
  const today = todayIso();
  const teamIds = [...new Set(myPlayers.flatMap((p) => p.team_ids))];
  const tName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "";
  const all = data.sessions.filter((s) => teamIds.includes(s.team_id)).sort((a, b) => (a.date + a.start_time).localeCompare(b.date + b.start_time));
  const upcoming = all.filter((s) => s.date >= today);
  const past = all.filter((s) => s.date < today).reverse().slice(0, 20);

  if (!myPlayers.length)
    return (
      <div className="calm-home">
        <h1>Sessions</h1>
        <p>Your account isn&apos;t linked to {parent ? "your child" : "your player profile"} yet. Ask your club admin to link you on the Club &amp; members page.</p>
      </div>
    );

  return (
    <div className="calm-home">
      <h1>Sessions</h1>
      <div className="phead-actions">
        <CalendarSync />
      </div>
      <div className="subtabs" role="tablist">
        <button role="tab" aria-selected={tab === "upcoming"} onClick={() => setTab("upcoming")}>
          Coming up
        </button>
        <button role="tab" aria-selected={tab === "past"} onClick={() => setTab("past")}>
          Past
        </button>
      </div>

      {tab === "upcoming" &&
        (upcoming.length ? (
          upcoming.map((s) => (
            <section key={s.id} className="calm-session">
              <div className="calm-session-head">
                <span className="calm-date">
                  <small>{fmtDay(s.date)}</small>
                  <b>{fmtNum(s.date)}</b>
                  <small>{fmtMon(s.date)}</small>
                </span>
                <div style={{ minWidth: 0 }}>
                  <h2>{s.title || "Training session"}</h2>
                  <p className="calm-muted">
                    {fmtLongDay(s.date)} {fmtNum(s.date)} {fmtLongMon(s.date)} · {hhmm(s.start_time)}
                    {totalMins(s) ? ` to ${addMins(s.start_time, totalMins(s))}` : ""}
                    {s.location ? ` · ${s.location}` : ""}
                    {teamIds.length > 1 ? ` · ${tName(s.team_id)}` : ""}
                  </p>
                </div>
              </div>
              {myPlayers
                .filter((p) => p.team_ids.includes(s.team_id))
                .map((p) => (
                  <ReplyButtons
                    key={p.id}
                    sessionId={s.id}
                    playerId={p.id}
                    label={parent ? `Is ${kidName(p)} coming?` : "Are you coming?"}
                    who={parent ? kidName(p) : undefined}
                  />
                ))}
              {s.plan.length > 0 && (
                <button type="button" className="linkbtn" style={{ justifySelf: "start" }} onClick={() => open({ kind: "session", id: s.id })}>
                  See the session plan
                </button>
              )}
            </section>
          ))
        ) : (
          <p className="calm-muted">No sessions planned yet. When your coach plans one, it shows up here.</p>
        ))}

      {tab === "past" &&
        (past.length ? (
          <ul className="calm-list">
            {past.map((s) => {
              const came = attendedSet(s.id);
              return (
                <li key={s.id}>
                  <span>
                    {fmtDay(s.date)} {fmtNum(s.date)} {fmtMon(s.date)} · {s.title || "Training session"}
                  </span>
                  <span className="calm-badges">
                    {myPlayers
                      .filter((p) => p.team_ids.includes(s.team_id))
                      .map((p) => (
                        <span key={p.id} className={`rbadge ${came.has(p.id) ? "yes" : "wait"}`}>
                          {myPlayers.length > 1 ? `${kidName(p)}: ` : ""}
                          {came.has(p.id) ? "Attended" : "Not marked"}
                        </span>
                      ))}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="calm-muted">No past sessions yet.</p>
        ))}
    </div>
  );
}
