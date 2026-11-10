"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { ConfirmButton } from "./sheets/SheetFrame";
import { SAMPLE_TEAMS } from "@/lib/sample";
import { STARTER_DRILLS } from "@/lib/starter-drills";
import { errMsg } from "@/lib/format";

/** Lets a club admin delete the example teams (and optionally the starter drills) added when the club was created. */
export function SampleDataCard() {
  const { data, supabase, refresh, toast } = useApp();
  const [withDrills, setWithDrills] = useState(false);
  const [busy, setBusy] = useState(false);

  const teams = data.teams.filter((t) => SAMPLE_TEAMS.some((s) => s.name === t.name && s.coach_name === t.coach_name));
  const teamIds = new Set(teams.map((t) => t.id));
  const players = data.players.filter((p) => teamIds.has(p.team_id));
  const sessions = data.sessions.filter((s) => teamIds.has(s.team_id));
  const drillNames = new Set(STARTER_DRILLS.map((d) => d.name));
  const drills = data.drills.filter((d) => drillNames.has(d.name));
  const linkedMembers = data.members.filter((m) => m.player_id && players.some((p) => p.id === m.player_id));

  if (!teams.length && !drills.length) return null;

  async function run() {
    setBusy(true);
    try {
      if (teams.length) {
        const { error } = await supabase.from("teams").delete().in("id", [...teamIds]);
        if (error) throw error;
      }
      if (withDrills && drills.length) {
        const ids = new Set(drills.map((d) => d.id));
        // Take the drills out of any remaining session plans first, so no plan points at a deleted drill.
        for (const s of data.sessions.filter((s) => !teamIds.has(s.team_id) && s.plan.some((x) => ids.has(x.drill_id)))) {
          const { error } = await supabase.from("sessions").update({ plan: s.plan.filter((x) => !ids.has(x.drill_id)) }).eq("id", s.id);
          if (error) throw error;
        }
        const { error } = await supabase.from("drills").delete().in("id", [...ids]);
        if (error) throw error;
      }
      document.cookie = "overlap-team=; path=/; max-age=0";
      toast("Sample data removed");
      refresh();
    } catch (e) {
      toast(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card">
      <div className="card-h">
        <h2>Remove sample data</h2>
      </div>
      <div className="card-b" style={{ display: "grid", gap: 12 }}>
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          Clear out the example data added when your club was created, so you can start adding your real teams and players.
        </p>
        {teams.length > 0 ? (
          <div>
            <b>These teams will be deleted:</b>
            <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
              {teams.map((t) => (
                <li key={t.id}>
                  {t.name} ({data.players.filter((p) => p.team_id === t.id).length} players, {data.sessions.filter((s) => s.team_id === t.id).length} sessions)
                </li>
              ))}
            </ul>
            <p className="muted" style={{ margin: "6px 0 0", fontSize: 13 }}>
              Their players, sessions and attendance go too. Members of your club are not removed
              {linkedMembers.length ? `; ${linkedMembers.length} member${linkedMembers.length === 1 ? " is" : "s are"} linked to a sample player and will be unlinked` : ""}.
            </p>
          </div>
        ) : (
          <p style={{ margin: 0 }}>The sample teams have already been removed.</p>
        )}
        {drills.length > 0 && (
          <label className="check">
            <input type="checkbox" id="del-drills" checked={withDrills} onChange={(e) => setWithDrills(e.target.checked)} />
            <span>
              Also delete the {drills.length} starter drill{drills.length === 1 ? "" : "s"} (Rondo 5v2, Passing Square, 7v7 Small-Sided Game and others). Leave this unticked to keep them in your library.
            </span>
          </label>
        )}
        <div>
          <ConfirmButton
            className="btn danger"
            label={busy ? "Removing…" : "Remove sample data"}
            disabled={busy || (!teams.length && !withDrills)}
            onConfirm={run}
          />
        </div>
      </div>
    </section>
  );
}
