"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { Reel } from "../analysis/Reel";
import { errMsg } from "@/lib/format";
import type { MatchEvent } from "@/lib/analysis";
import type { AnalystReport as Report, Match, VideoJob } from "@/lib/types";

/* The AI analyst report (coaching staff only): Claude reviews the key moments of the match video and the
 * numbers, and writes the post-match analysis a qualified performance analyst would. */

const SECTION_ORDER = ["in_possession", "out_of_possession", "attacking_transition", "defensive_transition", "set_pieces", "opposition"];
const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  return s >= 3600 ? `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!j.ok) throw new Error((j.error as string) || "Something went wrong.");
  return j;
}

export function AnalystReport({ job, match }: { job: VideoJob; match: Match }) {
  const { data, isAdmin } = useApp();
  const team = data.teams.find((t) => t.id === match.team_id);
  const r = job.results!;
  const [again, setAgain] = useState(false);
  if (job.our_team === null) return null;
  if (!team?.video_ai) return isAdmin ? <VideoAiSwitch teamId={match.team_id} teamName={team?.name ?? "this team"} ageGroup={team?.age_group ?? ""} /> : <p className="muted vs-note">AI analyst reports aren&apos;t switched on for this team. A club admin can turn them on.</p>;
  if (r.report_pending)
    return (
      <div className="vs-prog ar">
        <h4 className="vs-h">AI analyst report</h4>
        <div className="vs-bar">
          <span style={{ width: "55%" }} />
        </div>
        <p>Claude is reviewing {r.key?.moments?.length ?? "the"} key moments and the match numbers. This takes 2–4 minutes; you can leave this page.</p>
      </div>
    );
  if (r.report && !again) return <ReportView report={r.report} job={job} match={match} onAgain={() => setAgain(true)} />;
  return <Brief job={job} match={match} onSent={() => setAgain(false)} />;
}

function VideoAiSwitch({ teamId, teamName, ageGroup }: { teamId: string; teamName: string; ageGroup: string }) {
  const { supabase, patch, toast } = useApp();
  const [ok, setOk] = useState(false);
  const [busy, setBusy] = useState(false);
  async function on() {
    setBusy(true);
    const { error } = await supabase.from("teams").update({ video_ai: true }).eq("id", teamId);
    setBusy(false);
    if (error) return toast(/video_ai/.test(error.message) ? "Run update 40 in Supabase first." : errMsg(error));
    patch((d) => ({ ...d, teams: d.teams.map((t) => (t.id === teamId ? { ...t, video_ai: true } : t)) }));
    toast(`AI analyst reports are on for ${teamName}`);
  }
  return (
    <section className="ar mr-ai">
      <h4 className="vs-h">AI analyst report for {teamName}</h4>
      <p>
        Overlap can write the post-match analysis a qualified performance analyst would: how both teams played in and out of possession, transitions, set pieces, the key moments with timestamps, and what to work on at training.
      </p>
      <p className="muted">
        To do this, <b>short frame strips from the key moments of the video are sent to Anthropic&apos;s Claude</b>, which looks at them alongside the match numbers. Anthropic doesn&apos;t use them to train its AI. The report is for coaching staff only. Check this fits your club&apos;s photo and filming consent{ageGroup ? ` and the rules for ${ageGroup}` : ""} before switching it on.
      </p>
      <label className="check">
        <input type="checkbox" checked={ok} onChange={(e) => setOk(e.target.checked)} />
        <span>Our filming consent covers this for {teamName}.</span>
      </label>
      <button className="btn primary" type="button" disabled={!ok || busy} onClick={on} style={{ justifySelf: "start" }}>
        Turn on AI analyst reports
      </button>
    </section>
  );
}

function Brief({ job, match, onSent }: { job: VideoJob; match: Match; onSent: () => void }) {
  const { toast, refresh } = useApp();
  const prev = job.results?.report_context ?? {};
  const [ctx, setCtx] = useState({
    score: prev.score ?? (match.our_score !== null && match.their_score !== null ? `${match.our_score}-${match.their_score}` : ""),
    formation: prev.formation ?? match.formation ?? "",
    plan: prev.plan ?? "",
    notes: prev.notes ?? "",
  });
  const [busy, setBusy] = useState(false);
  async function go() {
    setBusy(true);
    try {
      await post("/api/match-video/report", { job_id: job.id, context: ctx });
      toast("Writing the analyst report…");
      onSent();
      refresh();
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }
  return (
    <section className="ar">
      <h4 className="vs-h">AI analyst report</h4>
      <p>Brief the analyst like you would after the game. The more it knows about your plan, the more useful the report.</p>
      {job.results?.report_error && <p className="notice bad">{job.results.report_error}</p>}
      <div className="row2">
        <label className="field">
          <span>Result (us–them)</span>
          <input className="input" maxLength={20} value={ctx.score} onChange={(e) => setCtx({ ...ctx, score: e.target.value })} placeholder="e.g. 2-1" />
        </label>
        <label className="field">
          <span>Our formation</span>
          <input className="input" maxLength={20} value={ctx.formation} onChange={(e) => setCtx({ ...ctx, formation: e.target.value })} placeholder="e.g. 4-3-3" />
        </label>
      </div>
      <label className="field">
        <span>Our game plan</span>
        <textarea className="input" rows={2} maxLength={600} value={ctx.plan} onChange={(e) => setCtx({ ...ctx, plan: e.target.value })} placeholder="e.g. Press their centre-backs, build through the 6, attack the space behind their left-back." />
      </label>
      <label className="field">
        <span>Anything else (injuries, conditions, what you want looked at)</span>
        <textarea className="input" rows={2} maxLength={600} value={ctx.notes} onChange={(e) => setCtx({ ...ctx, notes: e.target.value })} placeholder="e.g. Windy second half. Keen to see how our back four held its line." />
      </label>
      <button className="btn primary" type="button" disabled={busy} onClick={go} style={{ justifySelf: "start" }}>
        {busy ? "Sending…" : "Write the analyst report"}
      </button>
      <small className="muted">Uses the {job.results?.key?.moments?.length ?? 0} key moments found in the video. Coaching staff only.</small>
    </section>
  );
}

function ReportView({ report, job, match, onAgain }: { report: Report; job: VideoJob; match: Match; onAgain: () => void }) {
  const { data } = useApp();
  const [playing, setPlaying] = useState<MatchEvent[] | null>(null);
  const teamName = data.teams.find((t) => t.id === match.team_id)?.name ?? "Us";
  const byId = new Map(report.key_moments.map((k) => [k.id, k]));
  const raw = new Map((job.results?.key?.moments ?? []).map((m) => [m.id, m]));
  const asClip = (id: string): MatchEvent | null => {
    const k = byId.get(id);
    const m = raw.get(id);
    const t = k?.t ?? m?.t;
    if (t === undefined) return null;
    return {
      id: `ai-${id}`,
      match_id: match.id,
      t,
      kind: "note",
      team: (k?.team ?? m?.team) === job.our_team ? "us" : "them",
      player_id: null,
      shirt: null,
      x: null,
      y: null,
      outcome: "",
      routine: "",
      note: k?.coaching_point ?? "",
      pre: 5,
      post: 5,
      title: k ? `${id} · ${k.title}` : id,
      drawing: null,
      created_at: "",
    };
  };
  const watch = (ids: string[]) => {
    const clips = ids.map(asClip).filter((c): c is MatchEvent => !!c);
    if (clips.length) setPlaying(clips);
  };
  const Chips = ({ ids }: { ids: string[] }) =>
    ids.length ? (
      <span className="ar-chips">
        {ids.map((id) => (
          <button key={id} type="button" className="ar-chip" onClick={() => watch([id])}>
            ▶ {id} {raw.get(id) ? clock(raw.get(id)!.t) : ""}
          </button>
        ))}
      </span>
    ) : null;
  if (playing) return <Reel clips={playing} onClose={() => setPlaying(null)} noTrim title="AI analyst report" />;
  const sections = [...report.sections].sort((a, b) => SECTION_ORDER.indexOf(a.key) - SECTION_ORDER.indexOf(b.key));
  return (
    <article className="ar ar-doc">
      <header className="ar-head">
        <span className="eyebrow">AI analyst report · {teamName} vs {match.opponent} · coaching staff only</span>
        <h3>{report.headline}</h3>
      </header>
      {report.summary.length > 0 && (
        <section>
          <h4>Summary</h4>
          <ul className="ar-list">
            {report.summary.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </section>
      )}
      {sections.map((s) =>
        s.points.length ? (
          <section key={s.key}>
            <h4>{s.title}</h4>
            <ul className="ar-list">
              {s.points.map((p, i) => (
                <li key={i}>
                  {p.text} <Chips ids={p.moments} />
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {report.key_moments.length > 0 && (
        <section>
          <div className="ar-row">
            <h4>Key moments</h4>
            <button className="btn sm ar-noprint" type="button" onClick={() => watch(report.key_moments.map((k) => k.id))}>
              ▶ Watch all {report.key_moments.length}
            </button>
          </div>
          <ol className="ar-moments">
            {report.key_moments.map((k) => (
              <li key={k.id} className={k.verdict}>
                <button type="button" className="ar-t tnum" onClick={() => watch([k.id])}>
                  ▶ {clock(k.t)}
                </button>
                <div>
                  <b>{k.title}</b>
                  <p>{k.what_happened}</p>
                  <p className="ar-cp">
                    <span>Coaching point:</span> {k.coaching_point}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
      {report.periods && (
        <section>
          <h4>How the game changed</h4>
          <p>{report.periods}</p>
        </section>
      )}
      {report.players.length > 0 && (
        <section>
          <h4>Players</h4>
          <ul className="ar-list">
            {report.players.map((p, i) => (
              <li key={i}>
                <b>
                  {p.team === "us" ? teamName : match.opponent} #{p.shirt}:
                </b>{" "}
                {p.note}
              </li>
            ))}
          </ul>
        </section>
      )}
      {report.training_focus.length > 0 && (
        <section>
          <h4>What to work on</h4>
          <ol className="ar-list">
            {report.training_focus.map((f, i) => (
              <li key={i}>
                <b>{f.theme}.</b> {f.why}
                {f.drills.length > 0 && <span className="muted"> Drills: {f.drills.map((d) => d.name).join(", ")}.</span>}
              </li>
            ))}
          </ol>
        </section>
      )}
      {report.questions.length > 0 && (
        <section>
          <h4>Questions for the coaching staff</h4>
          <ul className="ar-list">
            {report.questions.map((q, i) => (
              <li key={i}>{q}</li>
            ))}
          </ul>
        </section>
      )}
      <p className="muted ar-conf">
        {report.confidence} Written by AI from the video&apos;s key moments and tracking numbers: check the clips before acting on it.
      </p>
      <div className="mr-inline ar-noprint" style={{ justifyContent: "space-between" }}>
        <button className="linkbtn" type="button" onClick={onAgain}>
          Brief and write again
        </button>
        <button className="btn sm" type="button" onClick={() => window.print()}>
          Print / PDF
        </button>
      </div>
      <small className="muted ar-noprint">The key moments are also on the Analysis page as tags (&ldquo;AI report&rdquo;), ready to present.</small>
    </article>
  );
}
