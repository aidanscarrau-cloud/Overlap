"use client";

import { pingPush } from "@/lib/push-client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, ReadOnlyNote, SheetFrame } from "./SheetFrame";
import { Diagram, Icon, Shirt, Timeline, totalMins } from "@/components/ui";
import { filterDrills } from "../views/Drills";
import { CATS, STATUS } from "@/lib/constants";
import { addMins, errMsg, fmtLongDay, fmtLongMon, fmtNum, hhmm, iso, parseD, todayIso } from "@/lib/format";
import type { Category, PlanItem } from "@/lib/types";
import { ReplyButtons, ReplyCounts } from "../Replies";

type Draft = { id: string | null; team_id: string; date: string; start_time: string; location: string; title: string; focus: string; notes: string; plan: PlanItem[] };

const addDays = (d: string, n: number) => {
  const x = parseD(d);
  x.setDate(x.getDate() + n);
  return iso(x);
};
const shortDate = (d: string) => parseD(d).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const dayName = (d: string) => parseD(d).toLocaleDateString("en-AU", { weekday: "long" });
type Repeat = "none" | "weekly" | "fortnightly";
/** The dates a repeating session falls on, from the first date up to and including `until`. */
export function seriesDates(first: string, repeat: Repeat, until: string) {
  if (repeat === "none" || !until || until < first) return [first];
  const out: string[] = [];
  for (let d = first; d <= until && out.length < 104; d = addDays(d, repeat === "weekly" ? 7 : 14)) out.push(d);
  return out;
}

