"use client";

import { Upgrade, usePro } from "../Pro";
import { pingPush } from "@/lib/push-client";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, ReadOnlyNote, SheetFrame } from "./SheetFrame";
import { Icon, Shirt, Timeline, totalMins } from "@/components/ui";
import { CATS, STATUS } from "@/lib/constants";
import { addMins, errMsg, fmtDay, fmtLongDay, fmtLongMon, fmtMon, fmtNum, hhmm, iso, parseD, todayIso } from "@/lib/format";
import type { Drill, PlanItem } from "@/lib/types";
import { ReplyButtons, ReplyCounts } from "../Replies";
import { PlanPeek, PlanThumb, SessionWalk, WalkButton } from "../sessions/PlanPlayer";
import { DrillAdder, PlanSummary, PlanTimeline, SuggestPanel } from "../sessions/PlanEditor";

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

export function SessionSheet({ id, date, copyFrom, tab: startTab }: { id: string | null; date?: string; copyFrom?: string; tab?: "plan" | "attendance" | "notes" }) {
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
  const pro = usePro();
  const [tab, setTab] = useState<"plan" | "attendance" | "notes">(startTab ?? (canPlan && pro ? "plan" : "attendance"));
  const [busy, setBusy] = useState(false);
  const [walk, setWalk] = useState<number | null>(null);
  const [edit, setEdit] = useState<null | "when" | "where" | "focus" | "repeat" | "team">(null);
  const [adding, setAdding] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
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

  const walkItems = (plan: PlanItem[]) => plan.flatMap((item) => (drillMap.get(item.drill_id) ? [{ item, drill: drillMap.get(item.drill_id)! }] : []));

  const teamName = data.teams.find((t) => t.id === d.team_id)?.name ?? "";
  const total = totalMins(d);
  const to12 = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, "0")}${h < 12 ? " am" : " pm"}`;
  };
  const addDrills = (ds: Drill[]) => setD((x) => ({ ...x, plan: [...x.plan, ...ds.map((dr) => ({ drill_id: dr.id, mins: dr.minutes }))] }));
  const pill = (k: NonNullable<typeof edit>, icon: React.ReactNode, text: string, cls = "") => (
    <button type="button" className={`sp-pill ${cls}`} aria-expanded={edit === k} disabled={!canPlan} onClick={() => setEdit(edit === k ? null : k)}>
      {icon}
      {text}
    </button>
  );
  const FOCUS_IDEAS = ["Pressing", "Build-up", "Possession", "1v1", "Finishing", "Transition", "Passing", "Defending"];
  const wide = canPlan && pro && tab === "plan";

  return (
    <SheetFrame
      title={d.id ? "Session plan" : "New session"}
      wide={wide}
      foot={
        <>
          {d.id && canPlan ? <ConfirmButton label={laterInSeries.length > 1 ? "Delete this one" : "Delete"} onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
          <button className="btn cancel" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" onClick={save} disabled={busy}>
            {busy ? "Saving…" : dates.length > 1 ? `Create ${dates.length} sessions` : "Save session"}
          </button>
        </>
      }
    >
      <div className={`sp-layout${wide ? " two" : ""}`}>
        <div className="sp-left">
          <div className="sp-head">
            <span className="sp-day">
              {fmtLongDay(d.date)} {fmtNum(d.date)} {fmtLongMon(d.date)}
              {teamName ? ` · ${teamName}` : ""}
            </span>
            <input className="sp-title" id="s-title" placeholder="Name this session" value={d.title} disabled={!canPlan} onChange={(e) => set({ title: e.target.value })} aria-label="Session title" maxLength={100} />
            <div className="sp-pills">
              {pill(
                "when",
                <Icon id="i-clock" />,
                `${fmtDay(d.date)} ${fmtNum(d.date)} ${fmtMon(d.date)} · ${to12(d.start_time)}${total ? ` – ${to12(addMins(d.start_time, total))}` : ""}`,
              )}
              {pill("where", <Icon id="i-pin" />, d.location || "Add a place", d.location ? "" : "add")}
              {pill("focus", <Icon id="i-target" />, d.focus || "Add a focus", d.focus ? "" : "add")}
              {!d.id && pill("repeat", <span aria-hidden="true">↻</span>, repeat === "none" ? "Doesn't repeat" : `${repeat === "weekly" ? "Weekly" : "Every 2 weeks"} · ${dates.length} sessions`, repeat === "none" ? "" : "rep")}
              {existing && series.length > 1 && pill("repeat", <span aria-hidden="true">↻</span>, `Repeats · ${series.length} sessions`, "rep")}
              {existing && canPlan && series.length <= 1 && (
                <button type="button" className="sp-pill" onClick={() => open({ kind: "session", id: null, copyFrom: existing.id })}>
                  <span aria-hidden="true">⧉</span>
                  Duplicate
                </button>
              )}
              {!d.id && planTeams.length > 1 && pill("team", <Icon id="i-squad" />, teamName || "Team")}
            </div>
            {edit && canPlan && (
              <div className="sp-edit">
                {edit === "when" && (
                  <div className="row2">
                    <label className="field">
                      <span>Date</span>
                      <input className="input" type="date" id="s-date" value={d.date} onChange={(e) => set({ date: e.target.value })} required />
                    </label>
                    <label className="field">
                      <span>Starts</span>
                      <input className="input" type="time" id="s-time" value={d.start_time} onChange={(e) => set({ start_time: e.target.value || "18:00" })} />
                    </label>
                  </div>
                )}
                {edit === "where" && (
                  <label className="field">
                    <span>Where</span>
                    <input className="input" id="s-loc" autoFocus value={d.location} maxLength={80} onChange={(e) => set({ location: e.target.value })} placeholder="e.g. Main Pitch" />
                  </label>
                )}
                {edit === "focus" && (
                  <>
                    <label className="field">
                      <span>Focus</span>
                      <input className="input" id="s-focus" autoFocus value={d.focus} maxLength={60} onChange={(e) => set({ focus: e.target.value })} placeholder="e.g. Build-up" />
                    </label>
                    <div className="chips">
                      {FOCUS_IDEAS.map((f) => (
                        <button key={f} type="button" className="chip" aria-pressed={d.focus === f} onClick={() => set({ focus: f })}>
                          {f}
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {edit === "team" && (
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
                {edit === "repeat" && !d.id && (
                  <>
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
                    {repeat !== "none" && (
                      <p className="series-note">
                        {dates.length > 1
                          ? `${dates.length} sessions, ${repeat === "weekly" ? "every" : "every second"} ${dayName(d.date)} at ${d.start_time} from ${shortDate(dates[0])} to ${shortDate(dates[dates.length - 1])}. Everyone gets one notification, not ${dates.length}.`
                          : "Choose an end date after the first session."}
                      </p>
                    )}
                  </>
                )}
                {edit === "repeat" && existing && series.length > 1 && (
                  <>
                    <p className="series-note">
                      Part of a repeating series: {series.length} sessions, {shortDate(series[0].date)} to {shortDate(series[series.length - 1].date)}.
                    </p>
                    {laterInSeries.length > 1 && (
                      <label className="field">
                        <span>Save changes to</span>
                        <select className="input" id="s-scope" value={scope} onChange={(e) => setScope(e.target.value as "one" | "following")}>
                          <option value="one">This session only</option>
                          <option value="following">This and later sessions ({laterInSeries.length})</option>
                        </select>
                      </label>
                    )}
                    <div className="series-actions">
                      <button type="button" className="btn sm" onClick={() => open({ kind: "session", id: null, copyFrom: existing.id })}>
                        Duplicate
                      </button>
                      {laterInSeries.length > 1 && <ConfirmButton className="btn sm danger" label={`Delete this and later (${laterInSeries.length})`} onConfirm={removeFollowing} disabled={busy} />}
                    </div>
                  </>
                )}
                <button type="button" className="btn sm sp-edit-done" onClick={() => setEdit(null)}>
                  Done
                </button>
              </div>
            )}
            {existing && scope === "following" && laterInSeries.length > 1 && edit !== "repeat" && <p className="sp-scope-note">Changes will save to this and {laterInSeries.length - 1} later sessions.</p>}
          </div>

          <div className="seg sp-tabs" role="tablist">
            {(
              [
                ["plan", "Plan", true],
                ["attendance", d.id ? `Attendance ${att.size}/${players.length}` : "Attendance", canAttend],
                ["notes", "Notes", seeNotes],
              ] as const
            )
              .filter(([, , show]) => show)
              .map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
                  {l}
                </button>
              ))}
          </div>

          {tab === "plan" && !pro && (
            <Upgrade compact feature="Session planning" blurb="Build sessions from the animated drill library and walk players through them." />
          )}
          {tab === "plan" && pro && (
            <div className="sp-plan">
              <PlanSummary plan={d.plan} start={d.start_time} drillMap={drillMap} />
              {walkItems(d.plan).length > 0 && <WalkButton count={walkItems(d.plan).length} onClick={() => setWalk(0)} />}
              {walk !== null && <SessionWalk items={walkItems(d.plan)} start={d.start_time} at={walk} onClose={() => setWalk(null)} />}
              <PlanTimeline plan={d.plan} start={d.start_time} setPlan={(plan) => set({ plan })} readOnly={!canPlan} />
              {canPlan && (
                <div className="sp-adds">
                  <button type="button" className="sp-add" onClick={() => (setAdding(true), setSuggesting(false))}>
                    + Add drill
                  </button>
                  <button type="button" className="sp-add dark" onClick={() => (setSuggesting(!suggesting), setAdding(false))} aria-expanded={suggesting}>
                    ✦ Suggest
                  </button>
                </div>
              )}
              {suggesting && <SuggestPanel team={data.teams.find((t) => t.id === d.team_id)} minutesLeft={60 - total > 15 ? 60 - total : 60} onAdd={addDrills} onClose={() => setSuggesting(false)} />}
            </div>
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
        </div>

        {wide && (
          <aside className="sp-right" aria-label="Add drills">
            <DrillAdder plan={d.plan} team={data.teams.find((t) => t.id === d.team_id)} onAdd={addDrills} />
          </aside>
        )}
      </div>

      {adding && canPlan && (
        <div className="sheet-scrim sp-add-scrim" onClick={() => setAdding(false)}>
          <div className="sp-add-sheet" role="dialog" aria-label="Add drills" onClick={(e) => e.stopPropagation()}>
            <span className="grab" aria-hidden="true" />
            <DrillAdder plan={d.plan} team={data.teams.find((t) => t.id === d.team_id)} onAdd={addDrills} onDone={() => setAdding(false)} compact />
          </div>
        </div>
      )}
    </SheetFrame>
  );
}

function SessionReadOnly({ id }: { id: string }) {
  const { data, drillMap, open, myPlayers, kidName } = useApp();
  const [peek, setPeek] = useState<number | null>(null);
  const [walk, setWalk] = useState(false);
  const s = data.sessions.find((x) => x.id === id)!;
  const items = s.plan.flatMap((item) => (drillMap.get(item.drill_id) ? [{ item, drill: drillMap.get(item.drill_id)! }] : []));
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
      {items.length > 0 && <WalkButton count={items.length} onClick={() => setWalk(true)} />}
      {walk && <SessionWalk items={items} start={hhmm(s.start_time)} onClose={() => setWalk(false)} />}
      <div style={{ display: "grid", gap: 8 }}>
        {s.plan.map((x, i) => {
          const dr = drillMap.get(x.drill_id);
          const st = clock;
          clock = addMins(clock, +x.mins || 0);
          if (!dr) return null;
          return (
            <div key={i} className={`prow-wrap${peek === i ? " open" : ""}`}>
              <div className="prow-drill has-thumb ro" data-cat={dr.category}>
                <span className="idx">{i + 1}</span>
                <PlanThumb drill={dr} open={peek === i} onToggle={() => setPeek(peek === i ? null : i)} />
                <button type="button" className="nm linklike-row" onClick={() => setPeek(peek === i ? null : i)}>
                  <b>{dr.name}</b>
                  <span className="clock">
                    {st}–{clock} · {CATS[dr.category]}
                  </span>
                </button>
                <span className="muted">{x.mins} min</span>
              </div>
              {peek === i && <PlanPeek drill={dr} onOpen={() => open({ kind: "drill", id: dr.id })} />}
            </div>
          );
        })}
        {!s.plan.length && <div className="empty">Your coach hasn't added drills to this session yet.</div>}
      </div>
      <ReadOnlyNote>Only your coaches can change this session plan.</ReadOnlyNote>
    </SheetFrame>
  );
}
