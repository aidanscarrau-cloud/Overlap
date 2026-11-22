"use client";

import { useState } from "react";

/** A rough "volunteer hours back" estimate a committee can quote. Every assumption is shown and adjustable. */
export function HoursCalc() {
  const [teams, setTeams] = useState(10);
  const [mins, setMins] = useState(45);
  const [weeks, setWeeks] = useState(30);
  const hours = Math.round((teams * mins * weeks) / 60);
  const days = Math.round(hours / 8);
  return (
    <div className="lp-calc">
      <div className="lp-calc-in">
        <label>
          <span>
            Teams at your club <b>{teams}</b>
          </span>
          <input type="range" min={1} max={60} value={teams} onChange={(e) => setTeams(+e.target.value)} />
        </label>
        <label>
          <span>
            Minutes per team, per week, spent chasing replies, sorting the register and messaging families <b>{mins} min</b>
          </span>
          <input type="range" min={10} max={120} step={5} value={mins} onChange={(e) => setMins(+e.target.value)} />
        </label>
        <label>
          <span>
            Weeks in your season, including pre-season <b>{weeks}</b>
          </span>
          <input type="range" min={10} max={52} value={weeks} onChange={(e) => setWeeks(+e.target.value)} />
        </label>
      </div>
      <div className="lp-calc-out" aria-live="polite">
        <span>Volunteer time on admin each season</span>
        <b>{hours.toLocaleString("en-AU")} hours</b>
        <small>
          That&apos;s about {days} full working days. Overlap&apos;s one-tap replies, reminders and register are built to give most of it back.
        </small>
      </div>
    </div>
  );
}
