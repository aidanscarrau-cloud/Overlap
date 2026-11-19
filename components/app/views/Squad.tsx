"use client";

import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { useFamilyRedirect } from "../FamilyRedirect";
import { Icon } from "@/components/ui";
import { NoTeams } from "./Overview";
import { LineupPitch } from "../squad/LineupPitch";
import { POS, POSNAME, STATUS } from "@/lib/constants";
import { InjuryBoard } from "../injuries/Injuries";
import { ImportPlayers } from "../squad/ImportPlayers";
import { fmtDay, todayIso } from "@/lib/format";
import { overall } from "@/lib/idp";
import type { Player, Position } from "@/lib/types";

export function Squad() {
  // Players and parents don't use this page; send them home.
  const family = useFamilyRedirect();
  return family ? null : <SquadPage />;
}

export const POS_COLOUR: Record<Position, string> = { GK: "#f59e0b", DEF: "#3b82f6", MID: "#22c55e", FWD: "#ef4444" };
const STATUS_COLOUR = { available: "#16a34a", injured: "#c2372f", unavailable: "#a16207" } as const;
type Reply = "y" | "n" | "q";
/** Shirt number, or initials when there isn't one. */
export const badgeOf = (p: Player) => (p.shirt_number != null ? String(p.shirt_number) : p.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join(""));
const REPLY = { y: { t: "✓", c: "#16a34a", bg: "#e8f6ee", w: "Coming" }, n: { t: "✕", c: "#c2372f", bg: "#fdecec", w: "Can't come" }, q: { t: "?", c: "#98a2b3", bg: "#f2f3f5", w: "No reply" } };


