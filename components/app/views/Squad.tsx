"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { useFamilyRedirect } from "../FamilyRedirect";
import { Icon, Shirt } from "@/components/ui";
import { NoTeams } from "./Overview";
import { LoadLine } from "../Load";
import { POS, POSNAME, STATUS } from "@/lib/constants";
import type { Status } from "@/lib/types";

export function Squad() {
  // Players and parents don't use this page; send them home.
  const family = useFamilyRedirect();
  return family ? null : <SquadPage />;
}

function SquadPage() {
  const { data, team, squad, playerRate, can, canDo, isAdmin, open } = useApp();
  const [filter, setFilter] = useState<"all" | Status>("all");
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const canEdit = canDo("squad.edit", team.id);
  const seeAtt = can("attendance.view");
  const teamName = (id: string) => data.teams.find((t) => t.id === id)?.name ?? "another team";
  const all = squad();
  const cnt: Record<string, number> = { all: all.length, available: 0, injured: 0, unavailable: 0 };
  all.forEach((p) => cnt[p.status]++);
  const sq = all.filter((p) => filter === "all" || p.status === filter);

  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">
            {team.name}
            {team.age_group ? ` · ${team.age_group}` : ""}
          </div>
          <h1>Squad</h1>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => open({ kind: "player", id: null })}>
            <Icon id="i-plus" />
            Add player
          </button>
        )}
      </div>
      <div className="toolbar">
        <div className="chips">
          {(["all", "available", "injured", "unavailable"] as const).map((k) => (
            <button key={k} className="chip" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {k === "all" ? "All players" : STATUS[k]}
              <span className="n">{cnt[k]}</span>
            </button>
          ))}
        </div>
      </div>
      {sq.length ? (
        POS.map((pos) => {
          const g = sq.filter((p) => p.position === pos);
          if (!g.length) return null;
          return (
            <section key={pos} className="pgroup" data-pos={pos}>
              <h2>
                {POSNAME[pos]} <small>{g.length}</small>
              </h2>
              <div className="pgrid">
                {g.map((p) => {
                  const r = playerRate(p);
                  return (
                    <button key={p.id} className={`card pcard s-${p.status}${p.status !== "available" ? " out" : ""}`} onClick={() => open({ kind: "player", id: p.id })}>
                      <Shirt p={p} />
                      <span style={{ minWidth: 0, display: "grid", gap: 3 }}>
                        <span className="nm">{p.full_name}</span>
                        <span className="ln">
                          <span className="pos" data-pos={p.position}>
                            {p.position}
                          </span>
                          <span className={`status s-${p.status}`}>{STATUS[p.status]}</span>
                        </span>
                        {p.team_id !== team.id ? (
                          <span className="team-tag">From {teamName(p.team_id)}</span>
                        ) : p.team_ids.length > 1 ? (
                          <span className="team-tag">Also {p.team_ids.slice(1).map(teamName).join(", ")}</span>
                        ) : null}
                      </span>
                      {p.status_note && <span className="note">{p.status_note}</span>}
                      <LoadLine playerId={p.id} />
                      {(seeAtt || data.me.player_ids.includes(p.id)) && (
                      <span className="att">
                        Attendance
                        <span className="bar">
                          <i style={{ width: `${r ?? 0}%` }} />
                        </span>
                        <b>{r === null ? "–" : r + "%"}</b>
                      </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      ) : (
        <div className="empty">{all.length ? "No players match this filter." : canEdit ? "No players yet. Add your first player." : "No players in this team yet."}</div>
      )}
    </>
  );
}
