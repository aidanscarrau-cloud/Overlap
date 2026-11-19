"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { Modal } from "../fitness/Fitness";
import { NoTeams } from "../views/Overview";
import { Icon } from "@/components/ui";
import { POS_COLOUR } from "../views/Squad";
import { errMsg, fmtDay, fmtMon, fmtNum, todayIso } from "@/lib/format";
import {
  POS_GROUP,
  TRIAL_POS,
  posOf,
  type TrialPos,
  DEFAULT_AGREEMENTS,
  FIELD_LABEL,
  TRIAL_STATUS,
  ageOn,
  guessColumns,
  parseCsv,
  parseDob,
  tidyName,
  time12,
  yesNoColumns,
  type ImportField,
} from "@/lib/trials";
import type {
  Trial,
  TrialApplicant,
  TrialDate,
  TrialStatus,
} from "@/lib/types";

/* Trials: set up a sign-up form, import a spreadsheet, check in and rate on trial nights, send offers. */

const short = (d: string) => `${fmtDay(d)} ${fmtNum(d)} ${fmtMon(d)}`;
const STATUS_CLASS: Record<TrialStatus, string> = {
  applied: "",
  shortlisted: "sl",
  offered: "of",
  accepted: "ok",
  declined: "no",
  not_selected: "no",
};
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
            <button
              key={t.id}
              type="button"
              className="chip"
              aria-pressed={t.id === trial?.id}
              onClick={() => setPickedId(t.id)}
            >
              {t.title}
            </button>
          ))}
        </div>
      )}
      {trial ? (
        <TrialView
          key={trial.id}
          trial={trial}
          canRun={canRun}
          onEdit={() => setEditing(trial)}
        />
      ) : (
        <section className="tr-empty">
          <h2>Running trials for {team.name}?</h2>
          <ol>
            <li>Set up the trial dates and what families need to agree to.</li>
            <li>
              Share the sign-up link, or import the spreadsheet from your Google
              or Microsoft form.
            </li>
            <li>Check players in and rate them at each trial.</li>
            <li>
              Send offers. When a family accepts, the player joins {team.name}{" "}
              and the family gets an invite.
            </li>
          </ol>
          {canRun && (
            <button className="btn primary" onClick={() => setEditing("new")}>
              Set up trials
            </button>
          )}
        </section>
      )}
      {editing && (
        <TrialSetup
          trial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(id) => setPickedId(id)}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ set up */

type DateRow = {
  id?: string;
  date: string;
  start_time: string;
  end_time: string;
  location: string;
};

function TrialSetup({
  trial,
  onClose,
  onSaved,
}: {
  trial: Trial | null;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { data, team, supabase, toast, refresh, patch } = useApp();
  const year =
    new Date().getMonth() >= 8
      ? new Date().getFullYear() + 1
      : new Date().getFullYear();
  const [title, setTitle] = useState(
    trial?.title ?? `${team!.name} trials ${year}`,
  );
  const [intro, setIntro] = useState(trial?.intro ?? "");
  const [closes, setCloses] = useState(trial?.closes_on ?? "");
  const [status, setStatus] = useState<Trial["status"]>(
    trial?.status ?? "open",
  );
  const [askPlayer, setAskPlayer] = useState(trial?.ask_player_contact ?? true);
  const [agreements, setAgreements] = useState<string[]>(
    trial?.agreements ?? DEFAULT_AGREEMENTS,
  );
  const old = trial
    ? data.trialDates.filter((d) => d.trial_id === trial.id)
    : [];
  const [dates, setDates] = useState<DateRow[]>(
    old.length
      ? old.map((d) => ({
          id: d.id,
          date: d.date,
          start_time: d.start_time.slice(0, 5),
          end_time: d.end_time?.slice(0, 5) ?? "",
          location: d.location,
        }))
      : [{ date: "", start_time: "18:00", end_time: "19:30", location: "" }],
  );
  const [busy, setBusy] = useState(false);
  const setDate = (i: number, p: Partial<DateRow>) =>
    setDates((x) => x.map((d, j) => (j === i ? { ...d, ...p } : d)));

  async function save() {
    const ag = agreements.map((a) => a.trim()).filter(Boolean);
    if (title.trim().length < 2) return toast("Give the trials a name");
    setBusy(true);
    const row = {
      team_id: team!.id,
      title: title.trim(),
      intro: intro.trim(),
      closes_on: closes || null,
      status,
      ask_player_contact: askPlayer,
      agreements: ag,
    };
    const q = trial
      ? supabase
          .from("trials")
          .update(row)
          .eq("id", trial.id)
          .select("*")
          .single()
      : supabase.from("trials").insert(row).select("*").single();
    const { data: saved, error } = await q;
    if (error) {
      setBusy(false);
      return toast(errMsg(error));
    }
    const t = saved as Trial;
    const keep = dates.filter((d) => d.date);
    const gone = old
      .filter((o) => !keep.some((k) => k.id === o.id))
      .map((o) => o.id);
    if (gone.length) await supabase.from("trial_dates").delete().in("id", gone);
    for (const d of keep) {
      const r = {
        trial_id: t.id,
        team_id: team!.id,
        date: d.date,
        start_time: d.start_time || "18:00",
        end_time: d.end_time || null,
        location: d.location.trim(),
      };
      const { error: e2 } = d.id
        ? await supabase.from("trial_dates").update(r).eq("id", d.id)
        : await supabase.from("trial_dates").insert(r);
      if (e2) toast(errMsg(e2));
    }
    patch((x) => ({
      ...x,
      trials: [t, ...x.trials.filter((y) => y.id !== t.id)],
    }));
    setBusy(false);
    toast(
      trial
        ? "Trials updated"
        : "Trials set up. Share the sign-up link with families.",
    );
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
          <input
            className="input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={80}
          />
        </label>
        <label className="field">
          <span>Message for families (optional)</span>
          <textarea
            className="input"
            rows={3}
            value={intro}
            onChange={(e) => setIntro(e.target.value)}
            maxLength={2000}
            placeholder="e.g. We're looking for players born in 2011 for our U15 Division 2 team. Training is Monday and Wednesday nights."
          />
        </label>
        <section>
          <h3>Trial dates</h3>
          {dates.map((d, i) => (
            <div key={i} className="tr-date">
              <input
                className="input"
                type="date"
                aria-label="Date"
                value={d.date}
                onChange={(e) => setDate(i, { date: e.target.value })}
              />
              <input
                className="input"
                type="time"
                aria-label="Start"
                value={d.start_time}
                onChange={(e) => setDate(i, { start_time: e.target.value })}
              />
              <input
                className="input"
                type="time"
                aria-label="Finish"
                value={d.end_time}
                onChange={(e) => setDate(i, { end_time: e.target.value })}
              />
              <input
                className="input"
                aria-label="Where"
                placeholder="Where"
                value={d.location}
                onChange={(e) => setDate(i, { location: e.target.value })}
                maxLength={120}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove date"
                onClick={() => setDates((x) => x.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            className="tr-add"
            onClick={() =>
              setDates((x) => [
                ...x,
                {
                  ...(x[x.length - 1] ?? {
                    start_time: "18:00",
                    end_time: "19:30",
                    location: "",
                  }),
                  id: undefined,
                  date: "",
                },
              ])
            }
          >
            + Add a date
          </button>
        </section>
        <div className="tr-2">
          <label className="field">
            <span>Sign-ups close (optional)</span>
            <input
              className="input"
              type="date"
              value={closes}
              onChange={(e) => setCloses(e.target.value)}
            />
          </label>
          <label className="field">
            <span>Sign-up form</span>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as Trial["status"])}
            >
              <option value="open">Open</option>
              <option value="closed">Closed</option>
              <option value="done">Finished</option>
            </select>
          </label>
        </div>
        <label className="tr-check">
          <input
            type="checkbox"
            checked={askPlayer}
            onChange={(e) => setAskPlayer(e.target.checked)}
          />
          Ask for the player&apos;s own mobile and email (good for older
          players)
        </label>
        <section>
          <h3>Families must agree to</h3>
          <p className="fg-small">
            Each one is a tick box at the end of the form. All must be ticked to
            sign up.
          </p>
          {agreements.map((a, i) => (
            <div key={i} className="tr-agree">
              <textarea
                className="input"
                rows={2}
                value={a}
                onChange={(e) =>
                  setAgreements((x) =>
                    x.map((y, j) => (j === i ? e.target.value : y)),
                  )
                }
                maxLength={300}
              />
              <button
                type="button"
                className="icon-btn"
                aria-label="Remove"
                onClick={() =>
                  setAgreements((x) => x.filter((_, j) => j !== i))
                }
              >
                ✕
              </button>
            </div>
          ))}
          {agreements.length < 10 && (
            <button
              type="button"
              className="tr-add"
              onClick={() => setAgreements((x) => [...x, ""])}
            >
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

function TrialView({
  trial,
  canRun,
  onEdit,
}: {
  trial: Trial;
  canRun: boolean;
  onEdit: () => void;
}) {
  const { data, toast } = useApp();
  const [tab, setTab] = useState<Tab>(() =>
    data.trialDates.some(
      (d) => d.trial_id === trial.id && d.date === todayIso(),
    )
      ? "night"
      : "list",
  );
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const apps = data.trialApplicants.filter((a) => a.trial_id === trial.id);
  const dates = data.trialDates.filter((d) => d.trial_id === trial.id);
  const [origin, setOrigin] = useState("");
  useEffect(() => setOrigin(window.location.origin), []);
  const link = `${origin}/t/${trial.slug}`;
  const counts = (s: TrialStatus) => apps.filter((a) => a.status === s).length;
  const [testing, setTesting] = useState(false);
  // On phones the link and admin buttons start folded away, so the players come first at the ground.
  const [toolsOpen, setToolsOpen] = useState(true);
  useEffect(() => {
    if (window.matchMedia("(max-width: 700px)").matches) setToolsOpen(false);
  }, []);
  async function sendTest() {
    setTesting(true);
    try {
      const r = await fetch("/api/trials/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "test", trial: trial.id }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        error?: string;
        to?: string;
      };
      toast(
        j.ok
          ? `Sent 2 test emails to ${j.to}: the offer, and the welcome email families get after accepting.`
          : (j.error ?? "Couldn't send"),
      );
    } catch {
      toast("Couldn't send. Check your connection.");
    }
    setTesting(false);
  }
  const openApp = apps.find((a) => a.id === open);

  return (
    <>
      <section className={`tr-head${tab === "night" ? " is-night" : ""}`}>
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
        <details
          className="tr-toolsbox"
          open={toolsOpen}
          onToggle={(e) =>
            setToolsOpen((e.currentTarget as HTMLDetailsElement).open)
          }
        >
          <summary>
            <span className={`tr-pill ${trial.status}`}>
              {trial.status === "open"
                ? "Sign-ups open"
                : trial.status === "closed"
                  ? "Sign-ups closed"
                  : "Finished"}
            </span>
            Sign-up link &amp; tools
          </summary>
          <div className="tr-share">
            <span className={`tr-pill ${trial.status}`}>
              {trial.status === "open"
                ? "Sign-ups open"
                : trial.status === "closed"
                  ? "Sign-ups closed"
                  : "Finished"}
            </span>
            <code>{link.replace(/^https?:\/\//, "")}</code>
            <button
              className="btn sm"
              onClick={() => {
                navigator.clipboard?.writeText(link).then(
                  () =>
                    toast(
                      "Link copied. Paste it into your club's socials, email or group chat.",
                    ),
                  () => toast(link),
                );
              }}
            >
              Copy link
            </button>
            <a
              className="btn sm"
              href={`/t/${trial.slug}`}
              target="_blank"
              rel="noreferrer"
            >
              Preview form
            </a>
            {canRun && (
              <>
                <button className="btn sm" onClick={() => setImporting(true)}>
                  Import spreadsheet
                </button>
                <button
                  className="btn sm"
                  disabled={testing}
                  onClick={sendTest}
                >
                  {testing ? "Sending…" : "Send me a test offer"}
                </button>
                <button className="btn sm" onClick={onEdit}>
                  Edit
                </button>
              </>
            )}
          </div>
          {dates.length > 0 && (
            <p className="tr-dates">
              {dates
                .map(
                  (d) =>
                    `${short(d.date)} ${time12(d.start_time)}${d.location ? `, ${d.location}` : ""}`,
                )
                .join(" · ")}
            </p>
          )}
        </details>
      </section>

      <div className="seg tr-tabs" role="tablist" aria-label="View">
        {(
          [
            ["list", "Triallists"],
            ["night", "Trial night"],
            ["pick", "Selection"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {tab === "list" && (
        <ApplicantList
          apps={apps}
          trial={trial}
          onOpen={setOpen}
          onImport={canRun ? () => setImporting(true) : undefined}
        />
      )}
      {tab === "night" && (
        <TrialNight
          trial={trial}
          apps={apps}
          dates={dates}
          canRun={canRun}
          onOpen={setOpen}
        />
      )}
      {tab === "pick" && (
        <Selection trial={trial} apps={apps} canRun={canRun} onOpen={setOpen} />
      )}

      {importing && (
        <ImportSheet trial={trial} onClose={() => setImporting(false)} />
      )}
      {openApp && (
        <ApplicantSheet
          a={openApp}
          trial={trial}
          canRun={canRun}
          onClose={() => setOpen(null)}
        />
      )}
    </>
  );
}

function useScores(trialId: string) {
  const { data } = useApp();
  return useMemo(() => {
    const m = new Map<
      string,
      { avg: number | null; n: number; nights: number }
    >();
    for (const a of data.trialApplicants.filter(
      (x) => x.trial_id === trialId,
    )) {
      const rs = data.trialRatings.filter((r) => r.applicant_id === a.id);
      m.set(a.id, {
        avg: avgOf(rs),
        n: rs.filter((r) => r.rating != null).length,
        nights: data.trialAttendance.filter((t) => t.applicant_id === a.id)
          .length,
      });
    }
    return m;
  }, [data.trialApplicants, data.trialRatings, data.trialAttendance, trialId]);
}

const Stars = ({ v }: { v: number | null }) =>
  v == null ? (
    <span className="tr-nostar">–</span>
  ) : (
    <span className="tr-star">★ {v.toFixed(1)}</span>
  );
const ageText = (dob: string | null) => {
  const a = ageOn(dob);
  return a == null ? "" : `${a} yrs`;
};

function ApplicantList({
  apps,
  trial,
  onOpen,
  onImport,
}: {
  apps: TrialApplicant[];
  trial: Trial;
  onOpen: (id: string) => void;
  onImport?: () => void;
}) {
  const [q, setQ] = useState("");
  const [f, setF] = useState<"all" | TrialStatus>("all");
  const scores = useScores(trial.id);
  const ql = q.trim().toLowerCase();
  const shown = apps.filter(
    (a) =>
      (f === "all" || a.status === f) &&
      (!ql ||
        `${a.full_name} ${a.current_club} ${a.parent_name}`
          .toLowerCase()
          .includes(ql)),
  );
  if (!apps.length)
    return (
      <section className="tr-empty">
        <h2>No sign-ups yet</h2>
        <p>
          Share the sign-up link with families. If you&apos;ve already collected
          sign-ups with another form, import the spreadsheet.
        </p>
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
          <input
            type="search"
            placeholder="Search name, club or parent"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Search triallists"
          />
        </label>
        <select
          className="input tr-filter"
          value={f}
          onChange={(e) => setF(e.target.value as typeof f)}
          aria-label="Show"
        >
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
                  <small>
                    {[ageText(a.dob), a.positions, a.current_club]
                      .filter(Boolean)
                      .join(" · ")}
                  </small>
                </span>
                <span className="tr-meta">
                  <Stars v={s?.avg ?? null} />
                  <small>
                    {s?.nights ?? 0} night{s?.nights === 1 ? "" : "s"}
                  </small>
                </span>
                <span className={`tr-st ${STATUS_CLASS[a.status]}`}>
                  {TRIAL_STATUS[a.status]}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------------ trial night: check in and rate */

function TrialNight({
  trial,
  apps,
  dates,
  canRun,
  onOpen,
}: {
  trial: Trial;
  apps: TrialApplicant[];
  dates: TrialDate[];
  canRun: boolean;
  onOpen: (id: string) => void;
}) {
  const { data, supabase, toast, patch, refresh } = useApp();
  const today = todayIso();
  const [dateId, setDateId] = useState(
    () =>
      (dates.find((d) => d.date >= today) ?? dates[dates.length - 1])?.id ?? "",
  );
  const [q, setQ] = useState("");
  const [walkIn, setWalkIn] = useState(false);
  if (!dates.length)
    return (
      <p className="md-muted">
        Add trial dates (Edit) to check players in and rate them.
      </p>
    );
  const here = new Set(
    data.trialAttendance
      .filter((t) => t.date_id === dateId)
      .map((t) => t.applicant_id),
  );
  const mine = new Map(
    data.trialRatings
      .filter((r) => r.date_id === dateId && r.rated_by === data.userId)
      .map((r) => [r.applicant_id, r]),
  );
  const ql = q.trim().toLowerCase();
  const list = apps.filter(
    (a) =>
      !["declined", "not_selected"].includes(a.status) &&
      (!ql || a.full_name.toLowerCase().includes(ql)),
  );
  list.sort(
    (a, b) =>
      Number(here.has(b.id)) - Number(here.has(a.id)) ||
      a.full_name.localeCompare(b.full_name),
  );

  async function toggle(a: TrialApplicant) {
    const on = !here.has(a.id);
    patch((x) => ({
      ...x,
      trialAttendance: on
        ? [...x.trialAttendance, { applicant_id: a.id, date_id: dateId }]
        : x.trialAttendance.filter(
            (t) => !(t.applicant_id === a.id && t.date_id === dateId),
          ),
    }));
    const { error } = on
      ? await supabase
          .from("trial_attendance")
          .insert({ applicant_id: a.id, date_id: dateId })
      : await supabase
          .from("trial_attendance")
          .delete()
          .eq("applicant_id", a.id)
          .eq("date_id", dateId);
    if (error) {
      toast(errMsg(error));
      refresh();
    }
  }
  async function rate(a: TrialApplicant, rating: number) {
    const cur = mine.get(a.id);
    const value = cur?.rating === rating ? null : rating;
    const row = {
      applicant_id: a.id,
      date_id: dateId,
      rating: value,
      notes: cur?.notes ?? "",
    };
    const temp = {
      id: cur?.id ?? `tmp-${a.id}`,
      rated_by: data.userId,
      rated_by_name: data.myName,
      updated_at: new Date().toISOString(),
      ...row,
    };
    patch((x) => ({
      ...x,
      trialRatings: [
        ...x.trialRatings.filter(
          (r) =>
            !(
              r.applicant_id === a.id &&
              r.date_id === dateId &&
              r.rated_by === data.userId
            ),
        ),
        temp,
      ],
    }));
    if (!here.has(a.id)) toggle(a);
    const { error } =
      cur?.id && !cur.id.startsWith("tmp")
        ? await supabase
            .from("trial_ratings")
            .update({ rating: value })
            .eq("id", cur.id)
        : await supabase
            .from("trial_ratings")
            .upsert(row, { onConflict: "applicant_id,date_id,rated_by" });
    if (error) toast(errMsg(error));
    refresh();
  }

  return (
    <section>
      <div className="tr-tools">
        <select
          className="input tr-filter"
          value={dateId}
          onChange={(e) => setDateId(e.target.value)}
          aria-label="Trial night"
        >
          {dates.map((d, i) => (
            <option key={d.id} value={d.id}>
              Trial {i + 1}: {short(d.date)}
              {d.date === today ? " (today)" : ""}
            </option>
          ))}
        </select>
        <label className="dsearch">
          <Icon id="i-search" />
          <input
            type="search"
            placeholder="Find a player"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Find a player"
          />
        </label>
      </div>
      <p className="tr-count">
        <b>{here.size}</b> here tonight · tap a name to check in, then tap stars
        to rate (only your ratings show here; the average is in Selection)
      </p>
      <ul className="tr-night">
        {list.map((a) => {
          const r = mine.get(a.id)?.rating ?? 0;
          const on = here.has(a.id);
          return (
            <li key={a.id} className={on ? "here" : ""}>
              <button
                type="button"
                className="tr-in"
                aria-pressed={on}
                onClick={() => toggle(a)}
              >
                <span className="tr-box" aria-hidden="true">
                  {on ? "✓" : ""}
                </span>
                <span className="tr-who">
                  <b>{a.full_name}</b>
                  <small>
                    {[ageText(a.dob), a.positions].filter(Boolean).join(" · ")}
                  </small>
                </span>
              </button>
              <span
                className="tr-rate"
                role="group"
                aria-label={`Rate ${a.full_name}`}
              >
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n === 1 ? "" : "s"}`}
                    aria-pressed={r >= n}
                    onClick={() => rate(a, n)}
                  >
                    ★
                  </button>
                ))}
              </span>
              <button
                type="button"
                className="tr-more"
                aria-label={`Notes on ${a.full_name}`}
                onClick={() => onOpen(a.id)}
              >
                ⋯
              </button>
            </li>
          );
        })}
      </ul>
      {canRun && (
        <button
          type="button"
          className="tr-add"
          onClick={() => setWalkIn(true)}
        >
          + Add a walk-in
        </button>
      )}
      {walkIn && (
        <WalkIn
          trial={trial}
          dateId={dateId}
          onClose={() => setWalkIn(false)}
        />
      )}
    </section>
  );
}

function WalkIn({
  trial,
  dateId,
  onClose,
}: {
  trial: Trial;
  dateId: string;
  onClose: () => void;
}) {
  const { supabase, toast, refresh } = useApp();
  const [f, setF] = useState({
    full_name: "",
    dob: "",
    parent_name: "",
    parent_phone: "",
    parent_email: "",
    positions: "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    if (tidyName(f.full_name).split(" ").length < 2)
      return toast("Enter their first and last name");
    setBusy(true);
    const { data: a, error } = await supabase
      .from("trial_applicants")
      .insert({
        trial_id: trial.id,
        team_id: trial.team_id,
        club_id: trial.club_id,
        ...f,
        full_name: tidyName(f.full_name),
        parent_name: tidyName(f.parent_name),
        dob: f.dob || null,
        source: "manual",
      })
      .select("id")
      .single();
    if (!error && a)
      await supabase
        .from("trial_attendance")
        .insert({ applicant_id: a.id, date_id: dateId });
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
          <input
            className="input"
            value={f.full_name}
            onChange={set("full_name")}
            maxLength={80}
          />
        </label>
        <div className="tr-2">
          <label className="field">
            <span>Date of birth</span>
            <input
              className="input"
              type="date"
              value={f.dob}
              onChange={set("dob")}
            />
          </label>
          <label className="field">
            <span>Position(s)</span>
            <input
              className="input"
              value={f.positions}
              onChange={set("positions")}
              maxLength={120}
            />
          </label>
        </div>
        <label className="field">
          <span>Parent&apos;s name</span>
          <input
            className="input"
            value={f.parent_name}
            onChange={set("parent_name")}
            maxLength={80}
          />
        </label>
        <div className="tr-2">
          <label className="field">
            <span>Parent&apos;s mobile</span>
            <input
              className="input"
              type="tel"
              value={f.parent_phone}
              onChange={set("parent_phone")}
              maxLength={30}
            />
          </label>
          <label className="field">
            <span>Parent&apos;s email</span>
            <input
              className="input"
              type="email"
              value={f.parent_email}
              onChange={set("parent_email")}
              maxLength={120}
            />
          </label>
        </div>
        <p className="fg-small">
          You&apos;ll need the parent&apos;s email to send an offer. You can add
          it later.
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ selection and offers */

type Send = "offer" | "not_selected" | "details";
const SEND_TITLE: Record<Send, string> = {
  offer: "Send offers",
  not_selected: "Send “not this time”",
  details: "Email trial details",
};
type Col = "applied" | "shortlisted" | "offered" | "accepted" | "out";
const COLS: { k: Col; l: string; hint: string }[] = [
  { k: "applied", l: "Unsure", hint: "Still deciding" },
  { k: "shortlisted", l: "Shortlist", hint: "Likely picks" },
  { k: "offered", l: "Offered", hint: "Waiting for the family" },
  { k: "accepted", l: "Accepted", hint: "In the squad" },
  { k: "out", l: "Not selected", hint: "Or declined" },
];
const colOf = (s: TrialStatus): Col =>
  s === "not_selected" || s === "declined" ? "out" : s;
const initials = (n: string) =>
  n
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

/** Everything a coach needs to compare triallists without opening each one. */
function useDetail(trial: Trial) {
  const { data } = useApp();
  return useMemo(() => {
    const dates = data.trialDates.filter((d) => d.trial_id === trial.id);
    const m = new Map<
      string,
      {
        avg: number | null;
        nights: boolean[];
        coaches: { who: string; avg: number }[];
        note: string;
        n: number;
      }
    >();
    for (const a of data.trialApplicants.filter(
      (x) => x.trial_id === trial.id,
    )) {
      const rs = data.trialRatings.filter((r) => r.applicant_id === a.id);
      const by = new Map<string, number[]>();
      for (const r of rs)
        if (r.rating != null)
          by.set(r.rated_by_name, [
            ...(by.get(r.rated_by_name) ?? []),
            r.rating,
          ]);
      const att = new Set(
        data.trialAttendance
          .filter((t) => t.applicant_id === a.id)
          .map((t) => t.date_id),
      );
      const notes = rs
        .filter((r) => r.notes.trim())
        .sort((x, y) => y.updated_at.localeCompare(x.updated_at));
      m.set(a.id, {
        avg: avgOf(rs),
        n: rs.filter((r) => r.rating != null).length,
        nights: dates.map((d) => att.has(d.id)),
        coaches: [...by.entries()].map(([who, v]) => ({
          who,
          avg: v.reduce((s, x) => s + x, 0) / v.length,
        })),
        note: notes[0]
          ? `${notes[0].rated_by_name.split(" ")[0]}: ${notes[0].notes}`
          : a.notes,
      });
    }
    return m;
  }, [
    data.trialDates,
    data.trialApplicants,
    data.trialRatings,
    data.trialAttendance,
    trial.id,
  ]);
}

function Selection({
  trial,
  apps,
  canRun,
  onOpen,
}: {
  trial: Trial;
  apps: TrialApplicant[];
  canRun: boolean;
  onOpen: (id: string) => void;
}) {
  const { supabase, toast, patch, refresh } = useApp();
  const detail = useDetail(trial);
  const [view, setView] = useState<"groups" | "board">(() => {
    try {
      return (
        (localStorage.getItem("overlap-trial-view") as "groups" | "board") ||
        "groups"
      );
    } catch {
      return "groups";
    }
  });
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState<{
    kind: Send;
    apps: TrialApplicant[];
  } | null>(null);
  const [targets, setTargets] = useState(false);
  const pick = (id: string) =>
    setSel((s) =>
      s.has(id) ? new Set([...s].filter((x) => x !== id)) : new Set(s).add(id),
    );
  const switchView = (v: "groups" | "board") => {
    setView(v);
    try {
      localStorage.setItem("overlap-trial-view", v);
    } catch {}
  };
  const score = (a: TrialApplicant) => detail.get(a.id)?.avg ?? -1;
  const ranked = [...apps].sort(
    (a, b) => score(b) - score(a) || a.full_name.localeCompare(b.full_name),
  );

  async function setStatus(ids: string[], status: TrialStatus, msg?: string) {
    const set = new Set(ids);
    patch((x) => ({
      ...x,
      trialApplicants: x.trialApplicants.map((a) =>
        set.has(a.id) ? { ...a, status } : a,
      ),
    }));
    const { error } = await supabase
      .from("trial_applicants")
      .update({ status })
      .in("id", ids);
    if (error) toast(errMsg(error));
    else if (msg) toast(msg);
    refresh();
  }
  function move(a: TrialApplicant, to: Col) {
    if (colOf(a.status) === to) return;
    if (a.status === "accepted" || a.status === "declined")
      return toast(
        `${a.full_name.split(" ")[0]}'s family has already answered`,
      );
    if (to === "accepted")
      return toast(
        "Families accept from the offer email. Move them to Offered to send it.",
      );
    if (to === "offered") return setSending({ kind: "offer", apps: [a] });
    if (to === "out") return setSending({ kind: "not_selected", apps: [a] });
    setStatus(
      [a.id],
      to,
      `${a.full_name.split(" ")[0]} moved to ${COLS.find((c) => c.k === to)!.l}`,
    );
  }

  const row = (a: TrialApplicant, rank: number | null) => {
    const d = detail.get(a.id);
    const locked = a.status === "accepted" || a.status === "declined";
    return (
      <li key={a.id} className={sel.has(a.id) ? "on" : ""}>
        {canRun && (
          <input
            type="checkbox"
            aria-label={`Select ${a.full_name}`}
            checked={sel.has(a.id)}
            onChange={() => pick(a.id)}
          />
        )}
        <span className="tr-rank">{rank ?? ""}</span>
        <button type="button" className="sl-main" onClick={() => onOpen(a.id)}>
          <span className="sl-name">
            <b>{a.full_name}</b>
            <small>
              {[ageText(a.dob), a.positions, a.current_club]
                .filter(Boolean)
                .join(" · ")}
            </small>
          </span>
          <span className="sl-detail">
            {d && d.nights.length > 0 && (
              <span
                className="sl-nights"
                title={`At ${d.nights.filter(Boolean).length} of ${d.nights.length} trial nights`}
              >
                {d.nights.map((h, i) => (
                  <i key={i} className={h ? "y" : ""} />
                ))}
              </span>
            )}
            {d?.coaches.map((c) => (
              <span
                key={c.who}
                className="sl-coach"
                title={`${c.who}: ${c.avg.toFixed(1)} stars`}
              >
                {initials(c.who)} <b>★{c.avg.toFixed(c.avg % 1 ? 1 : 0)}</b>
              </span>
            ))}
            {!a.parent_email && <span className="sl-warn">No email</span>}
          </span>
          {d?.note && <span className="sl-note">&ldquo;{d.note}&rdquo;</span>}
        </button>
        <span className="sl-side">
          <Stars v={d?.avg ?? null} />
          {canRun &&
          (a.status === "applied" || a.status === "shortlisted") ? null : (
            <span className={`tr-st ${STATUS_CLASS[a.status]}`}>
              {TRIAL_STATUS[a.status]}
            </span>
          )}
          {canRun &&
            !locked &&
            (a.status === "applied" || a.status === "shortlisted") && (
              <button
                type="button"
                className={`sl-pin${a.status === "shortlisted" ? " on" : ""}`}
                onClick={() =>
                  setStatus(
                    [a.id],
                    a.status === "shortlisted" ? "applied" : "shortlisted",
                  )
                }
              >
                {a.status === "shortlisted" ? "✓ Shortlisted" : "+ Shortlist"}
              </button>
            )}
        </span>
      </li>
    );
  };

  const groups: (TrialPos | "none")[] = [...TRIAL_POS, "none"];
  return (
    <section className="sl">
      <TargetBar
        trial={trial}
        apps={apps}
        canRun={canRun}
        onEdit={() => setTargets(true)}
      />
      <div className="sl-bar">
        <div className="seg sl-view" role="tablist" aria-label="Layout">
          <button
            type="button"
            role="tab"
            aria-selected={view === "groups"}
            onClick={() => switchView("groups")}
          >
            By position
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "board"}
            onClick={() => switchView("board")}
          >
            Board
          </button>
        </div>
        <span className="fl-note">
          {view === "groups"
            ? "Ranked by average rating within each position."
            : canRun
              ? "Drag a player to another column, or use Move."
              : ""}
        </span>
      </div>

      {view === "groups" ? (
        groups.map((g) => {
          const list = ranked.filter((a) => (posOf(a) ?? "none") === g);
          if (!list.length) return null;
          const committed = list.filter(
            (a) => a.status === "offered" || a.status === "accepted",
          ).length;
          const target = g !== "none" ? trial.position_targets?.[g] : undefined;
          let r = 0;
          return (
            <div key={g} className="sl-grp">
              <h3>
                <i
                  style={{
                    background: g === "none" ? "#98a2b3" : POS_COLOUR[g],
                  }}
                />
                {g === "none" ? "Position not given" : POS_GROUP[g]}
                <small>
                  {list.length} trialling · {committed}
                  {target ? ` of ${target}` : ""} offered
                </small>
              </h3>
              <ul className="tr-rows sl-rows">
                {list.map((a) =>
                  row(a, detail.get(a.id)?.avg != null ? ++r : null),
                )}
              </ul>
            </div>
          );
        })
      ) : (
        <Board
          apps={ranked}
          detail={detail}
          canRun={canRun}
          onMove={move}
          onOpen={onOpen}
        />
      )}

      {canRun && sel.size > 0 && (
        <div className="tr-bulk" role="toolbar" aria-label="Selected players">
          <b>{sel.size} selected</b>
          <button
            className="btn sm"
            onClick={() => {
              setStatus([...sel], "shortlisted", `${sel.size} shortlisted`);
              setSel(new Set());
            }}
          >
            Shortlist
          </button>
          <button
            className="btn sm primary"
            onClick={() =>
              setSending({
                kind: "offer",
                apps: apps.filter((a) => sel.has(a.id)),
              })
            }
          >
            Send offer
          </button>
          <button
            className="btn sm"
            onClick={() =>
              setSending({
                kind: "not_selected",
                apps: apps.filter((a) => sel.has(a.id)),
              })
            }
          >
            Not this time
          </button>
          <button
            className="btn sm"
            onClick={() =>
              setSending({
                kind: "details",
                apps: apps.filter((a) => sel.has(a.id)),
              })
            }
          >
            Email details
          </button>
          <button className="btn sm" onClick={() => setSel(new Set())}>
            Clear
          </button>
        </div>
      )}
      {sending && (
        <SendSheet
          kind={sending.kind}
          apps={sending.apps}
          onClose={() => setSending(null)}
          onSent={() => {
            setSel(new Set());
            setSending(null);
          }}
        />
      )}
      {targets && (
        <TargetSheet trial={trial} onClose={() => setTargets(false)} />
      )}
    </section>
  );
}

/** How many places are filled against what the coach wants, overall and by position. */
function TargetBar({
  trial,
  apps,
  canRun,
  onEdit,
}: {
  trial: Trial;
  apps: TrialApplicant[];
  canRun: boolean;
  onEdit: () => void;
}) {
  const offered = apps.filter((a) => a.status === "offered").length;
  const accepted = apps.filter((a) => a.status === "accepted").length;
  const target = trial.squad_target ?? null;
  const pt = trial.position_targets ?? {};
  const committed = offered + accepted;
  return (
    <div className="sl-target">
      <div className="sl-target-main">
        <span className="sl-big">
          <b>{committed}</b>
          {target ? <span>/ {target}</span> : null}
        </span>
        <span className="sl-target-txt">
          <b>
            {target
              ? committed >= target
                ? committed > target
                  ? `${committed - target} over your squad target`
                  : "Squad target reached"
                : `${target - committed} place${target - committed === 1 ? "" : "s"} left`
              : "Places offered"}
          </b>
          <small>
            {accepted} accepted · {offered} waiting for an answer
          </small>
        </span>
        {canRun && (
          <button className="btn sm" onClick={onEdit}>
            {target ? "Edit targets" : "Set a squad target"}
          </button>
        )}
      </div>
      {target ? (
        <span className="sl-meter" aria-hidden="true">
          <i
            className="acc"
            style={{ width: `${Math.min(100, (accepted / target) * 100)}%` }}
          />
          <i
            className="off"
            style={{
              width: `${Math.min(100 - Math.min(100, (accepted / target) * 100), (offered / target) * 100)}%`,
            }}
          />
        </span>
      ) : null}
      {TRIAL_POS.some((p) => pt[p]) && (
        <div className="sl-pos">
          {TRIAL_POS.map((p) => {
            const n = apps.filter(
              (a) =>
                posOf(a) === p &&
                (a.status === "offered" || a.status === "accepted"),
            ).length;
            const t = pt[p];
            if (!t) return null;
            return (
              <span key={p} className={n >= t ? "full" : ""}>
                <i style={{ background: POS_COLOUR[p] }} />
                {p} <b>{n}</b>/{t}
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TargetSheet({
  trial,
  onClose,
}: {
  trial: Trial;
  onClose: () => void;
}) {
  const { supabase, toast, patch, refresh } = useApp();
  const [size, setSize] = useState(String(trial.squad_target ?? ""));
  const [pt, setPt] = useState<Record<TrialPos, string>>(
    () =>
      Object.fromEntries(
        TRIAL_POS.map((p) => [p, String(trial.position_targets?.[p] ?? "")]),
      ) as Record<TrialPos, string>,
  );
  const sum = TRIAL_POS.reduce((s, p) => s + (Number(pt[p]) || 0), 0);
  async function save() {
    const position_targets = Object.fromEntries(
      TRIAL_POS.filter((p) => Number(pt[p]) > 0).map((p) => [
        p,
        Math.min(40, Number(pt[p])),
      ]),
    );
    const squad_target =
      Number(size) > 0 ? Math.min(40, Number(size)) : sum || null;
    const { error } = await supabase
      .from("trials")
      .update({ squad_target, position_targets })
      .eq("id", trial.id);
    if (error)
      return toast(
        /column/.test(error.message)
          ? "Run database update 30 in Supabase first, then try again."
          : errMsg(error),
      );
    patch((x) => ({
      ...x,
      trials: x.trials.map((t) =>
        t.id === trial.id ? { ...t, squad_target, position_targets } : t,
      ),
    }));
    toast("Targets saved");
    refresh();
    onClose();
  }
  return (
    <Modal
      title="Squad targets"
      onClose={onClose}
      foot={
        <>
          <span className="spacer" />
          <button className="btn primary" onClick={save}>
            Save targets
          </button>
        </>
      }
    >
      <div className="tr-form">
        <p>
          How many players do you want from these trials? Position targets are
          optional.
        </p>
        <label className="field">
          <span>Squad size</span>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={1}
            max={40}
            value={size}
            onChange={(e) => setSize(e.target.value)}
            placeholder={sum ? String(sum) : "e.g. 18"}
          />
        </label>
        <div className="sl-tgrid">
          {TRIAL_POS.map((p) => (
            <label key={p} className="field">
              <span>{POS_GROUP[p]}</span>
              <input
                className="input"
                type="number"
                inputMode="numeric"
                min={0}
                max={40}
                value={pt[p]}
                onChange={(e) => setPt((x) => ({ ...x, [p]: e.target.value }))}
              />
            </label>
          ))}
        </div>
        {sum > 0 && Number(size) > 0 && sum !== Number(size) && (
          <p className="fg-small">
            Positions add up to {sum}, squad size is {size}.
          </p>
        )}
      </div>
    </Modal>
  );
}

type Detail = ReturnType<typeof useDetail>;
function Board({
  apps,
  detail,
  canRun,
  onMove,
  onOpen,
}: {
  apps: TrialApplicant[];
  detail: Detail;
  canRun: boolean;
  onMove: (a: TrialApplicant, to: Col) => void;
  onOpen: (id: string) => void;
}) {
  const [drag, setDrag] = useState<string | null>(null);
  const [over, setOver] = useState<Col | null>(null);
  return (
    <div className="sl-board">
      {COLS.map((c) => {
        const list = apps.filter((a) => colOf(a.status) === c.k);
        return (
          <section
            key={c.k}
            className={`sl-col ${c.k}${over === c.k ? " over" : ""}`}
            aria-label={c.l}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(c.k);
            }}
            onDragLeave={() => setOver((o) => (o === c.k ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/plain") || drag;
              const a = apps.find((x) => x.id === id);
              setDrag(null);
              setOver(null);
              if (a) onMove(a, c.k);
            }}
          >
            <header>
              <b>{c.l}</b>
              <span>{list.length}</span>
              <small>{c.hint}</small>
            </header>
            {list.map((a) => {
              const d = detail.get(a.id);
              const p = posOf(a);
              const locked = a.status === "accepted" || a.status === "declined";
              return (
                <article
                  key={a.id}
                  className={`sl-card${drag === a.id ? " drag" : ""}`}
                  draggable={canRun && !locked}
                  role="button"
                  tabIndex={0}
                  aria-label={`${a.full_name}, open details`}
                  onClick={() => onOpen(a.id)}
                  onKeyDown={(e) =>
                    (e.key === "Enter" || e.key === " ") &&
                    e.target === e.currentTarget &&
                    (e.preventDefault(), onOpen(a.id))
                  }
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/plain", a.id);
                    e.dataTransfer.effectAllowed = "move";
                    setDrag(a.id);
                  }}
                  onDragEnd={() => setDrag(null)}
                >
                  <div className="sl-card-in">
                    <span className="sl-card-top">
                      {p && (
                        <span
                          className="sl-pos-b"
                          style={{ background: POS_COLOUR[p] }}
                        >
                          {p}
                        </span>
                      )}
                      <b>{a.full_name}</b>
                    </span>
                    <span className="sl-card-meta">
                      <Stars v={d?.avg ?? null} />
                      {d && d.nights.length > 0 && (
                        <small>
                          {d.nights.filter(Boolean).length}/{d.nights.length}{" "}
                          nights
                        </small>
                      )}
                      {a.status === "declined" && (
                        <small className="sl-warn">Declined</small>
                      )}
                    </span>
                  </div>
                  {canRun && !locked && (
                    <select
                      className="sl-move"
                      aria-label={`Move ${a.full_name}`}
                      value=""
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) =>
                        e.target.value && onMove(a, e.target.value as Col)
                      }
                    >
                      <option value="">Move…</option>
                      {COLS.filter(
                        (x) => x.k !== c.k && x.k !== "accepted",
                      ).map((x) => (
                        <option key={x.k} value={x.k}>
                          {x.k === "offered"
                            ? "Send offer"
                            : x.k === "out"
                              ? "Not selected"
                              : x.l}
                        </option>
                      ))}
                    </select>
                  )}
                </article>
              );
            })}
            {!list.length && (
              <p className="sl-empty">
                {canRun ? "Drop players here" : "No one yet"}
              </p>
            )}
          </section>
        );
      })}
    </div>
  );
}

function SendSheet({
  kind,
  apps,
  onClose,
  onSent,
}: {
  kind: Send;
  apps: TrialApplicant[];
  onClose: () => void;
  onSent: () => void;
}) {
  const { supabase, toast, refresh, patch } = useApp();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState(true);
  const noEmail = apps.filter((a) => !a.parent_email);
  const done =
    kind !== "details"
      ? apps.filter((a) => a.status === "accepted" || a.status === "declined")
      : [];
  const go = apps.filter((a) => a.parent_email && !done.includes(a));
  const silent = kind === "not_selected" && !email;
  async function send() {
    setBusy(true);
    if (silent) {
      const ids = apps.filter((a) => !done.includes(a)).map((a) => a.id);
      const { error } = await supabase
        .from("trial_applicants")
        .update({ status: "not_selected" })
        .in("id", ids);
      if (error) toast(errMsg(error));
      else {
        patch((x) => ({
          ...x,
          trialApplicants: x.trialApplicants.map((a) =>
            ids.includes(a.id) ? { ...a, status: "not_selected" } : a,
          ),
        }));
        toast(`${ids.length} marked not selected. No emails sent.`);
        onSent();
      }
      setBusy(false);
      refresh();
      return;
    }
    try {
      const r = await fetch("/api/trials/email", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ids: go.map((a) => a.id), kind, message: msg }),
      });
      const j = (await r.json()) as {
        ok: boolean;
        error?: string;
        sent?: number;
        failed?: string[];
      };
      if (!j.ok) toast(j.error ?? "Couldn't send");
      else {
        toast(
          `Sent ${j.sent} email${j.sent === 1 ? "" : "s"}${j.failed?.length ? `. Couldn't send to ${j.failed.join(", ")}` : ""}`,
        );
        onSent();
      }
    } catch {
      toast("Couldn't send. Check your connection.");
    }
    setBusy(false);
    refresh();
  }
  const count = silent ? apps.length - done.length : go.length;
  return (
    <Modal
      title={SEND_TITLE[kind]}
      onClose={onClose}
      foot={
        <>
          <span className="spacer" />
          <button
            className="btn primary"
            disabled={busy || !count}
            onClick={send}
          >
            {busy
              ? "Sending…"
              : silent
                ? `Mark ${count} not selected`
                : `Send to ${count} famil${count === 1 ? "y" : "ies"}`}
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
        <p className="tr-names">
          {(silent ? apps.filter((a) => !done.includes(a)) : go)
            .map((a) => a.full_name)
            .join(", ")}
        </p>
        {kind === "not_selected" && (
          <label className="tr-check">
            <input
              type="checkbox"
              checked={email}
              onChange={(e) => setEmail(e.target.checked)}
            />
            Email the family (untick if you&apos;ve told them in person)
          </label>
        )}
        {!silent && noEmail.length > 0 && (
          <p className="inj-warn">
            No parent email for {noEmail.map((a) => a.full_name).join(", ")}.
            They won&apos;t be emailed. Add one from their details first.
          </p>
        )}
        {done.length > 0 && (
          <p className="fg-small">
            Skipping {done.map((a) => a.full_name).join(", ")} (already
            answered).
          </p>
        )}
        {!silent && (
          <label className="field">
            <span>Add a personal message (optional)</span>
            <textarea
              className="input"
              rows={3}
              value={msg}
              onChange={(e) => setMsg(e.target.value)}
              maxLength={1500}
              placeholder={
                kind === "offer"
                  ? "e.g. Pre-season starts Monday 12 January at 6pm."
                  : ""
              }
            />
          </label>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ one triallist */

function ApplicantSheet({
  a,
  trial,
  canRun,
  onClose,
}: {
  a: TrialApplicant;
  trial: Trial;
  canRun: boolean;
  onClose: () => void;
}) {
  const { data, supabase, toast, patch, refresh } = useApp();
  const [notes, setNotes] = useState(a.notes);
  const [myNote, setMyNote] = useState("");
  const dates = data.trialDates.filter((d) => d.trial_id === trial.id);
  const ratings = data.trialRatings.filter((r) => r.applicant_id === a.id);
  const nights = new Set(
    data.trialAttendance
      .filter((t) => t.applicant_id === a.id)
      .map((t) => t.date_id),
  );
  const avg = avgOf(ratings);
  const [armed, setArmed] = useState(false);

  async function saveNotes() {
    if (notes === a.notes) return;
    const { error } = await supabase
      .from("trial_applicants")
      .update({ notes })
      .eq("id", a.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({
      ...x,
      trialApplicants: x.trialApplicants.map((y) =>
        y.id === a.id ? { ...y, notes } : y,
      ),
    }));
    toast("Notes saved");
  }
  async function addNote() {
    const text = myNote.trim();
    if (!text) return;
    const { error } = await supabase
      .from("trial_ratings")
      .upsert(
        { applicant_id: a.id, date_id: null, notes: text },
        { onConflict: "applicant_id,date_id,rated_by" },
      );
    if (error) return toast(errMsg(error));
    setMyNote("");
    toast("Note added");
    refresh();
  }
  const [contact, setContact] = useState({
    parent_email: a.parent_email,
    parent_phone: a.parent_phone,
  });
  async function saveField(row: Partial<TrialApplicant>, msg: string) {
    const { error } = await supabase
      .from("trial_applicants")
      .update(row)
      .eq("id", a.id);
    if (error)
      return toast(
        /column/.test(error.message)
          ? "Run database update 30 in Supabase first, then try again."
          : errMsg(error),
      );
    patch((x) => ({
      ...x,
      trialApplicants: x.trialApplicants.map((y) =>
        y.id === a.id ? { ...y, ...row } : y,
      ),
    }));
    toast(msg);
  }
  async function setStatus(status: TrialStatus) {
    const { error } = await supabase
      .from("trial_applicants")
      .update({ status })
      .eq("id", a.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({
      ...x,
      trialApplicants: x.trialApplicants.map((y) =>
        y.id === a.id ? { ...y, status } : y,
      ),
    }));
    refresh();
  }
  async function remove() {
    if (!armed) return setArmed(true);
    const { error } = await supabase
      .from("trial_applicants")
      .delete()
      .eq("id", a.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({
      ...x,
      trialApplicants: x.trialApplicants.filter((y) => y.id !== a.id),
    }));
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
            <button
              className={`btn danger${armed ? " armed" : ""}`}
              onClick={remove}
            >
              {armed ? "Tap again to remove" : "Remove"}
            </button>
            <span className="spacer" />
            <select
              className="input tr-filter"
              value={a.status}
              onChange={(e) => setStatus(e.target.value as TrialStatus)}
              aria-label="Where they're up to"
            >
              {(Object.keys(TRIAL_STATUS) as TrialStatus[]).map((s) => (
                <option
                  key={s}
                  value={s}
                  disabled={s === "accepted" && !a.player_id}
                >
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
          <span className={`tr-st ${STATUS_CLASS[a.status]}`}>
            {TRIAL_STATUS[a.status]}
          </span>
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
          <dt>Position</dt>
          <dd className="tr-posrow">
            {canRun ? (
              <select
                className="input tr-filter"
                aria-label="Position in the squad"
                value={posOf(a) ?? ""}
                onChange={(e) =>
                  saveField(
                    {
                      position: (e.target.value ||
                        null) as TrialApplicant["position"],
                    },
                    "Position saved",
                  )
                }
              >
                <option value="">Not sure</option>
                {TRIAL_POS.map((p) => (
                  <option key={p} value={p}>
                    {POS_GROUP[p].slice(0, -1)}
                  </option>
                ))}
              </select>
            ) : (
              <span>
                {posOf(a) ? POS_GROUP[posOf(a)!].slice(0, -1) : "Not sure"}
              </span>
            )}
            {a.positions && <small>They said: {a.positions}</small>}
          </dd>
          {a.current_club && (
            <>
              <dt>Current club</dt>
              <dd>{a.current_club}</dd>
            </>
          )}
          <dt>Parent</dt>
          <dd>
            {a.parent_name || "–"}
            {canRun && (!a.parent_email || !a.parent_phone) && (
              <span className="tr-fix">
                {!a.parent_email && (
                  <input
                    className="input"
                    type="email"
                    placeholder="Add parent's email"
                    value={contact.parent_email}
                    onChange={(e) =>
                      setContact((c) => ({
                        ...c,
                        parent_email: e.target.value,
                      }))
                    }
                    onBlur={() =>
                      contact.parent_email.includes("@") &&
                      saveField(
                        {
                          parent_email: contact.parent_email
                            .trim()
                            .toLowerCase(),
                        },
                        "Email saved",
                      )
                    }
                  />
                )}
                {!a.parent_phone && (
                  <input
                    className="input"
                    type="tel"
                    placeholder="Add parent's mobile"
                    value={contact.parent_phone}
                    onChange={(e) =>
                      setContact((c) => ({
                        ...c,
                        parent_phone: e.target.value,
                      }))
                    }
                    onBlur={() =>
                      contact.parent_phone.trim() &&
                      saveField(
                        { parent_phone: contact.parent_phone.trim() },
                        "Mobile saved",
                      )
                    }
                  />
                )}
              </span>
            )}
            <span className="tr-contact">
              {a.parent_phone && (
                <a href={`tel:${a.parent_phone.replace(/[^\d+]/g, "")}`}>
                  {a.parent_phone}
                </a>
              )}
              {a.parent_email && (
                <a href={`mailto:${a.parent_email}`}>{a.parent_email}</a>
              )}
            </span>
          </dd>
          {(a.player_phone || a.player_email) && (
            <>
              <dt>Player</dt>
              <dd>
                <span className="tr-contact">
                  {a.player_phone && (
                    <a href={`tel:${a.player_phone.replace(/[^\d+]/g, "")}`}>
                      {a.player_phone}
                    </a>
                  )}
                  {a.player_email && (
                    <a href={`mailto:${a.player_email}`}>{a.player_email}</a>
                  )}
                </span>
              </dd>
            </>
          )}
          <dt>Signed up</dt>
          <dd>
            {short(a.submitted_at.slice(0, 10))} ·{" "}
            {a.source === "import"
              ? "imported"
              : a.source === "manual"
                ? "added by a coach"
                : "online form"}
            {a.last_emailed_at
              ? ` · last emailed ${short(a.last_emailed_at.slice(0, 10))}`
              : ""}
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
                        <b>{r.rated_by_name}</b> ·{" "}
                        {d >= 0 ? `Trial ${d + 1}` : "General"}
                      </span>
                      {r.rating ? (
                        <span className="tr-star">{"★".repeat(r.rating)}</span>
                      ) : null}
                      {r.notes && <p>{r.notes}</p>}
                    </li>
                  );
                })}
            </ul>
          ) : (
            <p className="md-muted">
              No ratings yet. Rate on the Trial night tab.
            </p>
          )}
          <div className="tr-note">
            <input
              className="input"
              placeholder="Add your note (all coaches see it)"
              value={myNote}
              onChange={(e) => setMyNote(e.target.value)}
              maxLength={1000}
              onKeyDown={(e) => e.key === "Enter" && addNote()}
            />
            <button className="btn sm" onClick={addNote}>
              Save
            </button>
          </div>
        </section>
        {canRun && (
          <label className="field">
            <span>Private notes (only coaches running these trials)</span>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              onBlur={saveNotes}
              maxLength={2000}
            />
          </label>
        )}
        {a.status === "accepted" && (
          <p className="tr-ok">
            Accepted. Now in the squad, and their family has been sent an
            invite.
          </p>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ spreadsheet import */

function ImportSheet({
  trial,
  onClose,
}: {
  trial: Trial;
  onClose: () => void;
}) {
  const { supabase, toast, refresh } = useApp();
  const [rows, setRows] = useState<string[][] | null>(null);
  const [map, setMap] = useState<Partial<Record<ImportField, number>>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const headers = rows?.[0] ?? [];
  const body = rows?.slice(1) ?? [];
  const yesNo = rows
    ? yesNoColumns(headers, body, Object.values(map) as number[])
    : [];

  async function read(file: File) {
    setErr("");
    if (file.size > 2_000_000)
      return setErr(
        "That file is too big. Export just the sign-up responses as CSV.",
      );
    const text = await file.text();
    const r = parseCsv(text);
    if (r.length < 2)
      return setErr(
        "Couldn't find any sign-ups in that file. In Google Sheets use File → Download → CSV.",
      );
    setRows(r);
    setMap(guessColumns(r[0]));
  }
  const cell = (r: string[], k: ImportField) =>
    map[k] != null ? (r[map[k]!] ?? "").trim() : "";
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
          agreed: Object.fromEntries(
            yesNo.map(({ hd, i }) => [
              hd.slice(0, 300),
              /^(y|true|agree|i agree)/i.test((r[i] ?? "").trim()),
            ]),
          ),
          source: "import",
        },
      };
    })
    .filter((p) => p.name.length >= 2);
  const badDob = parsed.filter((p) => p.dobRaw && !p.dob);
  const unique = new Set(
    parsed.map((p) => `${p.name.toLowerCase()}|${p.dob ?? ""}`),
  ).size;

  async function run() {
    setBusy(true);
    // The same player twice in one file: keep the latest answer.
    const seen = new Map<string, (typeof parsed)[number]["row"]>();
    for (const p of parsed)
      seen.set(`${p.name.toLowerCase()}|${p.dob ?? ""}`, p.row);
    const list = [...seen.values()];
    const { data: added, error } = await supabase
      .from("trial_applicants")
      .upsert(list, {
        onConflict: "trial_id,name_key,dob",
        ignoreDuplicates: true,
      })
      .select("id");
    setBusy(false);
    if (error) return setErr(errMsg(error));
    const n = added?.length ?? 0;
    toast(
      `Imported ${n} triallist${n === 1 ? "" : "s"}${list.length - n ? `, ${list.length - n} already here` : ""}`,
    );
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
            <button
              className="btn primary"
              disabled={busy || !parsed.length || map.full_name == null}
              onClick={run}
            >
              {busy
                ? "Importing…"
                : `Import ${unique} triallist${unique === 1 ? "" : "s"}`}
            </button>
          </>
        ) : undefined
      }
    >
      <div className="tr-form">
        {!rows ? (
          <>
            <p>
              Export your form responses as a CSV file, then choose it here.
              Google Forms: open the responses spreadsheet, then File → Download
              → Comma-separated values.
            </p>
            <label className="tr-drop">
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => e.target.files?.[0] && read(e.target.files[0])}
              />
              <b>Choose CSV file</b>
              <small>Nothing is uploaded until you press Import.</small>
            </label>
          </>
        ) : (
          <>
            <p>
              Found <b>{body.length}</b> row{body.length === 1 ? "" : "s"}.
              Check each detail comes from the right column. Players already in
              these trials (same name and date of birth) are skipped.
            </p>
            <div className="tr-map">
              {(Object.keys(FIELD_LABEL) as ImportField[]).map((k) => (
                <label key={k} className="field">
                  <span>{FIELD_LABEL[k]}</span>
                  <select
                    className="input"
                    value={map[k] ?? ""}
                    onChange={(e) =>
                      setMap((m) => ({
                        ...m,
                        [k]:
                          e.target.value === ""
                            ? undefined
                            : Number(e.target.value),
                      }))
                    }
                  >
                    <option value="">Not in this file</option>
                    {headers.map((h, i) => (
                      <option key={i} value={i}>
                        {h.length > 60
                          ? `${h.slice(0, 57)}…`
                          : h || `Column ${i + 1}`}
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
                    <li key={i}>
                      {hd.length > 110 ? `${hd.slice(0, 107)}…` : hd}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {badDob.length > 0 && (
              <p className="inj-warn">
                Couldn&apos;t read the date of birth for{" "}
                {badDob.map((p) => p.name).join(", ")}. They&apos;ll be imported
                without one.
              </p>
            )}
            {parsed.length > 0 && (
              <p className="fg-small">
                First few:{" "}
                {parsed
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
