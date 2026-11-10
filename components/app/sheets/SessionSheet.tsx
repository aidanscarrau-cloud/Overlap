"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, ReadOnlyNote, SheetFrame } from "./SheetFrame";
import { Diagram, Icon, Shirt, Timeline, totalMins } from "@/components/ui";
import { filterDrills } from "../views/Drills";
import { CATS, STATUS } from "@/lib/constants";
import { addMins, errMsg, fmtLongDay, fmtLongMon, fmtNum, hhmm, todayIso } from "@/lib/format";
import type { Category, PlanItem } from "@/lib/types";

type Draft = { id: string | null; team_id: string; date: string; start_time: string; location: string; title: string; focus: string; notes: string; plan: PlanItem[] };

export function SessionSheet({ id }: { id: string | null }) {
  const { data, team, drillMap, squad, attendedSet, canEdit, supabase, refresh, close, toast } = useApp();
  const existing = id ? data.sessions.find((s) => s.id === id) : null;
  const [d, setD] = useState<Draft>(() =>
    existing
      ? { id: existing.id, team_id: existing.team_id, date: existing.date, start_time: hhmm(existing.start_time), location: existing.location, title: existing.title, focus: existing.focus, notes: existing.notes, plan: existing.plan.map((x) => ({ ...x })) }
      : { id: null, team_id: team?.id ?? "", date: todayIso(), start_time: "18:00", location: "Main Pitch", title: "", focus: "", notes: "", plan: [] },
  );
  const [att, setAtt] = useState<Set<string>>(() => new Set(id ? attendedSet(id) : []));
  const [tab, setTab] = useState<"plan" | "attendance" | "notes">("plan");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const players = squad(d.team_id);

  if (id && !existing) return <SheetFrame title="Session not found">This session has been deleted.</SheetFrame>;

  async function save() {
    if (!d.team_id) return toast("Add a team before planning sessions.");
    setBusy(true);
    try {
      const row = { team_id: d.team_id, date: d.date, start_time: d.start_time, location: d.location.trim(), title: d.title.trim() || "Training session", focus: d.focus.trim(), notes: d.notes, plan: d.plan };
      let sid = d.id;
      if (sid) {
        const { error } = await supabase.from("sessions").update(row).eq("id", sid);
        if (error) throw error;
      } else {
        const { data: ins, error } = await supabase.from("sessions").insert(row).select("id").single();
        if (error) throw error;
        sid = ins.id as string;
      }
      const before = d.id ? attendedSet(d.id) : new Set<string>();
      const add = [...att].filter((p) => !before.has(p)).map((player_id) => ({ session_id: sid, player_id }));
      const remove = [...before].filter((p) => !att.has(p));
      if (add.length) {
        const { error } = await supabase.from("attendance").insert(add);
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await supabase.from("attendance").delete().eq("session_id", sid).in("player_id", remove);
        if (error) throw error;
      }
      toast(d.id ? "Session saved" : "Session created");
      close();
      refresh();
    } catch (e) {
      toast(errMsg(e));
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    const { error } = await supabase.from("sessions").delete().eq("id", d.id!);
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    toast("Session deleted");
    close();
    refresh();
  }

  if (!canEdit && existing) return <SessionReadOnly id={existing.id} />;

  let clock = d.start_time;
  const used = [...new Set(d.plan.map((x) => drillMap.get(x.drill_id)?.category).filter(Boolean))] as Category[];

  return (
    <SheetFrame
      title={d.id ? "Session plan" : "New session"}
      foot={
        <>
          {d.id ? <ConfirmButton label="Delete" onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : "Save session"}
          </button>
        </>
      }
    >
      <input className="title-input" id="s-title" placeholder="Session title" value={d.title} onChange={(e) => set({ title: e.target.value })} aria-label="Session title" maxLength={100} />
      <div className="row2">
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" id="s-date" value={d.date} onChange={(e) => set({ date: e.target.value })} required />
        </label>
        <label className="field">
          <span>Start</span>
          <input className="input" type="time" id="s-time" value={d.start_time} onChange={(e) => set({ start_time: e.target.value || "18:00" })} />
        </label>
        <label className="field">
          <span>Location</span>
          <input className="input" id="s-loc" value={d.location} maxLength={80} onChange={(e) => set({ location: e.target.value })} />
        </label>
        <label className="field">
          <span>Focus</span>
          <input className="input" id="s-focus" value={d.focus} maxLength={60} onChange={(e) => set({ focus: e.target.value })} placeholder="e.g. Build-up" />
        </label>
        {!d.id && data.teams.length > 1 && (
          <label className="field">
            <span>Team</span>
            <select className="input" id="s-team" value={d.team_id} onChange={(e) => (set({ team_id: e.target.value }), setAtt(new Set()))}>
              {data.teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="subtabs" role="tablist">
        {(
          [
            ["plan", "Plan"],
            ["attendance", "Attendance"],
            ["notes", "Notes"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "plan" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="card card-b" style={{ paddingTop: 16 }}>
            <div className="plan-sum">
              <span className="eyebrow">Total time</span>
              <span className="muted">
                <b style={{ color: "var(--ink)" }}>{totalMins(d)}</b> min · finishes {addMins(d.start_time, totalMins(d))}
              </span>
            </div>
            <div style={{ marginTop: 10 }}>
              <Timeline s={d} drills={drillMap} lg />
            </div>
            {used.length > 0 && (
              <div className="legend">
                {used.map((c) => (
                  <span key={c} className="cat" data-cat={c}>
                    {CATS[c]} {d.plan.filter((x) => drillMap.get(x.drill_id)?.category === c).reduce((n, x) => n + (+x.mins || 0), 0)}′
                  </span>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: "grid", gap: 8 }}>
            {d.plan.length ? (
              d.plan.map((x, i) => {
                const dr = drillMap.get(x.drill_id);
                const st = clock;
                clock = addMins(clock, +x.mins || 0);
                if (!dr) return null;
                const move = (dir: number) => {
                  const p = [...d.plan];
                  [p[i], p[i + dir]] = [p[i + dir], p[i]];
                  set({ plan: p });
                };
                return (
                  <div key={i} className="prow-drill" data-cat={dr.category}>
                    <span className="idx">{i + 1}</span>
                    <span className="nm">
                      <b>{dr.name}</b>
                      <span className="clock">
                        {st}–{clock} · {CATS[dr.category]}
                      </span>
                    </span>
                    <label className="mins">
                      <input
                        className="input"
                        type="number"
                        min={1}
                        max={180}
                        id={`m-${i}`}
                        value={x.mins}
                        aria-label={`Minutes for ${dr.name}`}
                        onChange={(e) => {
                          const p = [...d.plan];
                          p[i] = { ...p[i], mins: Math.min(180, Math.max(1, +e.target.value || 1)) };
                          set({ plan: p });
                        }}
                      />
                      <small>min</small>
                    </label>
                    <span className="acts">
                      <button className="icon-btn" aria-label="Move up" disabled={i === 0} onClick={() => move(-1)}>
                        ↑
                      </button>
                      <button className="icon-btn" aria-label="Move down" disabled={i === d.plan.length - 1} onClick={() => move(1)}>
                        ↓
                      </button>
                      <button className="icon-btn" aria-label="Remove" onClick={() => set({ plan: d.plan.filter((_, j) => j !== i) })}>
                        ✕
                      </button>
                    </span>
                  </div>
                );
              })
            ) : (
              <div className="empty">No drills yet. Add some from the library below.</div>
            )}
          </div>
          <DrillPicker
            onAdd={(id) => {
              const dr = drillMap.get(id)!;
              set({ plan: [...d.plan, { drill_id: id, mins: dr.minutes }] });
              toast(`Added ${dr.name}`);
            }}
          />
        </div>
      )}

      {tab === "attendance" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="toolbar" style={{ justifyContent: "space-between", margin: 0 }}>
            <span className="muted">
              <b style={{ color: "var(--ink)" }}>{att.size}</b> of {players.length} marked present
            </span>
            <span className="chips">
              <button className="btn sm" onClick={() => setAtt(new Set(players.filter((p) => p.status === "available").map((p) => p.id)))}>
                Mark available present
              </button>
              <button className="btn sm" onClick={() => setAtt(new Set())}>
                Clear
              </button>
            </span>
          </div>
          <div className="att-list">
            {players.map((p) => (
              <label key={p.id} className={`att-item${p.status !== "available" ? " out" : ""}`}>
                <input
                  type="checkbox"
                  checked={att.has(p.id)}
                  onChange={(e) => {
                    const n = new Set(att);
                    if (e.target.checked) n.add(p.id);
                    else n.delete(p.id);
                    setAtt(n);
                  }}
                />
                <Shirt p={p} small />
                <span style={{ minWidth: 0 }}>
                  <b style={{ display: "block", fontSize: 14 }}>{p.full_name}</b>
                  <span className={`status s-${p.status}`} style={{ fontSize: 12 }}>
                    {STATUS[p.status]}
                  </span>
                </span>
              </label>
            ))}
            {!players.length && <div className="empty">No players in this team yet.</div>}
          </div>
        </div>
      )}

      {tab === "notes" && (
        <label className="field">
          <span>Session notes (players and parents can read these)</span>
          <textarea className="input" id="s-notes" rows={8} maxLength={5000} value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Objectives, equipment, player feedback…" />
        </label>
      )}
    </SheetFrame>
  );
}

function DrillPicker({ onAdd }: { onAdd: (id: string) => void }) {
  const { data } = useApp();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<"all" | Category>("all");
  const ds = filterDrills(data.drills, cat, q);
  return (
    <div className="picker">
      <div className="eyebrow">Add from drill library</div>
      <label className="search" style={{ flex: "none", maxWidth: "none" }}>
        <Icon id="i-search" />
        <input className="input" type="search" id="pick-q" placeholder="Search drills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search drill library" />
      </label>
      <div className="chips">
        {(["all", ...Object.keys(CATS)] as ("all" | Category)[]).map((c) => (
          <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
            {c === "all" ? "All" : CATS[c]}
          </button>
        ))}
      </div>
      <div className="pick-list">
        {ds.length ? (
          ds.map((d) => (
            <div key={d.id} className="pick-item">
              <Diagram d={d.diagram} label={d.name} />
              <span style={{ minWidth: 0 }}>
                <b style={{ display: "block" }}>{d.name}</b>
                <span className="cat" data-cat={d.category}>
                  {CATS[d.category]} · {d.minutes} min
                </span>
              </span>
              <button className="btn sm" onClick={() => onAdd(d.id)}>
                <Icon id="i-plus" />
                Add
              </button>
            </div>
          ))
        ) : (
          <div className="muted">{data.drills.length ? "No drills match." : "Your drill library is empty."}</div>
        )}
      </div>
    </div>
  );
}

function SessionReadOnly({ id }: { id: string }) {
  const { data, drillMap, open } = useApp();
  const s = data.sessions.find((x) => x.id === id)!;
  let clock = hhmm(s.start_time);
  return (
    <SheetFrame title="Session plan">
      <div>
        <div className="eyebrow">
          {fmtLongDay(s.date)} {fmtNum(s.date)} {fmtLongMon(s.date)} · {hhmm(s.start_time)}–{addMins(s.start_time, totalMins(s))}
          {s.location ? ` · ${s.location}` : ""}
        </div>
        <h2 className="title-input" style={{ border: "none", marginTop: 6 }}>
          {s.title}
        </h2>
        {s.focus && <p className="muted" style={{ margin: "6px 0 0" }}>Focus: {s.focus}</p>}
      </div>
      <Timeline s={s} drills={drillMap} lg />
      <div style={{ display: "grid", gap: 8 }}>
        {s.plan.map((x, i) => {
          const dr = drillMap.get(x.drill_id);
          const st = clock;
          clock = addMins(clock, +x.mins || 0);
          if (!dr) return null;
          return (
            <button key={i} className="prow-drill" data-cat={dr.category} style={{ gridTemplateColumns: "28px 1fr auto", textAlign: "left" }} onClick={() => open({ kind: "drill", id: dr.id })}>
              <span className="idx">{i + 1}</span>
              <span className="nm">
                <b>{dr.name}</b>
                <span className="clock">
                  {st}–{clock} · {CATS[dr.category]}
                </span>
              </span>
              <span className="muted">{x.mins} min</span>
            </button>
          );
        })}
        {!s.plan.length && <div className="empty">Your coach hasn't added drills to this session yet.</div>}
      </div>
      <ReadOnlyNote>Only coaches and club admins can change session plans.</ReadOnlyNote>
    </SheetFrame>
  );
}
