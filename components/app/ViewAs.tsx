"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApp, type ViewAs } from "./AppProvider";
import { Modal } from "./fitness/Fitness";

const ROLE_WORD: Record<ViewAs["role"], string> = { parent: "Parent", player: "Player", coach: "Coach", assistant: "Assistant coach" };

/** Choose who to see the app as: a role, then a player (families) or a team (coaches). */
export function ViewAsPicker({ onClose }: { onClose: () => void }) {
  const { data, team, setViewAs, viewAs } = useApp();
  const router = useRouter();
  const [role, setRole] = useState<ViewAs["role"]>(viewAs?.role ?? "parent");
  const players = [...data.players].sort((a, b) => a.full_name.localeCompare(b.full_name));
  const [playerId, setPlayerId] = useState(viewAs?.playerId ?? players.find((p) => p.team_id === team?.id)?.id ?? players[0]?.id ?? "");
  const [teamId, setTeamId] = useState(viewAs?.teamId ?? team?.id ?? data.teams[0]?.id ?? "");
  const family = role === "parent" || role === "player";
  function go() {
    setViewAs(family ? { role, playerId } : { role, teamId });
    onClose();
    router.push("/home");
  }
  return (
    <Modal
      title="See the app as…"
      onClose={onClose}
      foot={
        <>
          <span className="spacer" />
          <button className="btn primary" disabled={family ? !playerId : !teamId} onClick={go}>
            Show me
          </button>
        </>
      }
    >
      <div className="va-form">
        <p className="muted" style={{ margin: 0 }}>
          See exactly which screens and buttons each person gets. It&apos;s a preview: you&apos;re still signed in as yourself, so anything you change is saved as you.
        </p>
        <div className="va-roles" role="radiogroup" aria-label="Role">
          {(Object.keys(ROLE_WORD) as ViewAs["role"][]).map((r) => (
            <button key={r} type="button" role="radio" aria-checked={role === r} className={role === r ? "on" : ""} onClick={() => setRole(r)}>
              <b>{ROLE_WORD[r]}</b>
              <small>{r === "parent" ? "Replies, schedule, their child" : r === "player" ? "Their own schedule and progress" : r === "coach" ? "Runs a team" : "Helps run a team"}</small>
            </button>
          ))}
        </div>
        {family ? (
          <label className="field">
            <span>{role === "parent" ? "Parent of" : "Player"}</span>
            <select className="input" value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              {players.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name} · {data.teams.find((t) => t.id === p.team_id)?.name ?? ""}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>Team</span>
            <select className="input" value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
    </Modal>
  );
}

/** Shown across the top while previewing. */
export function ViewAsBanner() {
  const { viewAs, setViewAs, data } = useApp();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  if (!viewAs) return null;
  const p = viewAs.playerId ? data.players.find((x) => x.id === viewAs.playerId) : undefined;
  const t = viewAs.teamId ? data.teams.find((x) => x.id === viewAs.teamId) : undefined;
  const who = viewAs.role === "parent" ? `a parent of ${p?.full_name ?? "a player"}` : viewAs.role === "player" ? (p?.full_name ?? "a player") : `${viewAs.role === "coach" ? "a coach" : "an assistant coach"} of ${t?.name ?? "a team"}`;
  return (
    <div className="va-banner" role="status">
      <span>
        <b>Previewing</b> as {who}
      </span>
      <button type="button" onClick={() => setPicking(true)}>
        Change
      </button>
      <button
        type="button"
        className="va-exit"
        onClick={() => {
          setViewAs(null);
          router.push("/home");
        }}
      >
        Exit preview
      </button>
      {picking && <ViewAsPicker onClose={() => setPicking(false)} />}
    </div>
  );
}
