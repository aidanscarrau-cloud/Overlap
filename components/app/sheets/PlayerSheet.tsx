"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, ReadOnlyNote, SheetFrame } from "./SheetFrame";
import { Shirt } from "@/components/ui";
import { POS, STATUS } from "@/lib/constants";
import { errMsg } from "@/lib/format";
import type { Position, Status } from "@/lib/types";

export function PlayerSheet({ id }: { id: string | null }) {
  const { data, team, squad, canEdit, playerRate, supabase, refresh, close, toast } = useApp();
  const p = id ? data.players.find((x) => x.id === id) : null;
  const [d, setD] = useState(() =>
    p
      ? { full_name: p.full_name, shirt_number: p.shirt_number ?? "", position: p.position, status: p.status, status_note: p.status_note, team_id: p.team_id }
      : { full_name: "", shirt_number: Math.max(0, ...squad().map((x) => x.shirt_number ?? 0)) + 1, position: "MID" as Position, status: "available" as Status, status_note: "", team_id: team?.id ?? "" },
  );
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  const r = p ? playerRate(p) : null;
  const linked = p ? data.members.filter((m) => m.player_id === p.id) : [];

  if (id && !p) return <SheetFrame title="Player not found">This player has been removed.</SheetFrame>;

  if (!canEdit && p) {
    return (
      <SheetFrame title={p.full_name}>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <Shirt p={p} />
          <div>
            <span className="pos" data-pos={p.position}>
              {p.position}
            </span>{" "}
            <span className={`status s-${p.status}`}>{STATUS[p.status]}</span>
            {p.status_note && <div className="muted" style={{ fontSize: 13.5, marginTop: 4 }}>{p.status_note}</div>}
          </div>
        </div>
        {r !== null && <AttendanceCard r={r} />}
        <ReadOnlyNote>Only coaches and club admins can edit player details.</ReadOnlyNote>
      </SheetFrame>
    );
  }

  async function save() {
    if (!d.full_name.trim()) return setErr("Enter the player's name.");
    const num = d.shirt_number === "" ? null : Number(d.shirt_number);
    if (num !== null && (num < 1 || num > 99)) return setErr("Shirt numbers go from 1 to 99.");
    setBusy(true);
    const row = { full_name: d.full_name.trim(), shirt_number: num, position: d.position, status: d.status, status_note: d.status === "available" ? "" : d.status_note.trim(), team_id: d.team_id };
    const { error } = p ? await supabase.from("players").update(row).eq("id", p.id) : await supabase.from("players").insert(row);
    if (error) {
      setBusy(false);
      return setErr(errMsg(error));
    }
    toast(p ? "Player saved" : "Player added");
    close();
    refresh();
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("players").delete().eq("id", p!.id);
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    toast("Player removed");
    close();
    refresh();
  }

  return (
    <SheetFrame
      title={p ? p.full_name : "Add player"}
      foot={
        <>
          {p ? <ConfirmButton label="Remove player" onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save player"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Full name</span>
        <input className="input" id="p-name" autoFocus maxLength={80} value={d.full_name} onChange={(e) => set({ full_name: e.target.value })} placeholder="e.g. Sam Taylor" />
      </label>
      <div className="row2">
        <label className="field">
          <span>Shirt number</span>
          <input className="input" type="number" min={1} max={99} id="p-num" value={d.shirt_number} onChange={(e) => set({ shirt_number: e.target.value === "" ? "" : +e.target.value })} />
        </label>
        <label className="field">
          <span>Position</span>
          <select className="input" id="p-pos" value={d.position} onChange={(e) => set({ position: e.target.value as Position })}>
            {POS.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Team</span>
          <select className="input" id="p-team" value={d.team_id} onChange={(e) => set({ team_id: e.target.value })}>
            {data.teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="row2">
        <label className="field">
          <span>Status</span>
          <select className="input" id="p-status" value={d.status} onChange={(e) => set({ status: e.target.value as Status })}>
            {(Object.keys(STATUS) as Status[]).map((k) => (
              <option key={k} value={k}>
                {STATUS[k]}
              </option>
            ))}
          </select>
        </label>
        {d.status !== "available" && (
          <label className="field" style={{ gridColumn: "span 2" }}>
            <span>Status note</span>
            <input className="input" id="p-note" maxLength={120} value={d.status_note} onChange={(e) => set({ status_note: e.target.value })} placeholder="e.g. Ankle sprain, 1 wk" />
          </label>
        )}
      </div>
      {r !== null && <AttendanceCard r={r} />}
      {p && (
        <div className="muted" style={{ fontSize: 13.5 }}>
          {linked.length
            ? `Linked accounts: ${linked.map((m) => `${m.full_name} (${m.role})`).join(", ")}. They can update this player's availability.`
            : "No player or parent account is linked yet. Create a player or parent invite for this player on the Club & members page."}
        </div>
      )}
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </SheetFrame>
  );
}

function AttendanceCard({ r }: { r: number }) {
  return (
    <div className="card stat">
      <span className="eyebrow">Training attendance</span>
      <div className="v tnum">
        {r}
        <small>%</small>
      </div>
      <div className="bar" style={{ flex: "none" }}>
        <i style={{ width: `${r}%` }} />
      </div>
      <span className="sub">of completed sessions for this team</span>
    </div>
  );
}
