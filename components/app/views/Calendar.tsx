"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { hhmm, iso, parseD, todayIso } from "@/lib/format";
import type { Session } from "@/lib/types";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const monthTitle = (y: number, m: number) => new Date(y, m, 1).toLocaleDateString("en-AU", { month: "long", year: "numeric" });
const longDay = (d: string) => parseD(d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });

/**
 * Month view of a team's sessions. On wide screens each day lists its sessions; on phones days
 * show a dot and the chosen day's sessions are listed under the grid. Coaches can tap an empty
 * day to plan a session on it.
 */
export function MonthCalendar({ sessions, canEdit }: { sessions: Session[]; canEdit: boolean }) {
  const { open } = useApp();
  const today = todayIso();
  const [cursor, setCursor] = useState(() => ({ y: parseD(today).getFullYear(), m: parseD(today).getMonth() }));
  const [picked, setPicked] = useState(today);

  const first = new Date(cursor.y, cursor.m, 1);
  const start = new Date(first);
  start.setDate(1 - ((first.getDay() + 6) % 7)); // back to Monday
  const days: string[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    days.push(iso(d));
    if (i >= 34 && d.getMonth() !== cursor.m && (i + 1) % 7 === 0) break; // drop an empty last row
  }
  const byDay = new Map<string, Session[]>();
  sessions.forEach((s) => byDay.set(s.date, [...(byDay.get(s.date) ?? []), s]));
  byDay.forEach((l) => l.sort((a, b) => a.start_time.localeCompare(b.start_time)));
  const inMonth = (d: string) => parseD(d).getMonth() === cursor.m;
  const move = (n: number) =>
    setCursor((c) => {
      const d = new Date(c.y, c.m + n, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  const pickedList = byDay.get(picked) ?? [];
  const monthCount = sessions.filter((s) => inMonth(s.date) && s.date.slice(0, 7) === iso(first).slice(0, 7)).length;

  return (
    <section className="cal" aria-label="Calendar">
      <div className="cal-head">
        <h2>{monthTitle(cursor.y, cursor.m)}</h2>
        <span className="muted cal-count">
          {monthCount} session{monthCount === 1 ? "" : "s"}
        </span>
        <div className="cal-nav">
          <button type="button" className="btn sm" onClick={() => move(-1)} aria-label="Previous month">
            ‹
          </button>
          <button
            type="button"
            className="btn sm"
            onClick={() => {
              setCursor({ y: parseD(today).getFullYear(), m: parseD(today).getMonth() });
              setPicked(today);
            }}
          >
            Today
          </button>
          <button type="button" className="btn sm" onClick={() => move(1)} aria-label="Next month">
            ›
          </button>
        </div>
      </div>
      <div className="cal-grid" role="grid" aria-label={monthTitle(cursor.y, cursor.m)}>
        {WEEKDAYS.map((w) => (
          <div key={w} className="cal-wd" role="columnheader">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const list = byDay.get(d) ?? [];
          return (
            <div
              key={d}
              role="gridcell"
              className="cal-day"
              data-out={!inMonth(d) || undefined}
              data-today={d === today || undefined}
              data-picked={d === picked || undefined}
              data-past={d < today || undefined}
              onClick={() => setPicked(d)}
            >
              <button
                type="button"
                className="cal-num"
                aria-label={`${longDay(d)}${list.length ? `, ${list.length} session${list.length === 1 ? "" : "s"}` : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setPicked(d);
                }}
              >
                {parseD(d).getDate()}
              </button>
              <div className="cal-items">
                {list.slice(0, 3).map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    className="cal-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      open({ kind: "session", id: s.id });
                    }}
                  >
                    <span className="tnum">{hhmm(s.start_time)}</span> {s.title || "Training session"}
                  </button>
                ))}
                {list.length > 3 && <span className="cal-more">+{list.length - 3} more</span>}
              </div>
              {list.length > 0 && <span className="cal-dot" aria-hidden="true" />}
              {canEdit && d >= today && (
                <button
                  type="button"
                  className="cal-add"
                  aria-label={`Plan a session on ${longDay(d)}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    open({ kind: "session", id: null, date: d });
                  }}
                >
                  +
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Phones: the chosen day's sessions under the grid. */}
      <div className="cal-agenda">
        <h3>{longDay(picked)}</h3>
        {pickedList.length ? (
          pickedList.map((s) => (
            <button key={s.id} type="button" className="cal-agenda-item" onClick={() => open({ kind: "session", id: s.id })}>
              <span className="tnum">{hhmm(s.start_time)}</span>
              <span>
                <b>{s.title || "Training session"}</b>
                {s.location && <small>{s.location}</small>}
              </span>
            </button>
          ))
        ) : (
          <p className="muted">No sessions.</p>
        )}
        {canEdit && picked >= today && (
          <button type="button" className="btn sm" onClick={() => open({ kind: "session", id: null, date: picked })}>
            Plan a session on this day
          </button>
        )}
      </div>
    </section>
  );
}
