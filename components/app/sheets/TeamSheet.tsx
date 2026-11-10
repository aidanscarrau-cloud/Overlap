"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, SheetFrame } from "./SheetFrame";
import { errMsg } from "@/lib/format";
import { LogoPicker } from "../LogoPicker";
import { removeLogoFile, uploadLogo } from "@/lib/logo";

export function TeamSheet({ id }: { id: string | null }) {
  const { data, isAdmin, supabase, refresh, close, toast, setTeam } = useApp();
  const t = id ? data.teams.find((x) => x.id === id) : null;
  const [d, setD] = useState({ name: t?.name ?? "", age_group: t?.age_group ?? "", coach_name: t?.coach_name ?? "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (!isAdmin) return <SheetFrame title="Teams">Only club admins can manage teams.</SheetFrame>;
  const nPlayers = t ? data.players.filter((p) => p.team_id === t.id).length : 0;
  const nSessions = t ? data.sessions.filter((s) => s.team_id === t.id).length : 0;

  async function save() {
    if (!d.name.trim()) return setErr("Enter a team name.");
    setBusy(true);
    const row = { name: d.name.trim(), age_group: d.age_group.trim(), coach_name: d.coach_name.trim() };
    const res = t ? await supabase.from("teams").update(row).eq("id", t.id).select("id").single() : await supabase.from("teams").insert({ ...row, club_id: data.club.id }).select("id").single();
    if (res.error) {
      setBusy(false);
      return setErr(errMsg(res.error));
    }
    if (!t) setTeam(res.data.id as string);
    toast(t ? "Team saved" : "Team added");
    close();
    refresh();
  }
  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("teams").delete().eq("id", t!.id);
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    toast("Team deleted");
    close();
    refresh();
  }

  return (
    <SheetFrame
      title={t ? "Edit team" : "Add team"}
      foot={
        <>
          {t ? <ConfirmButton label="Delete team" onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : t ? "Save team" : "Add team"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Team name</span>
        <input className="input" id="t-name" autoFocus maxLength={60} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} placeholder="e.g. U14 Girls" />
      </label>
      <div className="row2">
        <label className="field">
          <span>Age group</span>
          <input className="input" id="t-age" maxLength={40} value={d.age_group} onChange={(e) => setD({ ...d, age_group: e.target.value })} placeholder="e.g. Under 14" />
        </label>
        <label className="field">
          <span>Head coach</span>
          <input className="input" id="t-coach" maxLength={80} value={d.coach_name} onChange={(e) => setD({ ...d, coach_name: e.target.value })} />
        </label>
      </div>
      {t ? (
        <LogoPicker
          url={t.logo_url}
          label="Team badge (optional)"
          help="Leave empty to use the club logo. PNG, JPG or WebP. You can also drag an image here."
          onPick={async (file) => {
            const url = await uploadLogo(supabase, data.club.id, `team-${t.id}`, file);
            const { error } = await supabase.from("teams").update({ logo_url: url }).eq("id", t.id);
            if (error) throw error;
            await removeLogoFile(supabase, t.logo_url);
            toast("Team badge updated");
            refresh();
          }}
          onRemove={async () => {
            const { error } = await supabase.from("teams").update({ logo_url: null }).eq("id", t.id);
            if (error) throw error;
            await removeLogoFile(supabase, t.logo_url);
            toast("Team badge removed");
            refresh();
          }}
        />
      ) : (
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          New teams use the club logo. You can add a team badge after saving.
        </p>
      )}
      {t && (nPlayers > 0 || nSessions > 0) && (
        <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
          Deleting this team also deletes its {nPlayers} players and {nSessions} sessions.
        </p>
      )}
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </SheetFrame>
  );
}