function SquadPage() {
  const { data, team, squad, playerRate, can, canDo, isAdmin, open, sessionsOf, repliesFor, evaluationsOf } = useApp();
  const [view, setView] = useState<"pitch" | "list">("pitch");
  const [importing, setImporting] = useState(false);
  const [filter, setFilter] = useState<"all" | "coming" | "noreply" | "out" | "low">("all");
  const [q, setQ] = useState("");
  useEffect(() => {
    try {
      const v = localStorage.getItem("overlap-squad-view");
      if (v === "list" || v === "pitch") setView(v);
    } catch {}
  }, []);
  const pickView = (v: "pitch" | "list") => {
    setView(v);
    try {
      localStorage.setItem("overlap-squad-view", v);
    } catch {}
  };
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const canEdit = canDo("squad.edit", team.id);
  const seeAtt = can("attendance.view");
  const seeIdp = can("idp.view");
  const all = squad().sort((a, b) => (a.shirt_number ?? 99) - (b.shirt_number ?? 99));
  const next = sessionsOf().find((s) => s.date >= todayIso());
  const replies = next ? repliesFor(next.id) : null;
  const replyOf = (p: Player): Reply | null => (replies ? (replies.get(p.id) ? (replies.get(p.id)!.going ? "y" : "n") : "q") : null);
  const rating = (p: Player) => (seeIdp ? overall(evaluationsOf(p.id)[0]?.ratings) : null);
  const rate = (p: Player) => (seeAtt ? playerRate(p) : null);
  const out = all.filter((p) => p.status !== "available");
  const coming = all.filter((p) => replyOf(p) === "y");
  const rates = all.map(rate).filter((r): r is number => r !== null);
  const avg = rates.length ? Math.round(rates.reduce((s, r) => s + r, 0) / rates.length) : null;
  const day = next ? fmtDay(next.date) : "";

  const ql = q.trim().toLowerCase();
  const shown = all.filter(
    (p) =>
      (!ql || p.full_name.toLowerCase().includes(ql) || String(p.shirt_number ?? "") === ql) &&
      (filter === "all" ||
        (filter === "coming" && replyOf(p) === "y") ||
        (filter === "noreply" && replyOf(p) === "q") ||
        (filter === "out" && p.status !== "available") ||
        (filter === "low" && (rate(p) ?? 100) < 75)),
  );

  const pitch = <LineupPitch key={team.id} team={team} players={all} replyOf={replyOf} canEdit={canEdit} rate={rate} day={day} />;

  const list = (
    <section className="sq-list-wrap" aria-label="Squad list">
      <div className="sq-sum">
        <button type="button" onClick={() => setFilter("all")}>
          <b>{all.length}</b>
          <small>Players</small>
        </button>
        {next && (
          <button type="button" onClick={() => setFilter("coming")}>
            <b className="ok">{coming.length}</b>
            <small>Coming {day}</small>
          </button>
        )}
        <button type="button" onClick={() => setFilter("out")}>
          <b className={out.length ? "bad" : ""}>{out.length}</b>
          <small>Out</small>
        </button>
        {avg !== null && (
          <button type="button" onClick={() => setFilter("low")}>
            <b>{avg}%</b>
            <small>Attendance</small>
          </button>
        )}
      </div>
      <div className="sq-find">
        <label className="dsearch">
          <Icon id="i-search" />
          <input type="search" placeholder="Search name or number" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search players" />
        </label>
      </div>
      <div className="dchips" role="group" aria-label="Show">
        {(
          [
            ["all", `All ${all.length}`, true],
            ["coming", `Coming ${day} ${coming.length}`, !!next],
            ["noreply", "No reply", !!next],
            ["out", `Out ${out.length}`, true],
            ["low", "Low attendance", seeAtt],
          ] as const
        )
          .filter(([, , show]) => show)
          .map(([k, l]) => (
            <button key={k} type="button" className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
      </div>
      {filter !== "all" || q ? null : <InjuryBoard players={all} />}
      {shown.length ? (
        POS.map((pos) => {
          const g = shown.filter((p) => p.position === pos);
          if (!g.length) return null;
          return (
            <div key={pos} className="sq-grp">
              <h2>
                <i style={{ background: POS_COLOUR[pos] }} />
                {POSNAME[pos]} <small>{g.length}</small>
              </h2>
              <ul className="sq-rows">
                {g.map((p) => {
                  const r = replyOf(p);
                  const rt = rating(p);
                  const at = rate(p);
                  const from = p.team_id !== team.id ? data.teams.find((t) => t.id === p.team_id)?.name : null;
                  return (
                    <li key={p.id}>
                      <button type="button" className="sq-row" onClick={() => open({ kind: "player", id: p.id })}>
                        <span className="sq-num" style={{ background: POS_COLOUR[p.position] }}>
                          {badgeOf(p)}
                        </span>
                        <span className="sq-t">
                          <b>{p.full_name}</b>
                          <small>
                            <span style={{ color: STATUS_COLOUR[p.status] }}>● {STATUS[p.status]}</span>
                            {p.status !== "available" && p.status_note ? ` · ${p.status_note}` : ""}
                            {rt !== null ? ` · ★ ${rt}` : ""}
                            {from ? ` · from ${from}` : ""}
                          </small>
                        </span>
                        {r && (
                          <span className="sq-rep" style={{ background: REPLY[r].bg, color: REPLY[r].c }} title={`${REPLY[r].w} ${day}`}>
                            {REPLY[r].t}
                          </span>
                        )}
                        {at !== null && (
                          <span className={`sq-att${at < 75 ? " low" : ""}`}>
                            {at}%<small>attend</small>
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })
      ) : (
        <div className="dempty">
          <b>{all.length ? "No players match." : "No players yet."}</b>
          {!all.length && canEdit && (
            <span className="dempty-acts">
              <button className="btn primary" onClick={() => setImporting(true)}>
                Import from a spreadsheet
              </button>
              <button className="btn" onClick={() => open({ kind: "player", id: null })}>
                Add one player
              </button>
            </span>
          )}
        </div>
      )}
    </section>
  );

  return (
    <div className="sq-page">
      <div className="phead">
        <div>
          <div className="eyebrow">
            {team.name} · {all.length} player{all.length === 1 ? "" : "s"}
          </div>
          <h1>Squad</h1>
        </div>
        {canEdit && (
          <div className="sq-head-acts">
            <button className="btn sq-import" onClick={() => setImporting(true)}>
              Import players
            </button>
            <button className="btn primary sq-add" onClick={() => open({ kind: "player", id: null })} aria-label="Add player">
              <Icon id="i-plus" />
              <span>Add player</span>
            </button>
          </div>
        )}
      </div>
      {importing && <ImportPlayers team={team} onClose={() => setImporting(false)} />}
      <div className="seg sq-seg" role="tablist" aria-label="View">
        <button role="tab" aria-selected={view === "pitch"} onClick={() => pickView("pitch")}>
          Pitch
        </button>
        <button role="tab" aria-selected={view === "list"} onClick={() => pickView("list")}>
          List
        </button>
      </div>
      <div className={`sq-split show-${view}`}>
        {pitch}
        {list}
      </div>
    </div>
  );
}