export function SessionSheet({ id, date, copyFrom }: { id: string | null; date?: string; copyFrom?: string }) {
  const { data, team, drillMap, squad, attendedSet, repliesFor, can, canDo, supabase, refresh, close, toast, open } = useApp();
  const planTeams = data.teams.filter((t) => canDo("sessions.edit", t.id));
  const existing = id ? data.sessions.find((s) => s.id === id) : null;
  const source = existing ?? (copyFrom ? data.sessions.find((s) => s.id === copyFrom) : null);
  const [d, setD] = useState<Draft>(() =>
    source
      ? {
          id: existing ? existing.id : null,
          team_id: source.team_id,
          // A copy goes a week later unless a date was chosen.
          date: existing ? existing.date : (date ?? addDays(source.date < todayIso() ? todayIso() : source.date, 7)),
          start_time: hhmm(source.start_time),
          location: source.location,
          title: source.title,
          focus: source.focus,
          notes: existing ? existing.notes : "",
          plan: source.plan.map((x) => ({ ...x })),
        }
      : { id: null, team_id: (team && canDo("sessions.edit", team.id) ? team.id : planTeams[0]?.id) ?? "", date: date ?? todayIso(), start_time: "18:00", location: "Main Pitch", title: "", focus: "", notes: "", plan: [] },
  );
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [until, setUntil] = useState(() => addDays(d.date, 7 * 9));
  const series = existing?.series_id ? data.sessions.filter((s) => s.series_id === existing.series_id).sort((a, b) => a.date.localeCompare(b.date)) : [];
  const laterInSeries = existing ? series.filter((s) => s.date >= existing.date) : [];
  const [scope, setScope] = useState<"one" | "following">("one");
  const dates = !d.id ? seriesDates(d.date, repeat, until) : [d.date];
  const [att, setAtt] = useState<Set<string>>(() => new Set(id ? attendedSet(id) : []));
  const canPlan = canDo("sessions.edit", existing?.team_id ?? (team && canDo("sessions.edit", team.id) ? team.id : planTeams[0]?.id));
  const canAttend = canDo("attendance.edit", existing?.team_id ?? team?.id);
  const seeNotes = can("sessions.view_notes");
  const [tab, setTab] = useState<"plan" | "attendance" | "notes">(canPlan ? "plan" : "attendance");
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<Draft>) => setD((x) => ({ ...x, ...patch }));
  const players = squad(d.team_id);

  if (id && !existing) return <SheetFrame title="Session not found">This session has been deleted.</SheetFrame>;

  async function save() {
    if (!d.team_id) return toast("Add a team before planning sessions.");
    setBusy(true);
    try {
      const row: Record<string, unknown> = { team_id: d.team_id, date: d.date, start_time: d.start_time, location: d.location.trim(), title: d.title.trim() || "Training session", focus: d.focus.trim(), plan: d.plan };
      // Only write notes if this person can read them; otherwise they'd wipe notes they can't see.
      if (seeNotes) row.notes = d.notes;
      let sid = d.id;
      if (sid && !canPlan) {
        // Attendance only.
      } else if (sid && scope === "following" && laterInSeries.length > 1) {
        // This session's own date and notes, then the shared details for it and every later one.
        const own: Record<string, unknown> = { date: d.date };
        if (seeNotes) own.notes = d.notes;
        const { error: e1 } = await supabase.from("sessions").update(own).eq("id", sid);
        if (e1) throw e1;
        const { error } = await supabase.rpc("update_session_series", {
          p_session: sid,
          p_start: d.start_time,
          p_location: d.location.trim(),
          p_title: d.title.trim() || "Training session",
          p_focus: d.focus.trim(),
          p_plan: d.plan,
        });
        if (error) throw error;
      } else if (sid) {
        const { error } = await supabase.from("sessions").update(row).eq("id", sid);
        if (error) throw error;
      } else if (dates.length > 1) {
        const { error } = await supabase.rpc("create_session_series", {
          p_team: d.team_id,
          p_dates: dates,
          p_start: d.start_time,
          p_location: d.location.trim(),
          p_title: d.title.trim() || "Training session",
          p_focus: d.focus.trim(),
          p_plan: d.plan,
          p_notes: seeNotes ? d.notes : "",
        });
        if (error) throw error;
        pingPush();
        toast(`${dates.length} sessions created`);
        close();
        refresh();
        return;
      } else {
        const { data: ins, error } = await supabase.from("sessions").insert(row).select("id").single();
        if (error) throw error;
        sid = ins.id as string;
      }
      if (canPlan || !d.id) pingPush();
      const before = d.id ? attendedSet(d.id) : new Set<string>();
      const want = canAttend ? att : before; // without the switch, attendance is left as it was
      const add = [...want].filter((p) => !before.has(p)).map((player_id) => ({ session_id: sid, player_id }));
      const remove = [...before].filter((p) => !want.has(p));
      if (add.length) {
        const { error } = await supabase.from("attendance").insert(add);
        if (error) throw error;
      }
      if (remove.length) {
        const { error } = await supabase.from("attendance").delete().eq("session_id", sid).in("player_id", remove);
        if (error) throw error;
      }
      toast(d.id ? (scope === "following" && laterInSeries.length > 1 ? `${laterInSeries.length} sessions saved` : "Session saved") : "Session created");
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
    pingPush();
    toast("Session deleted");
    close();
    refresh();
  }

  async function removeFollowing() {
    setBusy(true);
    const { data: n, error } = await supabase.rpc("delete_session_series", { p_session: d.id! });
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    pingPush();
    toast(`${n} sessions deleted`);
    close();
    refresh();
  }

  if (existing && !canPlan && !canAttend) return <SessionReadOnly id={existing.id} />;
  if (!existing && !canPlan) return <SheetFrame title="New session">You can&apos;t plan sessions for any of your teams.</SheetFrame>;

  let clock = d.start_time;
  const used = [...new Set(d.plan.map((x) => drillMap.get(x.drill_id)?.category).filter(Boolean))] as Category[];

  return (
    <SheetFrame
      title={d.id ? "Session plan" : "New session"}
      foot={
        <>
          {d.id && canPlan ? <ConfirmButton label={laterInSeries.length > 1 ? "Delete this one" : "Delete"} onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : dates.length > 1 ? `Create ${dates.length} sessions` : "Save session"}
          </button>
        </>
      }
    >
      <fieldset className="plain" disabled={!canPlan}>
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
        {!d.id && planTeams.length > 1 && (
          <label className="field">
            <span>Team</span>
            <select className="input" id="s-team" value={d.team_id} onChange={(e) => (set({ team_id: e.target.value }), setAtt(new Set()))}>
              {planTeams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!d.id && (
        <div className="row2">
          <label className="field">
            <span>Repeat</span>
            <select className="input" id="s-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)}>
              <option value="none">Doesn&apos;t repeat</option>
              <option value="weekly">Every week</option>
              <option value="fortnightly">Every 2 weeks</option>
            </select>
          </label>
          {repeat !== "none" && (
            <label className="field">
              <span>Until</span>
              <input className="input" type="date" id="s-until" value={until} min={d.date} onChange={(e) => setUntil(e.target.value)} />
            </label>
          )}
        </div>
      )}
      {!d.id && repeat !== "none" && (
        <p className="series-note">
          {dates.length > 1
            ? `${dates.length} sessions, ${repeat === "weekly" ? "every" : "every second"} ${dayName(d.date)} at ${d.start_time} from ${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}. Everyone gets one notification, not ${dates.length}.`
            : "Choose an end date after the first session."}
        </p>
      )}
      </fieldset>
      {existing && canPlan && (
        <div className="series-box">
          {series.length > 1 && (
            <>
              <span>
                Part of a repeating series: {series.length} sessions, {shortDate(series[0].date)} to {shortDate(series[series.length - 1].date)}.
              </span>
              {laterInSeries.length > 1 && (
                <label className="field">
                  <span>Save changes to</span>
                  <select className="input" id="s-scope" value={scope} onChange={(e) => setScope(e.target.value as "one" | "following")}>
                    <option value="one">This session only</option>
                    <option value="following">This and later sessions ({laterInSeries.length})</option>
                  </select>
                </label>
              )}
            </>
          )}
          <div className="series-actions">
            <button type="button" className="btn sm" onClick={() => open({ kind: "session", id: null, copyFrom: existing.id })}>
              Duplicate
            </button>
            {laterInSeries.length > 1 && (
              <ConfirmButton className="btn sm danger" label={`Delete this and later (${laterInSeries.length})`} onConfirm={removeFollowing} disabled={busy} />
            )}
          </div>
        </div>
      )}
      <div className="subtabs" role="tablist">
        {(
          [
            ["plan", "Plan", true],
            ["attendance", "Attendance", canAttend],
            ["notes", "Notes", seeNotes],
          ] as const
        ).filter(([, , show]) => show).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "plan" && (
        <fieldset className="plain" disabled={!canPlan} style={{ display: "grid", gap: 14 }}>
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
        </fieldset>
      )}

      {tab === "attendance" && (
        <div style={{ display: "grid", gap: 14 }}>
          <div className="toolbar" style={{ justifyContent: "space-between", margin: 0 }}>
            <span className="muted" style={{ display: "grid", gap: 2 }}>
              <span>
                <b style={{ color: "var(--ink)" }}>{att.size}</b> of {players.length} marked present
              </span>
              {d.id && (
                <span>
                  Replies: <ReplyCounts sessionId={d.id} playerIds={players.map((p) => p.id)} />
                </span>
              )}
            </span>
            <span className="chips">
              {d.id && repliesFor(d.id).size > 0 && (
                <button className="btn sm" onClick={() => setAtt(new Set(players.filter((p) => repliesFor(d.id!).get(p.id)?.going).map((p) => p.id)))}>
                  Mark everyone going present
                </button>
              )}
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
                  <span className={`status s-${p.status}`} style={{ fontSize: 13 }}>
                    {STATUS[p.status]}
                  </span>
                  {d.id && repliesFor(d.id).get(p.id) && (
                    <span className={`att-reply ${repliesFor(d.id).get(p.id)!.going ? "y" : "n"}`} style={{ display: "block" }}>
                      {repliesFor(d.id).get(p.id)!.going ? "✓ Said they're coming" : `✕ Can't come${repliesFor(d.id).get(p.id)!.note ? `: ${repliesFor(d.id).get(p.id)!.note}` : ""}`}
                    </span>
                  )}
                </span>
              </label>
            ))}
            {!players.length && <div className="empty">No players in this team yet.</div>}
          </div>
        </div>
      )}

      {tab === "notes" && (
        <label className="field">
          <span>Session notes</span>
          <textarea className="input" id="s-notes" readOnly={!canPlan} rows={8} maxLength={5000} value={d.notes} onChange={(e) => set({ notes: e.target.value })} placeholder="Objectives, equipment, player feedback…" />
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
  const { data, drillMap, open, myPlayers, kidName } = useApp();
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
      {s.date >= todayIso() &&
        myPlayers
          .filter((p) => p.team_ids.includes(s.team_id))
          .map((p) => (
            <div key={p.id} className="card card-b" style={{ paddingTop: 16 }}>
              <ReplyButtons
                sessionId={s.id}
                playerId={p.id}
                who={data.role === "parent" ? kidName(p) : undefined}
                label={data.role === "parent" ? `Is ${kidName(p)} coming?` : "Are you coming?"}
              />
            </div>
          ))}
      {s.notes && (
        <div className="card card-b" style={{ paddingTop: 16 }}>
          <div className="eyebrow" style={{ marginBottom: 6 }}>Session notes</div>
          <p style={{ margin: 0, whiteSpace: "pre-wrap" }}>{s.notes}</p>
        </div>
      )}
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
      <ReadOnlyNote>Only your coaches can change this session plan.</ReadOnlyNote>
    </SheetFrame>
  );
}
