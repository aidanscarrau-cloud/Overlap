"use client";

import { useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, SheetFrame } from "./SheetFrame";
import { DrillDesigner } from "../DrillDesigner";
import { Diagram, Icon } from "@/components/ui";
import { CATS } from "@/lib/constants";
import { errMsg, fmtDay, fmtMon, fmtNum, todayIso } from "@/lib/format";
import type { Category, Diagram as DiagramT } from "@/lib/types";

export function DrillView({ id }: { id: string }) {
  const { data, team, drillMap, sessionsOf, can, canDo, supabase, refresh, close, open, toast } = useApp();
  const canEdit = can("drills.edit");
  const d = drillMap.get(id);
  const up = sessionsOf().filter((s) => s.date >= todayIso());
  const [target, setTarget] = useState(up[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  if (!d) return <SheetFrame title="Drill not found">This drill has been deleted.</SheetFrame>;

  async function addToSession() {
    const s = data.sessions.find((x) => x.id === target);
    if (!s) return;
    setBusy(true);
    const { error } = await supabase.from("sessions").update({ plan: [...s.plan, { drill_id: d!.id, mins: d!.minutes }] }).eq("id", s.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`Added to ${s.title}`);
    refresh();
  }
  async function duplicate() {
    setBusy(true);
    const { id: _id, ...rest } = d!;
    const { data: ins, error } = await supabase.from("drills").insert({ ...rest, name: `${d!.name} (copy)`.slice(0, 80) }).select("id").single();
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Drill duplicated");
    refresh();
    open({ kind: "drill-edit", id: ins.id as string });
  }
  async function remove() {
    setBusy(true);
    const affected = data.sessions.filter((s) => s.plan.some((x) => x.drill_id === d!.id));
    for (const s of affected) {
      const { error } = await supabase.from("sessions").update({ plan: s.plan.filter((x) => x.drill_id !== d!.id) }).eq("id", s.id);
      if (error) {
        setBusy(false);
        return toast(errMsg(error));
      }
    }
    const { error } = await supabase.from("drills").delete().eq("id", d!.id);
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    toast(affected.length ? `Drill deleted and removed from ${affected.length} session plans` : "Drill deleted");
    close();
    refresh();
  }

  return (
    <SheetFrame
      title={d.name}
      foot={
        canEdit ? (
          <>
            <ConfirmButton label="Delete drill" onConfirm={remove} disabled={busy} />
            <button className="btn" onClick={duplicate} disabled={busy}>
              Duplicate
            </button>
            <button className="btn primary" onClick={() => open({ kind: "drill-edit", id: d.id })}>
              Edit drill &amp; diagram
            </button>
          </>
        ) : undefined
      }
    >
      <div className="dia-lg">
        <Diagram d={d.diagram} label={d.name} />
      </div>
      <div className="keyrow">
        <span>
          <i style={{ background: "var(--team)" }} />
          Your team
        </span>
        <span>
          <i style={{ background: "var(--opp)" }} />
          Opponents
        </span>
        <span>
          <i style={{ background: "var(--neutral)" }} />
          Neutral / coach
        </span>
        <span>── pass</span>
        <span>- - run</span>
        <span>··· dribble</span>
      </div>
      <div className="dmeta">
        <span className="cat" data-cat={d.category}>
          {CATS[d.category]}
        </span>
        <span>
          <Icon id="i-clock" />
          {d.minutes} min
        </span>
        <span>
          <Icon id="i-people" />
          {d.player_count || "–"}
        </span>
        <span>
          <Icon id="i-area" />
          {d.area || "–"}
        </span>
      </div>
      {d.description && <p style={{ margin: 0, maxWidth: "65ch", whiteSpace: "pre-wrap" }}>{d.description}</p>}
      {d.points.length > 0 && (
        <div>
          <div className="eyebrow" style={{ marginBottom: 10 }}>
            Coaching points
          </div>
          <ol className="points">
            {d.points.map((p, i) => (
              <li key={i}>
                <span>{p}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {team && canDo("sessions.edit", team.id) && (
        <div className="card card-b" style={{ display: "grid", gap: 10, paddingTop: 16 }}>
          <span className="eyebrow">Add to a {team.name} session</span>
          {up.length ? (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <select className="input" id="add-to" style={{ flex: 1, minWidth: 180 }} value={target} onChange={(e) => setTarget(e.target.value)}>
                {up.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fmtDay(s.date)} {fmtNum(s.date)} {fmtMon(s.date)} · {s.title || "Untitled"}
                  </option>
                ))}
              </select>
              <button className="btn primary" onClick={addToSession} disabled={busy}>
                Add
              </button>
            </div>
          ) : (
            <span className="muted">No upcoming sessions for this team.</span>
          )}
        </div>
      )}
    </SheetFrame>
  );
}

export function DrillEdit({ id }: { id: string | null }) {
  const { data, drillMap, can, supabase, refresh, open, close, toast } = useApp();
  const canEdit = can("drills.edit");
  const ex = id ? drillMap.get(id) : null;
  const [d, setD] = useState({
    name: ex?.name ?? "",
    category: (ex?.category ?? "technical") as Category,
    minutes: ex?.minutes ?? 15,
    player_count: ex?.player_count ?? "",
    area: ex?.area ?? "",
    description: ex?.description ?? "",
    points: (ex?.points ?? []).join("\n"),
  });
  const diagram = useRef<DiagramT>(ex?.diagram ?? { items: [], arrows: [], full: false });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof d>) => setD((x) => ({ ...x, ...patch }));
  if (!canEdit) return <SheetFrame title="Drill library">Only coaches and club admins can edit drills.</SheetFrame>;

  async function save() {
    if (!d.name.trim()) return setErr("Give the drill a name.");
    setBusy(true);
    const row = {
      name: d.name.trim(),
      category: d.category,
      minutes: Math.min(180, Math.max(1, +d.minutes || 1)),
      player_count: d.player_count.trim(),
      area: d.area.trim(),
      description: d.description.trim(),
      points: d.points
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
      diagram: diagram.current,
    };
    const res = ex ? await supabase.from("drills").update(row).eq("id", ex.id).select("id").single() : await supabase.from("drills").insert({ ...row, club_id: data.club.id }).select("id").single();
    if (res.error) {
      setBusy(false);
      return setErr(errMsg(res.error));
    }
    toast(ex ? "Drill saved" : "Drill created");
    refresh();
    open({ kind: "drill", id: res.data.id as string });
  }

  return (
    <SheetFrame
      title={ex ? "Edit drill" : "New drill"}
      foot={
        <>
          <span className="spacer" />
          <button className="btn" onClick={() => (ex ? open({ kind: "drill", id: ex.id }) : close())}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save drill"}
          </button>
        </>
      }
    >
      <label className="field">
        <span>Drill name</span>
        <input className="input" id="d-name" maxLength={80} value={d.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Switch of play 6v6" />
      </label>
      <div className="field">
        <span>Pitch diagram</span>
        <DrillDesigner initial={diagram.current} onChange={(v) => (diagram.current = v)} startTool={ex ? "move" : "p"} />
      </div>
      <div className="row2">
        <label className="field">
          <span>Category</span>
          <select className="input" id="d-cat" value={d.category} onChange={(e) => set({ category: e.target.value as Category })}>
            {(Object.keys(CATS) as Category[]).map((k) => (
              <option key={k} value={k}>
                {CATS[k]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Minutes</span>
          <input className="input" type="number" min={1} max={180} id="d-mins" value={d.minutes} onChange={(e) => set({ minutes: +e.target.value })} />
        </label>
        <label className="field">
          <span>Players</span>
          <input className="input" id="d-players" maxLength={30} value={d.player_count} onChange={(e) => set({ player_count: e.target.value })} placeholder="e.g. 8–12" />
        </label>
        <label className="field">
          <span>Area</span>
          <input className="input" id="d-area" maxLength={40} value={d.area} onChange={(e) => set({ area: e.target.value })} placeholder="e.g. 20 × 20 m" />
        </label>
      </div>
      <label className="field">
        <span>Description</span>
        <textarea className="input" id="d-desc" rows={4} maxLength={2000} value={d.description} onChange={(e) => set({ description: e.target.value })} />
      </label>
      <label className="field">
        <span>Coaching points (one per line)</span>
        <textarea className="input" id="d-points" rows={4} value={d.points} onChange={(e) => set({ points: e.target.value })} />
      </label>
      {err && (
        <p className="err" role="alert">
          {err}
        </p>
      )}
    </SheetFrame>
  );
}
