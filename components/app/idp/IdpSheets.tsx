"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, SheetFrame } from "../sheets/SheetFrame";
import { AREAS, areaLabel, overall, type Area, type GoalStatus, type Ratings } from "@/lib/idp";
import { errMsg, todayIso } from "@/lib/format";

export function EvaluationSheet({ playerId, id }: { playerId: string; id: string | null }) {
  const { data, canDo, evaluationsOf, supabase, refresh, close, toast } = useApp();
  const player = data.players.find((p) => p.id === playerId);
  const existing = id ? data.evaluations.find((e) => e.id === id) : null;
  const last = evaluationsOf(playerId)[0];
  const canEdit = !!player && player.team_ids.some((t) => canDo("idp.edit", t));
  const [d, setD] = useState(() => ({
    evaluated_on: existing?.evaluated_on ?? todayIso(),
    // New evaluations start from the last one so coaches only adjust what changed.
    ratings: { ...(existing?.ratings ?? last?.ratings ?? { technical: 5, tactical: 5, physical: 5, psychological: 5, social: 5 }) } as Ratings,
    comments: { ...(existing?.comments ?? {}) } as Partial<Record<Area, string>>,
    strengths: existing?.strengths ?? last?.strengths ?? "",
    improvements: existing?.improvements ?? last?.improvements ?? "",
    summary: existing?.summary ?? "",
    shared: existing?.shared ?? true,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!player) return <SheetFrame title="Player not found">This player has been removed.</SheetFrame>;
  if (id && !existing) return <SheetFrame title="Evaluation not found">This evaluation has been deleted.</SheetFrame>;
  if (!canEdit) return <SheetFrame title="Evaluation">You can view evaluations but not write them.</SheetFrame>;

  async function save() {
    setErr("");
    setBusy(true);
    const comments = Object.fromEntries(Object.entries(d.comments).filter(([, v]) => v && v.trim()).map(([k, v]) => [k, v!.trim()]));
    const row = { ...d, comments, strengths: d.strengths.trim(), improvements: d.improvements.trim(), summary: d.summary.trim(), player_id: playerId };
    const { error } = existing ? await supabase.from("player_evaluations").update(row).eq("id", existing.id) : await supabase.from("player_evaluations").insert(row);
    setBusy(false);
    if (error) return setErr(errMsg(error));
    toast(existing ? "Evaluation saved" : d.shared ? "Evaluation saved and shared" : "Evaluation saved as private");
    close();
    refresh();
  }
  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("player_evaluations").delete().eq("id", existing!.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Evaluation deleted");
    close();
    refresh();
  }

  const ov = overall(d.ratings);
  return (
    <SheetFrame
      title={`${existing ? "Edit" : "New"} evaluation · ${player.full_name}`}
      foot={
        <>
          {existing ? <ConfirmButton label="Delete" onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save evaluation"}
          </button>
        </>
      }
    >
      <div className="row2">
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" id="ev-date" value={d.evaluated_on} onChange={(e) => setD({ ...d, evaluated_on: e.target.value })} />
        </label>
        <div className="field">
          <span>Overall</span>
          <div className="ov-big tnum">{ov ?? "–"}</div>
        </div>
      </div>
      <div className="eval-areas">
        {AREAS.map((a) => {
          const v = d.ratings[a.key] ?? 5;
          const prev = last && last.id !== existing?.id ? last.ratings[a.key] : undefined;
          return (
            <div key={a.key} className="eval-area">
              <div className="eval-top">
                <label htmlFor={`r-${a.key}`}>
                  <b>{a.label}</b>
                  <span className="muted">{a.help}</span>
                </label>
                <span className="eval-score tnum">
                  {v}
                  {typeof prev === "number" && prev !== v && <small className={v > prev ? "up" : "down"}>{v > prev ? `▲${v - prev}` : `▼${prev - v}`}</small>}
                </span>
              </div>
              <input
                id={`r-${a.key}`}
                className="slider"
                type="range"
                min={1}
                max={10}
                step={1}
                value={v}
                onChange={(e) => setD({ ...d, ratings: { ...d.ratings, [a.key]: +e.target.value } })}
                aria-valuetext={`${a.label} ${v} out of 10`}
              />
              <input
                className="input"
                maxLength={300}
                placeholder={`${a.label} comment (optional)`}
                aria-label={`${a.label} comment`}
                value={d.comments[a.key] ?? ""}
                onChange={(e) => setD({ ...d, comments: { ...d.comments, [a.key]: e.target.value } })}
              />
            </div>
          );
        })}
      </div>
      <label className="field">
        <span>Where they are now (strengths)</span>
        <textarea className="input" id="ev-strengths" rows={3} maxLength={2000} value={d.strengths} onChange={(e) => setD({ ...d, strengths: e.target.value })} placeholder="e.g. Good first touch, accurate short passing, strong finishing inside the box" />
      </label>
      <label className="field">
        <span>What they&apos;re working on</span>
        <textarea className="input" id="ev-improve" rows={3} maxLength={2000} value={d.improvements} onChange={(e) => setD({ ...d, improvements: e.target.value })} placeholder="e.g. Weak foot passing, long-range passing, 1v1 dribbling under pressure" />
      </label>
      <label className="field">
        <span>Summary for the player (optional)</span>
        <textarea className="input" id="ev-summary" rows={3} maxLength={3000} value={d.summary} onChange={(e) => setD({ ...d, summary: e.target.value })} />
      </label>
      <label className="check">
        <input type="checkbox" checked={d.shared} onChange={(e) => setD({ ...d, shared: e.target.checked })} />
        <span>
          <b>Share with the player and their parents.</b> Untick to keep it as a private coach note.
        </span>
      </label>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </SheetFrame>
  );
}

export function GoalSheet({ playerId, id }: { playerId: string; id: string | null }) {
  const { data, canDo, supabase, refresh, close, toast } = useApp();
  const player = data.players.find((p) => p.id === playerId);
  const existing = id ? data.goals.find((g) => g.id === id) : null;
  const canEdit = !!player && player.team_ids.some((t) => canDo("idp.edit", t));
  const [d, setD] = useState(() => ({
    area: (existing?.area ?? "technical") as Area,
    title: existing?.title ?? "",
    detail: existing?.detail ?? "",
    target_date: existing?.target_date ?? "",
    status: (existing?.status ?? "active") as GoalStatus,
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  if (!player) return <SheetFrame title="Player not found">This player has been removed.</SheetFrame>;
  if (!canEdit) return <SheetFrame title="Goal">You can view goals but not change them.</SheetFrame>;

  async function save() {
    if (!d.title.trim()) return setErr("Give the goal a short title.");
    setErr("");
    setBusy(true);
    const row = { player_id: playerId, area: d.area, title: d.title.trim(), detail: d.detail.trim(), target_date: d.target_date || null, status: d.status };
    const { error } = existing ? await supabase.from("player_goals").update(row).eq("id", existing.id) : await supabase.from("player_goals").insert(row);
    setBusy(false);
    if (error) return setErr(errMsg(error));
    toast(existing ? "Goal saved" : "Goal added");
    close();
    refresh();
  }
  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("player_goals").delete().eq("id", existing!.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Goal deleted");
    close();
    refresh();
  }

  return (
    <SheetFrame
      title={`${existing ? "Edit" : "New"} goal · ${player.full_name}`}
      foot={
        <>
          {existing ? <ConfirmButton label="Delete goal" onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : existing ? "Save goal" : "Add goal"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Goal</span>
        <input className="input" id="goal-title" autoFocus maxLength={140} value={d.title} onChange={(e) => setD({ ...d, title: e.target.value })} placeholder="e.g. Use my weaker foot to pass in every game" />
      </label>
      <div className="row2">
        <label className="field">
          <span>Area</span>
          <select className="input" id="goal-area" value={d.area} onChange={(e) => setD({ ...d, area: e.target.value as Area })}>
            {AREAS.map((a) => (
              <option key={a.key} value={a.key}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Target date (optional)</span>
          <input className="input" type="date" id="goal-date" value={d.target_date} onChange={(e) => setD({ ...d, target_date: e.target.value })} />
        </label>
        {existing && (
          <label className="field">
            <span>Status</span>
            <select className="input" id="goal-status" value={d.status} onChange={(e) => setD({ ...d, status: e.target.value as GoalStatus })}>
              <option value="active">Working on it</option>
              <option value="achieved">Achieved</option>
              <option value="dropped">Dropped</option>
            </select>
          </label>
        )}
      </div>
      <label className="field">
        <span>How we&apos;ll know it&apos;s done (optional)</span>
        <textarea className="input" id="goal-detail" rows={4} maxLength={2000} value={d.detail} onChange={(e) => setD({ ...d, detail: e.target.value })} placeholder="e.g. Five successful weak-foot passes per game, three games in a row" />
      </label>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        Goals are always visible to the player and their parents. Area: {areaLabel(d.area)}.
      </p>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </SheetFrame>
  );
}
