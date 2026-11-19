"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Modal } from "../fitness/Fitness";
import { NoTeams } from "../views/Overview";
import { Icon } from "@/components/ui";
import { errMsg, fmtDay, fmtMon, fmtNum, todayIso } from "@/lib/format";
import { DEFAULT_AGREEMENTS, FIELD_LABEL, TRIAL_STATUS, ageOn, guessColumns, parseCsv, parseDob, tidyName, time12, yesNoColumns, type ImportField } from "@/lib/trials";
import type { Trial, TrialApplicant, TrialDate, TrialStatus } from "@/lib/types";

/* Trials: set up a sign-up form, import a spreadsheet, check in and rate on trial nights, send offers. */

const short = (d: string) => `${fmtDay(d)} ${fmtNum(d)} ${fmtMon(d)}`;
const STATUS_CLASS: Record<TrialStatus, string> = { applied: "", shortlisted: "sl", offered: "of", accepted: "ok", declined: "no", not_selected: "no" };
type Tab = "list" | "night" | "pick";

export function TrialsPage({ initial }: { initial?: string }) {
  const { data, team, canDo, isAdmin } = useApp();
  const [pickedId, setPickedId] = useState<string | null>(initial ?? null);
  const [editing, setEditing] = useState<Trial | "new" | null>(null);
  if (!team) return <NoTeams isAdmin={isAdmin} />;
  const trials = data.trials.filter((t) => t.team_id === team.id);
  const trial = trials.find((t) => t.id === pickedId) ?? trials[0];
  const canRun = canDo("squad.edit", team.id);
  if (data.role === "player" || data.role === "parent")
    return (
      <div className="md-home">
        <h1>Trials</h1>
        <p className="md-muted">Trials are run by the team&apos;s coaches.</p>
      </div>
    );

  return (
    <div className="md-home tr">
      <div className="phead">
        <div>
          <div className="eyebrow">{team.name} · Trials</div>
          <h1>Trials</h1>
        </div>
        {canRun && (
          <button className="btn primary" onClick={() => setEditing("new")}>
            <Icon id="i-plus" />
            New trials
          </button>
        )}
      </div>
      {trials.length > 1 && (
        <div className="dchips" role="group" aria-label="Trials">
          {trials.map((t) => (
            <button key={t.id} type="button" className="chip" aria-pressed={t.id === trial?.id} onClick={() => setPickedId(t.id)}>
              {t.title}
            </button>
          ))}
        </div>
      )}
      {trial ? (
        <TrialView key={trial.id} trial={trial} canRun={canRun} onEdit={() => setEditing(trial)} />
      ) : (
        <section className="tr-empty">
          <h2>Running trials for {team.name}?</h2>
          <ol>
            <li>Set up the trial dates and what families need to agree to.</li>
            <li>Share the sign-up link, or import the spreadsheet from your Google or Microsoft form.</li>
            <li>Check players in and rate them at each trial.</li>
            <li>Send offers. When a family accepts, the player joins {team.name} and the family gets an invite.</li>
          </ol>
          {canRun && (
            <button className="btn primary" onClick={() => setEditing("new")}>
              Set up trials
            </button>
          )}
        </section>
      )}
      {editing && <TrialSetup trial={editing === "new" ? null : editing} onClose={() => setEditing(null)} onSaved={(id) => setPickedId(id)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ set up */

type DateRow = { id?: string; date: string; start_time: string; end_time: string; location: string };

function TrialSetup({ trial, onClose, onSaved }: { trial: Trial | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { data, team, supabase, toast, refresh, patch } = useApp();
  const year = new Date().getMonth() >= 8 ? new Date().getFullYear() + 1 : new Date().getFullYear();
  const [title, setTitle] = useState(trial?.title ?? `${team!.name} trials ${year}`);
  const [intro, setIntro] = useState(trial?.intro ?? "");
  const [closes, setCloses] = useState(trial?.closes_on ?? "");
  const [status, setStatus] = useState<Trial["status"]>(trial?.status ?? "open");
  const [askPlayer, setAskPlayer] = useState(trial?.ask_player_contact ?? true);
  const [agreements, setAgreements] = useState<string[]>(trial?.agreements ?? DEFAULT_AGREEMENTS);
  const old = trial ? data.trialDates.filter((d) => d.trial_id === trial.id) : [];
  const [dates, setDates] = useState<DateRow[]>(
    old.length ? old.map((d) => ({ id: d.id, date: d.date, start_time: d.start_time.slice(0, 5), end_time: d.end_time?.slice(0, 5) ?? "", location: d.location })) : [{ date: "", start_time: "18:00", end_time: "19:30", location: "" }],
  );
  const [busy, setBusy] = useState(false);
  const setDate = (i: number, p: Partial<DateRow>) => setDates((x) => x.map((d, j) => (j === i ? { ...d, ...p } : d)));

  async function save() {
    const ag = agreements.map((a) => a.trim()).filter(Boolean);
    if (title.trim().length < 2) return toast("Give the trials a name");
    setBusy(true);
    const row = { team_id: team!.id, title: title.trim(), intro: intro.trim(), closes_on: closes || null, status, ask_player_contact: askPlayer, agreements: ag };
    const q = trial ? supabase.from("trials").update(row).eq("id", trial.id).select("*").single() : supabase.from("trials").insert(row).select("*").single();
    const { data: saved, error } = await q;
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    const t = saved as Trial;
    const keep = dates.filter((d) => d.date);
    const gone = old.filter((o) => !keep.some((k) => k.id === o.id)).map((o) => o.id);
    if (gone.length) await supabase.from("trial_dates").delete().in("id", gone);
    for (const d of keep) {
      const r = { trial_id: t.id, team_id: team!.id, date: d.date, start_time: d.start_time || "18:00", end_time: d.end_time || null, location: d.location.trim() };
      const { error: e2 } = d.id ? await supabase.from("trial_dates").update(r).eq("id", d.id) : await supabase.from("trial_dates").insert(r);
      if (e2) toast(errMsg(e2));
    }
    patch((x) => ({ ...x, trials: [t, ...x.trials.filter((y) => y.id !== t.id)] }));
    setBusy(false);
    toast(trial ? "Trials updated" : "Trials set up. Share the sign-up link with families.");
    onSaved(t.id);
    refresh();
    onClose();
  }

  return (
    <Modal
      title={trial ? "Edit trials" : "Set up trials"}
      onClose={onClose}
      wide
      foot={
        <>
          <span className="spacer" />
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy ? "Saving…" : trial ? "Save" : "Create trials"}
          </button>
        </>
      }
    >
      <div className="tr-form">
        <label className="field">
          <span>Name</span>
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} />
        </label>
        <label className="field">
          <span>Message for families (optional)</span>
          <textarea className="input" rows={3} value={intro} onChange={(e) => setIntro(e.target.value)} maxLength={2000} placeholder="e.g. We're looking for players born in 2011 for our U15 Division 2 team. Training is Monday and Wednesday nights." />
        </label>
        <section>
          <h3>Trial dates</h3>
          {dates.map((d, i) => (
            <div key={i} className="tr-date">
              <input className="input" type="date" aria-label="Date" value={d.date} onChange={(e) => setDate(i, { date: e.target.value })} />
              <input className="input" type="time" aria-label="Start" value={d.start_time} onChange={(e) => setDate(i, { start_time: e.target.value })} />
              <input className="input" type="time" aria-label="Finish" value={d.end_time} onChange={(e) => setDate(i, { end_time: e.target.value })} />
              <input className="input" aria-label="Where" placeholder="Where" value={d.location} onChange={(e) => setDate(i, { location: e.target.value })} maxLength={120} />
              <button type="button" className="icon-btn" aria-label="Remove date" onClick={() => setDates((x) => x.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          <button type="button" className="tr-add" onClick={() => setDates((x) => [...x, { ...(x[x.length - 1] ?? { start_time: "18:00", end_time: "19:30", location: "" }), id: undefined, date: "" }])}>
            + Add a date
          </button>
        </section>
        <div className="tr-2">
          <label className="field">
            <span>Sign-ups close (optional)</span>
            <input className="input" type="date" value={closes} onChange={(e) => setCloses(e.target.value)} />
          </label>
          <label className="field">
            <span>Sign-up form</span>
            <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Trial["status"])}>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="done">Finished</option>
            </select>
          </label>
        </div>
        <label className="tr-check">
          <input type="checkbox" checked={askPlayer} onChange={(e) => setAskPlayer(e.target.checked)} />
          Ask for the player&apos;s own mobile and email (good for older players)
        </label>
        <section>
          <h3>Families must agree to</h3>
          <p className="fg-small">Each one is a tick box at the end of the form. All must be ticked to sign up.</p>
          {agreements.map((a, i) => (
            <div key={i} className="tr-agree">
              <textarea className="input" rows={2} value={a} onChange={(e) => setAgreements((x) => x.map((y, j) => (j === i ? e.target.value : y)))} maxLength={300} />
              <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setAgreements((x) => x.filter((_, j) => j !== i))}>
                ✕
              </button>
            </div>
          ))}
          {agreements.length < 10 && (
            <button type="button" className="tr-add" onClick={() => setAgreements((x) => [...x, ""])}>
              + Add one
            </button>
          )}
        </section>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ one set of trials */

function avgOf(rs: { rating: number | null }[]) {
  const v = rs.map((r) => r.rating).filter((x): x is number => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}

function TrialView({ trial, canRun, onEdit }: { trial: Trial; canRun: boolean; onEdit: () => void }) {
  const { data, toast } = useApp();
  const [tab, setTab] = useState<Tab>(() => (data.trialDates.some((d) => d.trial_id === trial.id && d.date === todayIso()) ? "night" : "list"));
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const apps = data.trialApplicants.filter((a) => a.trial_id === trial.id);
  const dates = data.trialDates.filter((d) => d.trial_id === trial.id);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/t/${trial.slug}`;
  const counts = (s: TrialStatus) => apps.filter((a) => a.status === s).length;
  const openApp = apps.find((a) => a.id === open);

  return (
    <>
      <section className="tr-head">
        <div className="tr-stats">
          <div>
            <b>{apps.length}</b>
            <small>Signed up</small>
          </div>
          <div>
            <b>{counts("offered") + counts("accepted")}</b>
            <small>Offers</small>
          </div>
          <div>
            <b className="ok">{counts("accepted")}</b>
            <small>Accepted</small>
          </div>
          <div>
            <b>{dates.length}</b>
            <small>Trial night{dates.length === 1 ? "" : "s"}</small>
          </div>
        </div>
        <div className="tr-share">
          <span className={`tr-pill ${trial.status}`}>{trial.status === "open" ? "Sign-ups open" : trial.status === "closed" ? "Sign-ups closed" : "Finished"}</span>
          <code>{link.replace(/^https?:\/\//, "")}</code>
          <button
            className="btn sm"
            onClick={() => {
              navigator.clipboard?.writeText(link).then(
                () => toast("Link copied. Paste it into your club's socials, email or group chat."),
                () => toast(link),
              );
            }}
          >
            Copy link
          </button>
          <a className="btn sm" href={`/t/${trial.slug}`} target="_blank" rel="noreferrer">
            Preview form
          </a>
          {canRun && (
            <>
              <button className="btn sm" onClick={() => setImporting(true)}>
                Import spreadsheet
              </button>
              <button className="btn sm" onClick={onEdit}>
                Edit
              </button>
            </>
          )}
        </div>
        {dates.length > 0 && (
          <p className="tr-dates">
            {dates.map((d) => `${short(d.date)} ${time12(d.start_time)}${d.location ? `, ${d.location}` : ""}`).join(" · ")}
          </p>
        )}
      </section>

      <div className="seg tr-tabs" role="tablist" aria-label="View">
        {(
          [
            ["list", "Triallists"],
            ["night", "Trial night"],
            ["pick", "Selection"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>

      {tab === "list" && <ApplicantList apps={apps} trial={trial} onOpen={setOpen} onImport={canRun ? () => setImporting(true) : undefined} />}
      {tab === "night" && <TrialNight trial={trial} apps={apps} dates={dates} canRun={canRun} onOpen={setOpen} />}
      {tab === "pick" && <Selection trial={trial} apps={apps} canRun={canRun} onOpen={setOpen} />}

      {importing && <ImportSheet trial={trial} onClose={() => setImporting(false)} />}
      {openApp && <ApplicantSheet a={openApp} trial={trial} canRun={canRun} onClose={() => setOpen(null)} />}
    </>
  );
}

function useScores(trialId: string) {
  const { data } = useApp();
  return useMemo(() => {
    const m = new Map<string, { avg: number | null; n: number; nights: number }>();
    for (const a of data.trialApplicants.filter((x) => x.trial_id === trialId)) {
      const rs = data.trialRatings.filter((r) => r.applicant_id === a.id);
      m.set(a.id, { avg: avgOf(rs), n: rs.filter((r) => r.rating != null).length, nights: data.trialAttendance.filter((t) => t.applicant_id === a.id).length });
    }
    return m;
  }, [data.trialApplicants, data.trialRatings, data.trialAttendance, trialId]);
}

const Stars = ({ v }: { v: number | null }) => (v == null ? <span className="tr-nostar">–</span> : <span className="tr-star">★ {v.toFixed(1)}</span>);
const ageText = (dob: string | null) => {
  const a = ageOn(dob);
  return a == null ? "" : `${a} yrs`;
};

function ApplicantList({ apps, trial, onOpen, onImport }: { apps: TrialApplicant[]; trial: Trial; onOpen: (id: string) => void; onImport?: () => void }) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | TrialStatus>("all");
  const scores = useScores(trial.id);
  const ql = q.trim().toLowerCase();
  const shown = apps.filter((a) => (f === "all" || a.status === f) && (!ql || `${a.full_name} ${a.current_club} ${a.parent_name}`.toLowerCase().includes(ql)));
  if (!apps.length)
    return (
      <section className="tr-empty">
        <h2>No sign-ups yet</h2>
        <p>Share the sign-up link with families. If you&apos;ve already collected sign-ups with another form, import the spreadsheet.</p>
        {onImport && (
          <button className="btn primary" onClick={onImport}>
            Import spreadsheet
          </button>
        )}
      </section>
    );
  return (
    <section>
      <div className="tr-tools">
        <label className="dsearch">
          <Icon id="i-search" />
          <input type="search" placeholder="Search name, club or parent" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search triallists" />
        </label>
        <select className="input tr-filter" value={f} onChange={(e) => setF(e.target.value as typeof f)} aria-label="Show">
          <option value="all">Everyone ({apps.length})</option>
          {(Object.keys(TRIAL_STATUS) as TrialStatus[]).map((s) => (
            <option key={s} value={s}>
              {TRIAL_STATUS[s]} ({apps.filter((a) => a.status === s).length})
            </option>
          ))}
        </select>
      </div>
      <ul className="tr-rows">
        {shown.map((a) => {
          const s = scores.get(a.id);
          return (
            <li key={a.id}>
              <button type="button" onClick={() => onOpen(a.id)}>
                <span className="tr-who">
                  <b>{a.full_name}</b>
                  <small>{[ageText(a.dob), a.positions, a.current_club].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="tr-meta">
                  <Stars v={s?.avg ?? null} />
                  <small>{s?.nights ?? 0} night{s?.nights === 1 ? "" : "s"}</small>
                </span>
                <span className={`tr-st ${STATUS_CLASS[a.status]}`}>{TRIAL_STATUS[a.status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ trial night: check in and rate */

function TrialNight({ trial, apps, dates, canRun, onOpen }: { trial: Trial; apps: TrialApplicant[]; dates: TrialDate[]; canRun: boolean; onOpen: (id: string) => void }) {
  const { data, supabase, toast, patch, refresh } = useApp();
  const today = todayIso();
  const [dateId, setDateId] = useState(() => (dates.find((d) => d.date >= today) ?? dates[dates.length - 1])?.id ?? "");
  const [q, setQ] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  if (!dates.length) return <p className="md-muted">Add trial dates (Edit) to check players in and rate them.</p>;
  const here = new Set(data.trialAttendance.filter((t) => t.date_id === dateId).map((t) => t.applicant_id));
  const mine = new Map(data.trialRatings.filter((r) => r.date_id === dateId && r.rated_by === data.userId).map((r) => [r.applicant_id, r]));
  const ql = q.trim().toLowerCase();
  const list = apps.filter((a) => !["declined", "not_selected"].includes(a.status) && (!ql || a.full_name.toLowerCase().includes(ql)));
  list.sort((a, b) => Number(here.has(b.id)) - Number(here.has(a.id)) || a.full_name.localeCompare(b.full_name));

  async function toggle(a: TrialApplicant) {
    const on = !here.has(a.id);
    patch((x) => ({ ...x, trialAttendance: on ? [...x.trialAttendance, { applicant_id: a.id, date_id: dateId }] : x.trialAttendance.filter((t) => !(t.applicant_id === a.id && t.date_id === dateId)) }));
    const { error } = on
      ? await supabase.from("trial_attendance").insert({ applicant_id: a.id, date_id: dateId })
      : await supabase.from("trial_attendance").delete().eq("applicant_id", a.id).eq("date_id", dateId);
    if (error) {
      toast(errMsg(error));
      refresh();
    }
  }
  async function rate(a: TrialApplicant, rating: number) {
    const cur = mine.get(a.id);
    const value = cur?.rating === rating ? null : rating;
    const row = { applicant_id: a.id, date_id: dateId, rating: value, notes: cur?.notes ?? "" };
    const temp = { id: cur?.id ?? `tmp-${a.id}`, rated_by: data.userId, rated_by_name: data.myName, updated_at: new Date().toISOString(), ...row };
    patch((x) => ({ ...x, trialRatings: [...x.trialRatings.filter((r) => !(r.applicant_id === a.id && r.date_id === dateId && r.rated_by === data.userId)), temp] }));
    if (!here.has(a.id)) toggle(a);
    const { error } = cur?.id && !cur.id.startsWith("tmp") ? await supabase.from("trial_ratings").update({ rating: value }).eq("id", cur.id) : await supabase.from("trial_ratings").upsert(row, { onConflict: "applicant_id,date_id,rated_by" });
    if (error) toast(errMsg(error));
    refresh();
  }

  return (
    <section>
      <div className="tr-tools">
        <select className="input tr-filter" value={dateId} onChange={(e) => setDateId(e.target.value)} aria-label="Trial night">
          {dates.map((d, i) => (
            <option key={d.id} value={d.id}>
              Trial {i + 1}: {short(d.date)}
              {d.date === today ? " (today)" : ""}
            </option>
          ))}
        </select>
        <label className="dsearch">
          <Icon id="i-search" />
          <input type="search" placeholder="Find a player" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Find a player" />
        </label>
      </div>
      <p className="tr-count">
        <b>{here.size}</b> here tonight · tap a name to check in, then tap stars to rate (only your ratings show here; the average is in Selection)
      </p>
      <ul className="tr-night">
        {list.map((a) => {
          const r = mine.get(a.id)?.rating ?? 0;
          const on = here.has(a.id);
          return (
            <li key={a.id} className={on ? "here" : ""}>
              <button type="button" className="tr-in" aria-pressed={on} onClick={() => toggle(a)}>
                <span className="tr-box" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                <span className="tr-who">
                  <b>{a.full_name}</b>
                  <small>{[ageText(a.dob), a.positions].filter(Boolean).join(" · ")}</small>
                </span>
              </button>
              <span className="tr-rate" role="group" aria-label={`Rate ${a.full_name}`}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" aria-label={`${n} star${n === 1 ? "" : "s"}`} aria-pressed={r >= n} onClick={() => rate(a, n)}>
                    ★
                  </button>
                ))}
              </span>
              <button type="button" className="tr-more" aria-label={`Notes on ${a.full_name}`} onClick={() => onOpen(a.id)}>
                ⋯
              </button>
            </li>
          );
        })}
      </ul>
      {canRun && (
        <button type="button" className="tr-add" onClick={() => setWalkIn(true)}>
          + Add a walk-in
        </button>
      )}
      {walkIn && <WalkIn trial={trial} dateId={dateId} onClose={() => setWalkIn(false)} />}
    </section>
  );
}

function WalkIn({ trial, dateId, onClose }: { trial: Trial; dateId: string; onClose: () => void }) {
  const { supabase, toast, refresh } = useApp();
  const [f, setF] = useState({ full_name: "", dob: "", parent_name: "", parent_phone: "", parent_email: "", positions: "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    if (tidyName(f.full_name).split(" ").length < 2) return toast("Enter their first and last name");
    setBusy(true);
    const { data: a, error } = await supabase
      .from("trial_applicants")
      .insert({ trial_id: trial.id, team_id: trial.team_id, club_id: trial.club_id, ...f, full_name: tidyName(f.full_name), parent_name: tidyName(f.parent_name), dob: f.dob || null, source: "manual" })
      .select("id")
      .single();
    if (!error && a) await supabase.from("trial_attendance").insert({ applicant_id: a.id, date_id: dateId });
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast(`${f.full_name.split(" ")[0]} added and checked in`);
    refresh();
    onClose();
  }
  return (
    <Modal
      title="Add a walk-in"
      onClose={onClose}
      foot={
        <>
          <span className="spacer" />
          <button className="btn primary" disabled={busy} onClick={save}>
            Add &amp; check in
          </button>
        </>
      }
    >
      <div className="tr-form">
        <label className="field">
          <span>Player&apos;s full name</span>
          <input className="input" value={f.full_name} onChange={set("full_name")} maxLength={80} />
        </label>
        <div className="tr-2">
          <label className="field">
            <span>Date of birth</span>
            <input className="input" type="date" value={f.dob} onChange={set("dob")} />
          </label>
          <label className="field">
            <span>Position(s)</span>
            <input className="input" value={f.positions} onChange={set("positions")} maxLength={120} />
          </label>
        </div>
        <label className="field">
          <span>Parent&apos;s name</span>
          <input className="input" value={f.parent_name} onChange={set("parent_name")} maxLength={80} />
        </label>
        <div className="tr-2">
          <label className="field">
            <span>Parent&apos;s mobile</span>
            <input className="input" type="tel" value={f.parent_phone} onChange={set("parent_phone")} maxLength={30} />
          </label>
          <label className="field">
            <span>Parent&apos;s email</span>
            <input className="input" type="email" value={f.parent_email} onChange={set("parent_email")} maxLength={120} />
          </label>
        </div>
        <p className="fg-small">You&apos;ll need the parent&apos;s email to send an offer. You can add it later.</p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ selection and offers */

type Send = "offer" | "not_selected" | "details";
const SEND_TITLE: Record<Send, string> = { offer: "Send offers", not_selected: "Send “not this time”", details: "Email trial details" };

function Selection({ trial, apps, canRun, onOpen }: { trial: Trial; apps: TrialApplicant[]; canRun: boolean; onOpen: (id: string) => void }) {
  const { supabase, toast, patch, refresh } = useApp();
  const scores = useScores(trial.id);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<Send | null>(null);
  const ranked = [...apps].sort((a, b) => (scores.get(b.id)?.avg ?? -1) - (scores.get(a.id)?.avg ?? -1) || a.full_name.localeCompare(b.full_name));
  const pick = (id: string) => setSel((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id)));
  const chosen = apps.filter((a) => sel.has(a.id));

  async function setStatus(status: TrialStatus) {
    const ids = [...sel];
    patch((x) => ({ ...x, trialApplicants: x.trialApplicants.map((a) => (sel.has(a.id) ? { ...a, status } : a)) }));
    const { error } = await supabase.from("trial_applicants").update({ status }).in("id", ids);
    if (error) toast(errMsg(error));
    else toast(`${ids.length} ${status === "shortlisted" ? "shortlisted" : "moved back to signed up"}`);
    setSel(new Set());
    refresh();
  }

  return (
    <section>
      <p className="tr-count">Ranked by average rating across all trial nights and coaches. Tick players, then choose what to do.</p>
      <ul className="tr-rows tr-pick">
        {ranked.map((a, i) => {
          const s = scores.get(a.id);
          return (
            <li key={a.id} className={sel.has(a.id) ? "on" : ""}>
              {canRun && <input type="checkbox" aria-label={`Select ${a.full_name}`} checked={sel.has(a.id)} onChange={() => pick(a.id)} />}
              <span className="tr-rank">{s?.avg != null ? i + 1 : ""}</span>
              <button type="button" onClick={() => onOpen(a.id)}>
                <span className="tr-who">
                  <b>{a.full_name}</b>
                  <small>
                    {[a.positions, `${s?.nights ?? 0} night${s?.nights === 1 ? "" : "s"}`, s?.n ? `${s.n} rating${s.n === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ")}
                    {!a.parent_email ? " · no email" : ""}
                  </small>
                </span>
                <Stars v={s?.avg ?? null} />
                <span className={`tr-st ${STATUS_CLASS[a.status]}`}>{TRIAL_STATUS[a.status]}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {canRun && sel.size > 0 && (
        <div className="tr-bulk" role="toolbar" aria-label="Selected players">
          <b>{sel.size} selected</b>
          <button className="btn sm" onClick={() => setStatus("shortlisted")}>
            Shortlist
          </button>
          <button className="btn sm primary" onClick={() => setSending("offer")}>
            Send offer
          </button>
          <button className="btn sm" onClick={() => setSending("not_selected")}>
            Not this time
          </button>
          <button className="btn sm" onClick={() => setSending("details")}>
            Email details
          </button>
          <button className="btn sm" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}
      {sending && (
        <SendSheet
          kind={sending}
          apps={chosen}
          onClose={() => setSending(null)}
          onSent={() => {
            setSel(new Set());
            setSending(null);
          }}
        />
      )}
    </section>
  );
}

function SendSheet({ kind, apps, onClose, onSent }: { kind: Send; apps: TrialApplicant[]; onClose: () => void; onSent: () => void }) {
  const { toast, refresh } = useApp();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const noEmail = apps.filter((a) => !a.parent_email);
  const done = kind !== "details" ? apps.filter((a) => a.status === "accepted" || a.status === "declined") : [];
  const go = apps.filter((a) => a.parent_email && !done.includes(a));
  async function send() {
    setBusy(true);
    try {
      const r = await fetch("/api/trials/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ids: go.map((a) => a.id), kind, message: msg }) });
      const j = (await r.json()) as { ok: boolean; error?: string; sent?: number; failed?: string[] };
      if (!j.ok) toast(j.error ?? "Couldn't send");
      else {
        toast(`Sent ${j.sent} email${j.sent === 1 ? "" : "s"}${j.failed?.length ? `. Couldn't send to ${j.failed.join(", ")}` : ""}`);
        onSent();
      }
    } catch {
      toast("Couldn't send. Check your connection.");
    }
    setBusy(false);
    refresh();
  }
  return (
    <Modal
      title={SEND_TITLE[kind]}
      onClose={onClose}
      foot={
        <>
          <span className="spacer" />
          <button className="btn primary" disabled={busy || !go.length} onClick={send}>
            {busy ? "Sending…" : `Send to ${go.length} famil${go.length === 1 ? "y" : "ies"}`}
          </button>
        </>
      }
    >
      <div className="tr-form">
        <p>
          {kind === "offer"
            ? "Each family gets an email with Accept and Decline buttons. When they accept, the player is added to the team and the family is sent an invite to join the club on Overlap."
            : kind === "not_selected"
              ? "Each family gets a kind thank-you email letting them know there isn't a place this time."
              : "Each family gets an email with the trial dates and times."}
        </p>
        <p className="tr-names">{go.map((a) => a.full_name).join(", ")}</p>
        {noEmail.length > 0 && <p className="inj-warn">No parent email for {noEmail.map((a) => a.full_name).join(", ")}. They won&apos;t be emailed.</p>}
        {done.length > 0 && <p className="fg-small">Skipping {done.map((a) => a.full_name).join(", ")} (already answered).</p>}
        <label className="field">
          <span>Add a personal message (optional)</span>
          <textarea className="input" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={1500} placeholder={kind === "offer" ? "e.g. Pre-season starts Monday 12 January at 6pm." : ""} />
        </label>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ one triallist */

function ApplicantSheet({ a, trial, canRun, onClose }: { a: TrialApplicant; trial: Trial; canRun: boolean; onClose: () => void }) {
  const { data, supabase, toast, patch, refresh } = useApp();
  const [notes, setNotes] = useState(a.notes);
  const [myNote, setMyNote] = useState("");
  const dates = data.trialDates.filter((d) => d.trial_id === trial.id);
  const ratings = data.trialRatings.filter((r) => r.applicant_id === a.id);
  const nights = new Set(data.trialAttendance.filter((t) => t.applicant_id === a.id).map((t) => t.date_id));
  const avg = avgOf(ratings);
  const [armed, setArmed] = useState(false);

  async function saveNotes() {
    if (notes === a.notes) return;
    const { error } = await supabase.from("trial_applicants").update({ notes }).eq("id", a.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, trialApplicants: x.trialApplicants.map((y) => (y.id === a.id ? { ...y, notes } : y)) }));
    toast("Notes saved");
  }
  async function addNote() {
    const text = myNote.trim();
    if (!text) return;
    const { error } = await supabase.from("trial_ratings").upsert({ applicant_id: a.id, date_id: null, notes: text }, { onConflict: "applicant_id,date_id,rated_by" });
    if (error) return toast(errMsg(error));
    setMyNote("");
    toast("Note added");
    refresh();
  }
  async function setStatus(status: TrialStatus) {
    const { error } = await supabase.from("trial_applicants").update({ status }).eq("id", a.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, trialApplicants: x.trialApplicants.map((y) => (y.id === a.id ? { ...y, status } : y)) }));
    refresh();
  }
  async function remove() {
    if (!armed) return setArmed(true);
    const { error } = await supabase.from("trial_applicants").delete().eq("id", a.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, trialApplicants: x.trialApplicants.filter((y) => y.id !== a.id) }));
    toast("Removed");
    refresh();
    onClose();
  }

  return (
    <Modal
      title={a.full_name}
      onClose={onClose}
      foot={
        canRun ? (
          <>
            <button className={`btn danger${armed ? " armed" : ""}`} onClick={remove}>
              {armed ? "Tap again to remove" : "Remove"}
            </button>
            <span className="spacer" />
            <select className="input tr-filter" value={a.status} onChange={(e) => setStatus(e.target.value as TrialStatus)} aria-label="Where they're up to">
              {(Object.keys(TRIAL_STATUS) as TrialStatus[]).map((s) => (
                <option key={s} value={s} disabled={s === "accepted" && !a.player_id}>
                  {TRIAL_STATUS[s]}
                </option>
              ))}
            </select>
          </>
        ) : undefined
      }
    >
      <div className="tr-app">
        <div className="tr-app-top">
          <span className={`tr-st ${STATUS_CLASS[a.status]}`}>{TRIAL_STATUS[a.status]}</span>
          <Stars v={avg} />
          <small>
            {nights.size} of {dates.length} nights
          </small>
        </div>
        <dl className="tr-dl">
          {a.dob && (
            <>
              <dt>Born</dt>
              <dd>
                {short(a.dob)} {a.dob.slice(0, 4)} ({ageText(a.dob)})
              </dd>
            </>
          )}
          {a.positions && (
            <>
              <dt>Positions</dt>
              <dd>{a.positions}</dd>
            </>
          )}
          {a.current_club && (
            <>
              <dt>Current club</dt>
              <dd>{a.current_club}</dd>
            </>
          )}
          <dt>Parent</dt>
          <dd>
            {a.parent_name || "–"}
            <span className="tr-contact">
              {a.parent_phone && <a href={`tel:${a.parent_phone.replace(/[^\d+]/g, "")}`}>{a.parent_phone}</a>}
              {a.parent_email && <a href={`mailto:${a.parent_email}`}>{a.parent_email}</a>}
            </span>
          </dd>
          {(a.player_phone || a.player_email) && (
            <>
              <dt>Player</dt>
              <dd>
                <span className="tr-contact">
                  {a.player_phone && <a href={`tel:${a.player_phone.replace(/[^\d+]/g, "")}`}>{a.player_phone}</a>}
                  {a.player_email && <a href={`mailto:${a.player_email}`}>{a.player_email}</a>}
                </span>
              </dd>
            </>
          )}
          <dt>Signed up</dt>
          <dd>
            {short(a.submitted_at.slice(0, 10))} · {a.source === "import" ? "imported" : a.source === "manual" ? "added by a coach" : "online form"}
            {a.last_emailed_at ? ` · last emailed ${short(a.last_emailed_at.slice(0, 10))}` : ""}
          </dd>
        </dl>
        {Object.keys(a.agreed ?? {}).length > 0 && (
          <ul className="tr-agreed">
            {Object.entries(a.agreed).map(([k, v]) => (
              <li key={k} className={v ? "y" : "n"}>
                {v ? "✓" : "✕"} {k}
              </li>
            ))}
          </ul>
        )}
        <section>
          <h3>Ratings</h3>
          {ratings.length ? (
            <ul className="tr-ratings">
              {ratings
                .slice()
                .sort((x, y) => x.updated_at.localeCompare(y.updated_at))
                .map((r) => {
                  const d = dates.findIndex((x) => x.id === r.date_id);
                  return (
                    <li key={r.id}>
                      <span>
                        <b>{r.rated_by_name}</b> · {d >= 0 ? `Trial ${d + 1}` : "General"}
                      </span>
                      {r.rating ? <span className="tr-star">{"★".repeat(r.rating)}</span> : null}
                      {r.notes && <p>{r.notes}</p>}
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="md-muted">No ratings yet. Rate on the Trial night tab.</p>
          )}
          <div className="tr-note">
            <input className="input" placeholder="Add your note (all coaches see it)" value={myNote} onChange={(e) => setMyNote(e.target.value)} maxLength={1000} onKeyDown={(e) => e.key === "Enter" && addNote()} />
            <button className="btn sm" onClick={addNote}>
              Save
            </button>
          </div>
        </section>
        {canRun && (
          <label className="field">
            <span>Private notes (only coaches running these trials)</span>
            <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} maxLength={2000} />
          </label>
        )}
        {a.status === "accepted" && <p className="tr-ok">Accepted. Now in the squad, and their family has been sent an invite.</p>}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ spreadsheet import */

function ImportSheet({ trial, onClose }: { trial: Trial; onClose: () => void }) {
  const { supabase, toast, refresh } = useApp();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<Record<ImportField, number>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const headers = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];
  const yesNo = rows ? yesNoColumns(headers, body, Object.values(map) as number[]) : [];

  async function read(file: File) {
    setErr("");
    if (file.size > 2_000_000) return setErr("That file is too big. Export just the sign-up responses as CSV.");
    const text = await file.text();
    const r = parseCsv(text);
    if (r.length < 2) return setErr("Couldn't find any sign-ups in that file. In Google Sheets use File → Download → CSV.");
    setRows(r);
    setMap(guessColumns(r[0]));
  }
  const cell = (r: string[], k: ImportField) => (map[k] != null ? (r[map[k]!] ?? "").trim() : "");
  const parsed = body
    .map((r) => {
      const name = tidyName(cell(r, "full_name"));
      const dobRaw = cell(r, "dob");
      return {
        name,
        dob: dobRaw ? parseDob(dobRaw) : null,
        dobRaw,
        row: {
          trial_id: trial.id,
          team_id: trial.team_id,
          club_id: trial.club_id,
          full_name: name.slice(0, 80),
          dob: dobRaw ? parseDob(dobRaw) : null,
          current_club: cell(r, "current_club").slice(0, 80),
          positions: cell(r, "positions").slice(0, 120),
          parent_name: tidyName(cell(r, "parent_name")).slice(0, 80),
          parent_phone: cell(r, "parent_phone").slice(0, 30),
          parent_email: cell(r, "parent_email").toLowerCase().slice(0, 120),
          player_phone: cell(r, "player_phone").slice(0, 30),
          player_email: cell(r, "player_email").toLowerCase().slice(0, 120),
          agreed: Object.fromEntries(yesNo.map(({ hd, i }) => [hd.slice(0, 300), /^(y|true|agree|i agree)/i.test((r[i] ?? "").trim())])),
          source: "import",
        },
      };
    })
    .filter((p) => p.name.length >= 2);
  const badDob = parsed.filter((p) => p.dobRaw && !p.dob);
  const unique = new Set(parsed.map((p) => `${p.name.toLowerCase()}|${p.dob ?? ""}`)).size;

  async function run() {
    setBusy(true);
    // The same player twice in one file: keep the latest answer.
    const seen = new Map<string, (typeof parsed)[number]["row"]>();
    for (const p of parsed) seen.set(`${p.name.toLowerCase()}|${p.dob ?? ""}`, p.row);
    const list = [...seen.values()];
    const { data: added, error } = await supabase.from("trial_applicants").upsert(list, { onConflict: "trial_id,name_key,dob", ignoreDuplicates: true }).select("id");
    setBusy(false);
    if (error) return setErr(errMsg(error));
    const n = added?.length ?? 0;
    toast(`Imported ${n} triallist${n === 1 ? "" : "s"}${list.length - n ? `, ${list.length - n} already here` : ""}`);
    refresh();
    onClose();
  }

  return (
    <Modal
      title="Import sign-ups"
      onClose={onClose}
      wide
      foot={
        rows ? (
          <>
            <button className="btn" onClick={() => setRows(null)}>
              Choose another file
            </button>
            <span className="spacer" />
            <button className="btn primary" disabled={busy || !parsed.length || map.full_name == null} onClick={run}>
              {busy ? "Importing…" : `Import ${unique} triallist${unique === 1 ? "" : "s"}`}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="tr-form">
        {!rows ? (
          <>
            <p>Export your form responses as a CSV file, then choose it here. Google Forms: open the responses spreadsheet, then File → Download → Comma-separated values.</p>
            <label className="tr-drop">
              <input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && read(e.target.files[0])} />
              <b>Choose CSV file</b>
              <small>Nothing is uploaded until you press Import.</small>
            </label>
          </>
        ) : (
          <>
            <p>
              Found <b>{body.length}</b> row{body.length === 1 ? "" : "s"}. Check each detail comes from the right column. Players already in these trials (same name and date of birth) are skipped.
            </p>
            <div className="tr-map">
              {(Object.keys(FIELD_LABEL) as ImportField[]).map((k) => (
                <label key={k} className="field">
                  <span>{FIELD_LABEL[k]}</span>
                  <select className="input" value={map[k] ?? ""} onChange={(e) => setMap((m) => ({ ...m, [k]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                    <option value="">Not in this file</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h.length > 60 ? `${h.slice(0, 57)}…` : h || `Column ${i + 1}`}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            {yesNo.length > 0 && (
              <div className="tr-yn">
                <b>Saved as agreements (yes/no answers):</b>
                <ul>
                  {yesNo.map(({ hd, i }) => (
                    <li key={i}>{hd.length > 110 ? `${hd.slice(0, 107)}…` : hd}</li>
                  ))}
                </ul>
              </div>
            )}
            {badDob.length > 0 && <p className="inj-warn">Couldn&apos;t read the date of birth for {badDob.map((p) => p.name).join(", ")}. They&apos;ll be imported without one.</p>}
            {parsed.length > 0 && (
              <p className="fg-small">
                First few: {parsed
                  .slice(0, 4)
                  .map((p) => p.name)
                  .join(", ")}
                {parsed.length > 4 ? "…" : ""}
              </p>
            )}
            {err && <p className="tp-err">{err}</p>}
          </>
        )}
        {!rows && err && <p className="tp-err">{err}</p>}
      </div>
    </Modal>
  );
}
