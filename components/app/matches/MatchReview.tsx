"use client";

import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { ProBadge, Upgrade, usePro } from "../Pro";
import { LIBRARY_BY_KEY } from "@/lib/library-drills";
import { areaLabel } from "@/lib/idp";
import { errMsg } from "@/lib/format";
import { pingPush } from "@/lib/push-client";
import type { Match, MatchPlayer, MatchReport, MatchReview, Player, ReportDrill } from "@/lib/types";

/* Match review (Pro): video link, quick per-player stats and notes, and personal feedback reports
 * (drafted with AI, checked by the coach, then shared with each family). */

type Stats = Pick<MatchReview, "rating" | "shots" | "on_target" | "key_passes" | "tackles" | "saves" | "notes" | "moments">;
const EMPTY: Stats = { rating: null, shots: 0, on_target: 0, key_passes: 0, tackles: 0, saves: 0, notes: "", moments: [] };
const COUNTERS = [
  ["shots", "Shots"],
  ["on_target", "On target"],
  ["key_passes", "Key passes"],
  ["tackles", "Tackles & interceptions"],
] as const;

export const isVideoUrl = (s: string) => /^https:\/\/[^\s]+$/i.test(s.trim()) && s.trim().length <= 500;
const videoName = (u: string) => (/veo\.co/i.test(u) ? "Veo" : /youtu/i.test(u) ? "YouTube" : /hudl/i.test(u) ? "Hudl" : "video");

export function MatchReviewTab({ match }: { match: Match }) {
  const pro = usePro();
  if (!pro)
    return (
      <Upgrade
        feature="Match reviews"
        blurb="Add the match video, log quick stats for each player, and send every family personal feedback with drills for next training."
      />
    );
  return <Review match={match} />;
}

