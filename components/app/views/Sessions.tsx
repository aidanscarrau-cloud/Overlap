"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { DateBox, Icon, Timeline, totalMins } from "@/components/ui";
import { NoTeams } from "./Overview";
import { addMins, hhmm, todayIso, weekKey, weekLabel } from "@/lib/format";
import type { Session } from "@/lib/types";

export function Sessions() {
  const { team, sessionsOf, squad, attendedSet, drillMap, can, canDo, isAdmin, open } = useApp();
  const [filter, setFilter] = useState<"upcoming" | "past">("upcoming");
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const canEdit = canDo("sessions.edit", team.id);
  const today = todayIso();
  const ss = sessionsOf();
  const up = ss.filter((s) => s.date >= today);
  const past = ss.filter((s) => s.date < today).reverse();
  const list = filter === "upcoming" ? up : past;
  const groups: { k: string; items: Session[] }[] = [];
  list.forEach((s) => {
    const k = weekKey(s.date);
    let g = groups.find((x) => x.k === k);
    if (!g) groups.push((g = { k, items: [] }));
    g.items.push(s);
  });
  const n = squad().length;
  const avail = squad().filter((p) => p.status === "available").length;

  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">{team.name}</div>
          <h1>Sessions</h1>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => open({ kind: "session", id: null })}>
            <Icon id="i-plus" />
            Plan a session
          </button>
        )}
      </div>
      <div className="toolbar">
        <div className="chips">
          <button className="chip" aria-pressed={filter === "upcoming"} onClick={() => setFilter("upcoming")}>
            Upcoming<span className="n">{up.length}</span>
          </button>
          <button className="chip" aria-pressed={filter === "past"} onClick={() => setFilter("past")}>
            Completed<span className="n">{past.length}</span>
          </button>
        </div>
      </div>
      {groups.length ? (
        groups.map((g) => (
          <section key={g.k} className="wk">
            <h2>{weekLabel(g.k)}</h2>
            {g.items.map((s) => {
              const isPast = s.date < today;
              return (
                <button key={s.id} className={`card scard${isPast ? " past" : ""}`} onClick={() => open({ kind: "session", id: s.id })}>
                  <DateBox date={s.date} />
                  <div style={{ minWidth: 0 }}>
                    <h3>
                      {s.title || "Training session"}
                      {s.date === today && <span className="tag-today">Today</span>}
                    </h3>
                    <div className="smeta">
                      <span>
                        <Icon id="i-clock" />
                        {hhmm(s.start_time)}–{addMins(s.start_time, totalMins(s))}
                      </span>
                      {s.location && (
                        <span>
                          <Icon id="i-pin" />
                          {s.location}
                        </span>
                      )}
                      {s.focus && (
                        <span>
                          <Icon id="i-target" />
                          {s.focus}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="sright">
                    <Timeline s={s} drills={drillMap} />
                    <div className="r">
                      <span>
                        <b>{s.plan.length}</b> drills · <b>{totalMins(s)}</b> min
                      </span>
                      <span>
                        {isPast && !can("attendance.view") ? null : isPast ? (
                          <>
                            <b>{attendedSet(s.id).size}</b>/{n} attended
                          </>
                        ) : (
                          <>
                            <b>{avail}</b>/{n} available
                          </>
                        )}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </section>
        ))
      ) : (
        <div className="empty">{filter === "upcoming" ? "No upcoming sessions." : "No completed sessions."}</div>
      )}
    </>
  );
}