function Review({ match }: { match: Match }) {
  const { data, squadOf } = useApp();
  const rows = squadOf(match.id);
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const sorted = [...rows].sort((a, b) => (a.role === b.role ? 0 : a.role === "start" ? -1 : 1) || (a.slot ?? 99) - (b.slot ?? 99));
  const reports = new Map(data.matchReports.filter((r) => r.match_id === match.id).map((r) => [r.player_id, r]));
  const [open, setOpen] = useState<string | null>(null);
  const drafts = [...reports.values()].filter((r) => r.status === "draft").length;
  const sharedN = [...reports.values()].filter((r) => r.status === "shared").length;

  return (
    <div className="mr">
      <VideoCard match={match} />
      <AiCard />
      {!rows.length ? (
        <p className="muted" style={{ margin: 0 }}>
          Pick the squad on the Squad tab first. Then you can review each player here.
        </p>
      ) : (
        <>
          <div className="mr-head">
            <div>
              <h3>Players</h3>
              <p className="muted">
                Tap a player to log their game. {sharedN > 0 && `${sharedN} shared`}
                {sharedN > 0 && drafts > 0 && " · "}
                {drafts > 0 && `${drafts} draft${drafts > 1 ? "s" : ""} to check`}
              </p>
            </div>
            <GenerateButton match={match} rows={rows} reports={reports} />
          </div>
          <ul className="mr-list">
            {sorted.map((r) => {
              const p = byId.get(r.player_id);
              if (!p) return null;
              return <PlayerRow key={r.player_id} match={match} row={r} player={p} report={reports.get(r.player_id)} open={open === r.player_id} onToggle={() => setOpen(open === r.player_id ? null : r.player_id)} />;
            })}
          </ul>
          {drafts > 0 && <ShareAll match={match} drafts={[...reports.values()].filter((r) => r.status === "draft")} />}
        </>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- video */

function VideoCard({ match }: { match: Match }) {
  const { supabase, patch, toast } = useApp();
  const [url, setUrl] = useState(match.video_url ?? "");
  const [busy, setBusy] = useState(false);
  const changed = url.trim() !== (match.video_url ?? "");
  async function save() {
    const v = url.trim();
    if (v && !isVideoUrl(v)) return toast("Paste the full link, starting with https://");
    setBusy(true);
    const { error } = await supabase.from("matches").update({ video_url: v || null }).eq("id", match.id);
    setBusy(false);
    if (error) return toast(/video_url/.test(error.message) ? "Run update 33 in Supabase first." : errMsg(error));
    patch((d) => ({ ...d, matches: d.matches.map((m) => (m.id === match.id ? { ...m, video_url: v || null } : m)) }));
    toast(v ? "Video link saved. Families can watch it from the match." : "Video link removed");
  }
  return (
    <section className="mr-card">
      <label className="field">
        <span>Match video (Veo, YouTube or any link)</span>
        <div className="mr-inline">
          <input className="input" id="mr-video" inputMode="url" placeholder="https://app.veo.co/matches/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn" type="button" disabled={busy || !changed} onClick={save}>
            Save
          </button>
        </div>
      </label>
      {match.video_url && (
        <a className="mr-watch" href={match.video_url} target="_blank" rel="noopener noreferrer">
          ▶ Watch on {videoName(match.video_url)}
        </a>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- AI switch */

function AiCard() {
  const { data, isAdmin, supabase, patch, toast } = useApp();
  const on = !!data.club.ai_reports;
  const [busy, setBusy] = useState(false);
  if (on) return null;
  async function turnOn() {
    setBusy(true);
    const { error } = await supabase.from("clubs").update({ ai_reports: true }).eq("id", data.club.id);
    setBusy(false);
    if (error) return toast(/ai_reports/.test(error.message) ? "Run update 33 in Supabase first." : errMsg(error));
    patch((d) => ({ ...d, club: { ...d.club, ai_reports: true } }));
    toast("AI feedback is on for your club");
  }
  return (
    <section className="mr-card mr-ai">
      <h3>
        Write player feedback with AI <ProBadge />
      </h3>
      <p>
        Overlap can turn your stats and notes into a short, encouraging report for each player, with 1–2 things to work on and drills from your library. You check and edit every report before a family sees it.
      </p>
      <p className="muted">
        No names, birthdays or contact details are sent to the AI: players are sent as &ldquo;Player 1, Player 2&rdquo; with their position and your notes. Tell your families first. You can copy this:
      </p>
      <blockquote className="mr-quote">
        &ldquo;This season our coaches will send players short written feedback after some matches. Coaches use Overlap&apos;s AI writing helper to draft it from their own notes, and check every report before it&apos;s shared. No names or contact details are given to the AI. If you&apos;d rather your child doesn&apos;t get AI-drafted feedback, just tell your coach.&rdquo;
      </blockquote>
      {isAdmin ? (
        <button className="btn primary" type="button" disabled={busy} onClick={turnOn}>
          {busy ? "Turning on…" : "Turn on AI feedback"}
        </button>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          A club admin can turn this on. You can still log stats and write reports yourself.
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- generate */

function GenerateButton({ match, rows, reports }: { match: Match; rows: MatchPlayer[]; reports: Map<string, MatchReport> }) {
  const { data, refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  const todo = rows.filter((r) => reports.get(r.player_id)?.status !== "shared");
  const logged = rows.filter((r) => data.matchReviews.some((v) => v.match_id === match.id && v.player_id === r.player_id)).length;
  if (!data.club.ai_reports) return null;
  async function go() {
    if (!todo.length) return toast("Every report is already shared.");
    if (todo.some((r) => reports.get(r.player_id)?.status === "draft") && !window.confirm("Rewrite the drafts you haven't shared yet? Any edits to them will be replaced.")) return;
    setBusy(true);
    try {
      const res = await fetch("/api/match-review/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ match_id: match.id }) });
      const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; written?: number };
      if (!j.ok) throw new Error(j.error || "Couldn't write the reports.");
      toast(`${j.written} draft report${j.written === 1 ? "" : "s"} ready. Check them, then share.`);
      refresh();
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }
  return (
    <div className="mr-gen">
      <button className="btn primary" type="button" disabled={busy || !todo.length} onClick={go}>
        {busy ? `Writing ${todo.length} report${todo.length === 1 ? "" : "s"}…` : `✨ ${todo.every((r) => reports.has(r.player_id)) ? "Rewrite" : "Write"} ${todo.length} report${todo.length === 1 ? "" : "s"}`}
      </button>
      <small className="muted">{busy ? "This takes about a minute. Keep this open." : logged < rows.length ? `${logged} of ${rows.length} players logged. Better notes, better feedback.` : "Drafts only. Nothing is shared until you say so."}</small>
    </div>
  );
}

/* ---------------------------------------------------------------- one player */

function PlayerRow({ match, row, player, report, open, onToggle }: { match: Match; row: MatchPlayer; player: Player; report?: MatchReport; open: boolean; onToggle: () => void }) {
  const { data } = useApp();
  const review = data.matchReviews.find((v) => v.match_id === match.id && v.player_id === player.id);
  const [view, setView] = useState<"log" | "report">(report ? "report" : "log");
  const bits = [row.minutes !== null ? `${row.minutes}'` : row.role === "bench" ? "Bench" : "", row.goals ? `⚽ ${row.goals}` : "", row.assists ? `🅰 ${row.assists}` : "", review?.rating ? `${review.rating}/10` : ""].filter(Boolean);
  return (
    <li className={`mr-player${open ? " open" : ""}`}>
      <button type="button" className="mr-player-head" aria-expanded={open} onClick={onToggle}>
        <span className="tnum muted">{player.shirt_number ?? "–"}</span>
        <span className="mr-player-name">
          <b>{player.full_name}</b>
          <small className="muted">
            {player.position}
            {bits.length > 0 && ` · ${bits.join(" · ")}`}
          </small>
        </span>
        <span className={`mr-status ${report?.status ?? (review ? "logged" : "none")}`}>{report ? (report.status === "shared" ? "✓ Shared" : "Draft") : review ? "Logged" : "To log"}</span>
      </button>
      {open && (
        <div className="mr-body">
          <div className="seg" role="tablist" aria-label={`${player.full_name} review`}>
            <button type="button" role="tab" aria-pressed={view === "log"} onClick={() => setView("log")}>
              Stats & notes
            </button>
            <button type="button" role="tab" aria-pressed={view === "report"} onClick={() => setView("report")}>
              Report{report ? (report.status === "shared" ? " ✓" : " (draft)") : ""}
            </button>
          </div>
          {view === "log" ? <LogForm match={match} player={player} review={review} onDone={() => setView("report")} /> : <ReportEditor match={match} player={player} report={report} />}
        </div>
      )}
    </li>
  );
}

function LogForm({ match, player, review, onDone }: { match: Match; player: Player; review?: MatchReview; onDone: () => void }) {
  const { supabase, patch, toast } = useApp();
  const [s, setS] = useState<Stats>(() => (review ? { ...EMPTY, ...review, moments: review.moments ?? [] } : EMPTY));
  const [momentsText, setMomentsText] = useState(() => (review?.moments ?? []).map((m) => `${m.t} ${m.note}`).join("\n"));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Stats>) => setS((x) => ({ ...x, ...p }));
  const bump = (k: (typeof COUNTERS)[number][0] | "saves", d: number) => set({ [k]: Math.max(0, Math.min(50, (s[k] as number) + d)) } as Partial<Stats>);
  const gk = player.position === "GK";

  async function save() {
    const moments = momentsText
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .slice(0, 12)
      .map((l) => {
        const m = l.match(/^(\d{1,3}[:.]\d{2}|\d{1,3}'?)\s*[-–:]?\s*(.*)$/);
        return m ? { t: m[1].replace(".", ":").replace("'", ""), note: m[2].slice(0, 200) } : { t: "", note: l.slice(0, 200) };
      });
    if (s.on_target > s.shots) return toast("Shots on target can't be more than shots.");
    setBusy(true);
    const row = { match_id: match.id, player_id: player.id, rating: s.rating, shots: s.shots, on_target: s.on_target, key_passes: s.key_passes, tackles: s.tackles, saves: s.saves, notes: s.notes.trim().slice(0, 2000), moments };
    const { data: saved, error } = await supabase.from("match_reviews").upsert(row, { onConflict: "match_id,player_id" }).select("*").single();
    setBusy(false);
    if (error) return toast(/match_reviews/.test(error.message) ? "Run update 33 in Supabase first." : errMsg(error));
    patch((d) => ({ ...d, matchReviews: [...d.matchReviews.filter((v) => !(v.match_id === match.id && v.player_id === player.id)), saved as MatchReview] }));
    toast(`${player.full_name.split(" ")[0]} saved`);
    onDone();
  }

  return (
    <div className="mr-log">
      <div className="field">
        <span>Coach rating (private, never shown to families)</span>
        <div className="mr-rating" role="group" aria-label="Rating out of 10">
          {[4, 5, 6, 7, 8, 9, 10].map((n) => (
            <button key={n} type="button" aria-pressed={s.rating === n} onClick={() => set({ rating: s.rating === n ? null : n })}>
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="mr-counters">
        {[...COUNTERS, ...(gk ? ([["saves", "Saves"]] as const) : [])].map(([k, label]) => (
          <div className="mr-counter" key={k}>
            <span>{label}</span>
            <div>
              <button type="button" aria-label={`One less: ${label}`} onClick={() => bump(k, -1)}>
                −
              </button>
              <b className="tnum" aria-live="polite">
                {s[k] as number}
              </b>
              <button type="button" aria-label={`One more: ${label}`} onClick={() => bump(k, 1)}>
                +
              </button>
            </div>
          </div>
        ))}
      </div>
      <label className="field">
        <span>Your notes: what you saw</span>
        <textarea
          className="input"
          rows={3}
          maxLength={2000}
          value={s.notes}
          onChange={(e) => set({ notes: e.target.value })}
          placeholder="e.g. Brave on the ball, great first touch. Drifted inside too much on the left, left space behind. Needs to call for it more."
        />
      </label>
      <label className="field">
        <span>Moments to watch back (optional, one per line; the family sees these with the report)</span>
        <textarea className="input" rows={2} value={momentsText} onChange={(e) => setMomentsText(e.target.value)} placeholder={"12:30 Won it high and played it first time\n38:10 Didn't track the runner"} />
      </label>
      <div className="sheet-actions">
        <span className="spacer" />
        <button className="btn primary" type="button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the report */

type Draft = Pick<MatchReport, "headline" | "went_well" | "work_on" | "drills" | "goal_ideas" | "coach_message">;

function ReportEditor({ match, player, report }: { match: Match; player: Player; report?: MatchReport }) {
  const { data, supabase, patch, toast } = useApp();
  const first = player.full_name.split(" ")[0];
  const blank: Draft = { headline: "", went_well: ["", ""], work_on: [{ title: "", how: "" }], drills: [], goal_ideas: [], coach_message: "" };
  const [d, setD] = useState<Draft>(() => (report ? { headline: report.headline, went_well: report.went_well, work_on: report.work_on, drills: report.drills, goal_ideas: report.goal_ideas, coach_message: report.coach_message } : blank));
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState("");
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));
  const drillOptions = useMemo(
    () => [...data.drills.map((x) => ({ ref: `club:${x.id}`, name: x.name })), ...[...LIBRARY_BY_KEY.values()].map((x) => ({ ref: `lib:${x.key}`, name: x.name }))].filter((o) => !d.drills.some((x) => x.ref === o.ref)),
    [data.drills, d.drills],
  );

  const clean = (x: Draft): Draft => ({
    headline: x.headline.trim().slice(0, 200),
    went_well: x.went_well.map((s) => s.trim()).filter(Boolean).slice(0, 6),
    work_on: x.work_on.map((w) => ({ title: w.title.trim(), how: w.how.trim() })).filter((w) => w.title || w.how).slice(0, 4),
    drills: x.drills.slice(0, 4),
    goal_ideas: x.goal_ideas.slice(0, 3),
    coach_message: x.coach_message.trim().slice(0, 1000),
  });

  async function save(status: "draft" | "shared") {
    const c = clean(d);
    if (status === "shared" && !c.headline && !c.went_well.length) return toast("Add at least a headline or one thing that went well.");
    setBusy(true);
    const moments = (data.matchReviews.find((v) => v.match_id === match.id && v.player_id === player.id)?.moments ?? []).filter((m) => m.t);
    const row = { match_id: match.id, player_id: player.id, status, ...c, moments, ...(report ? {} : { ai: false, author_name: data.myName }) };
    const { data: saved, error } = await supabase.from("match_reports").upsert(row, { onConflict: "match_id,player_id" }).select("*").single();
    setBusy(false);
    if (error) return toast(/match_reports/.test(error.message) ? "Run update 33 in Supabase first." : errMsg(error));
    patch((x) => ({ ...x, matchReports: [...x.matchReports.filter((r) => r.id !== (saved as MatchReport).id), saved as MatchReport] }));
    if (status === "shared") pingPush();
    toast(status === "shared" ? (report?.status === "shared" ? "Report updated" : `Shared with ${first}'s family`) : "Draft saved");
  }
  async function remove() {
    if (!report || !window.confirm(`Delete ${first}'s report?`)) return;
    const { error } = await supabase.from("match_reports").delete().eq("id", report.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, matchReports: x.matchReports.filter((r) => r.id !== report.id) }));
    toast("Report deleted");
  }
  async function addGoal(i: number) {
    const g = d.goal_ideas[i];
    const { error } = await supabase.from("player_goals").insert({ player_id: player.id, area: g.area, title: g.title.slice(0, 140), detail: g.detail.slice(0, 2000), status: "active", author_name: data.myName });
    if (error) return toast(errMsg(error));
    const goal_ideas = d.goal_ideas.map((x, j) => (j === i ? { ...x, added: true } : x));
    set({ goal_ideas });
    if (report) await supabase.from("match_reports").update({ goal_ideas }).eq("id", report.id);
    toast(`Goal added to ${first}'s development plan`);
  }

  return (
    <div className="mr-edit">
      {report?.ai && report.status === "draft" && <p className="notice">Drafted with AI from your notes. Read it through and change anything that doesn&apos;t sound like you before sharing.</p>}
      {!report && <p className="muted" style={{ margin: 0 }}>Write {first}&apos;s report yourself{data.club.ai_reports ? ", or log their stats and use ✨ Write reports above" : ""}.</p>}
      <label className="field">
        <span>Headline</span>
        <input className="input" maxLength={200} value={d.headline} onChange={(e) => set({ headline: e.target.value })} placeholder={`e.g. ${first} was everywhere today. Great energy.`} />
      </label>
      <fieldset className="mr-fs">
        <legend>What went well</legend>
        {d.went_well.map((w, i) => (
          <div className="mr-inline" key={i}>
            <input className="input" maxLength={300} value={w} onChange={(e) => set({ went_well: d.went_well.map((x, j) => (j === i ? e.target.value : x)) })} aria-label={`Went well ${i + 1}`} />
            <button className="icon-btn" type="button" aria-label="Remove" onClick={() => set({ went_well: d.went_well.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        {d.went_well.length < 6 && (
          <button className="linkbtn" type="button" onClick={() => set({ went_well: [...d.went_well, ""] })}>
            + Add another
          </button>
        )}
      </fieldset>
      <fieldset className="mr-fs">
        <legend>Next steps (keep it to 1–2)</legend>
        {d.work_on.map((w, i) => (
          <div className="mr-workon" key={i}>
            <div className="mr-inline">
              <input className="input" maxLength={80} value={w.title} placeholder="e.g. Scanning before you receive" onChange={(e) => set({ work_on: d.work_on.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)) })} aria-label={`Next step ${i + 1}`} />
              <button className="icon-btn" type="button" aria-label="Remove" onClick={() => set({ work_on: d.work_on.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
            <textarea className="input" rows={2} maxLength={400} value={w.how} placeholder="How to do it" onChange={(e) => set({ work_on: d.work_on.map((x, j) => (j === i ? { ...x, how: e.target.value } : x)) })} aria-label={`How to work on ${w.title || "it"}`} />
          </div>
        ))}
        {d.work_on.length < 2 && (
          <button className="linkbtn" type="button" onClick={() => set({ work_on: [...d.work_on, { title: "", how: "" }] })}>
            + Add a next step
          </button>
        )}
      </fieldset>
      <fieldset className="mr-fs">
        <legend>Drills for next training</legend>
        {d.drills.map((x, i) => (
          <div className="mr-drill" key={x.ref}>
            <div>
              <b>{x.name}</b>
              <input className="input" maxLength={300} value={x.why} placeholder="Why this drill" onChange={(e) => set({ drills: d.drills.map((y, j) => (j === i ? { ...y, why: e.target.value } : y)) })} aria-label={`Why ${x.name}`} />
            </div>
            <button className="icon-btn" type="button" aria-label={`Remove ${x.name}`} onClick={() => set({ drills: d.drills.filter((_, j) => j !== i) })}>
              ✕
            </button>
          </div>
        ))}
        {d.drills.length < 4 && (
          <select
            className="input"
            value={adding}
            aria-label="Add a drill"
            onChange={(e) => {
              const o = drillOptions.find((x) => x.ref === e.target.value);
              if (o) set({ drills: [...d.drills, { ref: o.ref, name: o.name, why: "" }] });
              setAdding("");
            }}
          >
            <option value="">+ Add a drill…</option>
            {drillOptions.map((o) => (
              <option key={o.ref} value={o.ref}>
                {o.name}
                {o.ref.startsWith("club:") ? " (your club)" : ""}
              </option>
            ))}
          </select>
        )}
      </fieldset>
      {d.goal_ideas.length > 0 && (
        <fieldset className="mr-fs">
          <legend>Development goal ideas (only you see these)</legend>
          {d.goal_ideas.map((g, i) => (
            <div className="mr-goal" key={i}>
              <div>
                <small className="muted">{areaLabel(g.area)}</small>
                <b>{g.title}</b>
                <small>{g.detail}</small>
              </div>
              {g.added ? (
                <span className="mr-status shared">✓ Added</span>
              ) : (
                <span className="mr-goal-acts">
                  <button className="btn" type="button" onClick={() => addGoal(i)}>
                    Add as goal
                  </button>
                  <button className="icon-btn" type="button" aria-label="Dismiss idea" onClick={() => set({ goal_ideas: d.goal_ideas.filter((_, j) => j !== i) })}>
                    ✕
                  </button>
                </span>
              )}
            </div>
          ))}
        </fieldset>
      )}
      <label className="field">
        <span>A personal note from you (optional)</span>
        <textarea className="input" rows={2} maxLength={1000} value={d.coach_message} onChange={(e) => set({ coach_message: e.target.value })} placeholder="Proud of how you kept going after the second goal." />
      </label>
      <div className="sheet-actions">
        {report ? (
          <button className="btn quiet" type="button" onClick={remove} disabled={busy}>
            Delete
          </button>
        ) : (
          <span className="spacer" />
        )}
        <span className="spacer" />
        {report?.status === "shared" ? (
          <>
            <button className="btn" type="button" disabled={busy} onClick={() => save("draft")}>
              Unshare
            </button>
            <button className="btn primary" type="button" disabled={busy} onClick={() => save("shared")}>
              Save changes
            </button>
          </>
        ) : (
          <>
            <button className="btn" type="button" disabled={busy} onClick={() => save("draft")}>
              Save draft
            </button>
            <button className="btn primary" type="button" disabled={busy} onClick={() => save("shared")}>
              Share with family
            </button>
          </>
        )}
      </div>
      <details className="mr-preview">
        <summary>Preview what {first}&apos;s family will see</summary>
        <ReportCard report={{ ...(report ?? ({} as MatchReport)), ...clean(d), moments: data.matchReviews.find((v) => v.match_id === match.id && v.player_id === player.id)?.moments ?? [], status: "shared" } as MatchReport} who={first} match={match} />
      </details>
    </div>
  );
}

function ShareAll({ match, drafts }: { match: Match; drafts: MatchReport[] }) {
  const { supabase, refresh, toast } = useApp();
  const [busy, setBusy] = useState(false);
  async function go() {
    if (!window.confirm(`Share ${drafts.length} draft report${drafts.length > 1 ? "s" : ""} with families now? Make sure you've read them.`)) return;
    setBusy(true);
    const { error } = await supabase.from("match_reports").update({ status: "shared" }).eq("match_id", match.id).eq("status", "draft");
    setBusy(false);
    if (error) return toast(errMsg(error));
    pingPush();
    toast("Reports shared. Families have been told.");
    refresh();
  }
  return (
    <div className="sheet-actions">
      <span className="muted" style={{ fontSize: 13, marginRight: "auto" }}>
        Families only see a report once you share it.
      </span>
      <button className="btn primary" type="button" disabled={busy} onClick={go}>
        Share all {drafts.length} drafts
      </button>
    </div>
  );
}

/* ---------------------------------------------------------------- what families see */

export function ReportCard({ report, who, match }: { report: MatchReport; who: string; match: Match }) {
  const { data } = useApp();
  const [openDrill, setOpenDrill] = useState<string | null>(null);
  const moments = report.moments ?? [];
  const about = (x: ReportDrill) => {
    if (x.ref.startsWith("club:")) {
      const dr = data.drills.find((y) => y.id === x.ref.slice(5));
      return dr ? { text: dr.description, points: dr.points } : null;
    }
    const dr = LIBRARY_BY_KEY.get(x.ref.slice(4));
    return dr ? { text: dr.description, points: dr.points } : null;
  };
  return (
    <article className="mr-report" aria-label={`Match feedback for ${who}`}>
      <p className="eyebrow">Coach&apos;s feedback for {who}</p>
      {report.headline && <h3>{report.headline}</h3>}
      {report.went_well.length > 0 && (
        <section>
          <h4>What went well</h4>
          <ul className="mr-ticks">
            {report.went_well.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}
      {report.work_on.length > 0 && (
        <section>
          <h4>Next steps</h4>
          {report.work_on.map((w, i) => (
            <p key={i} className="mr-next">
              <b>{w.title}</b>
              {w.how && <> {w.how}</>}
            </p>
          ))}
        </section>
      )}
      {report.drills.length > 0 && (
        <section>
          <h4>Practise this</h4>
          <ul className="mr-drills">
            {report.drills.map((x) => {
              const a = about(x);
              return (
                <li key={x.ref}>
                  <button type="button" className="mr-drill-btn" aria-expanded={openDrill === x.ref} onClick={() => setOpenDrill(openDrill === x.ref ? null : x.ref)} disabled={!a}>
                    <b>{x.name}</b>
                    {x.why && <small>{x.why}</small>}
                  </button>
                  {openDrill === x.ref && a && (
                    <div className="mr-drill-about">
                      {a.text.split("\n\n").map((t, i) => (
                        <p key={i}>{t}</p>
                      ))}
                      {a.points.length > 0 && <p className="muted">Key points: {a.points.join(" · ")}</p>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}
      {moments.filter((m) => m.t).length > 0 && match.video_url && (
        <section>
          <h4>Watch back</h4>
          <ul className="mr-moments">
            {moments
              .filter((m) => m.t)
              .map((m, i) => (
                <li key={i}>
                  <span className="tnum">{m.t}</span> {m.note}
                </li>
              ))}
          </ul>
          <a className="mr-watch" href={match.video_url} target="_blank" rel="noopener noreferrer">
            ▶ Open the match video
          </a>
        </section>
      )}
      {report.coach_message && <p className="mr-note">&ldquo;{report.coach_message}&rdquo;</p>}
      <p className="mr-sign muted">
        {report.author_name ? `From ${report.author_name}` : "From the coaches"}
        {report.ai ? " · drafted with AI help and checked by your coach" : ""}
      </p>
    </article>
  );
}


/** A player's match feedback over the season (Development page). */
export function MatchFeedbackList({ playerId, who }: { playerId: string; who: string }) {
  const { data, open } = useApp();
  const pro = usePro();
  const [openId, setOpenId] = useState<string | null>(null);
  if (!pro) return null;
  const matches = new Map(data.matches.map((m) => [m.id, m]));
  const list = data.matchReports
    .filter((r) => r.player_id === playerId && r.status === "shared" && matches.has(r.match_id))
    .sort((a, b) => matches.get(b.match_id)!.date.localeCompare(matches.get(a.match_id)!.date));
  if (!list.length) return null;
  const short = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" });
  return (
    <section style={{ marginTop: 20 }}>
      <div className="phead" style={{ marginBottom: 12 }}>
        <h2 className="sec-title">Match feedback</h2>
      </div>
      <ul className="mr-list">
        {list.map((r) => {
          const m = matches.get(r.match_id)!;
          const isOpen = openId === r.id;
          return (
            <li key={r.id} className={`mr-player${isOpen ? " open" : ""}`}>
              <button type="button" className="mr-player-head" style={{ gridTemplateColumns: "56px 1fr auto" }} aria-expanded={isOpen} onClick={() => setOpenId(isOpen ? null : r.id)}>
                <span className="muted tnum" style={{ fontSize: 13 }}>
                  {short(m.date)}
                </span>
                <span className="mr-player-name">
                  <b>vs {m.opponent}</b>
                  <small className="muted">{r.headline || r.work_on[0]?.title || "Feedback from your coach"}</small>
                </span>
                <span aria-hidden="true" className="muted">
                  {isOpen ? "▴" : "▾"}
                </span>
              </button>
              {isOpen && (
                <div className="mr-body">
                  <ReportCard report={r} who={who} match={m} />
                  <button className="linkbtn" type="button" onClick={() => open({ kind: "match", id: m.id })} style={{ justifySelf: "start" }}>
                    Open the match
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
