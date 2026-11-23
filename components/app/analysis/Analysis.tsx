"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { usePro, Upgrade } from "../Pro";
import { Tagger, MiniPitch, useCodes, loadEvents } from "./Tagger";
import { Reel } from "./Reel";
import { CodeWindow } from "./CodeWindow";
import { TrainingConsent } from "./TrainingConsent";
import { TeamSwitch } from "../matches/MatchReview";
import { SCOUT_SECTIONS, clock, kindLabel, type ClipPlaylist, type MatchEvent, type Period, type ScoutingReport } from "@/lib/analysis";
import { errMsg, parseD, todayIso } from "@/lib/format";
import type { Match, Team } from "@/lib/types";

/* Match analysis workspace (Pro, coaching staff only, teams with match review switched on):
 * tag matches, build clip playlists, the set-piece library and opposition scouting reports. */

type Tab = "matches" | "playlists" | "setpieces" | "scouting" | "codes";
const day = (d: string) => parseD(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });

export function AnalysisPage() {
  const { data, team, isAdmin } = useApp();
  const pro = usePro();
  const staff = ["admin", "coach", "assistant"].includes(data.role);
  const [tab, setTab] = useState<Tab>("matches");
  const [tagging, setTagging] = useState<Match | null>(null);

  if (!staff) return <div className="empty">Match analysis is for coaching staff.</div>;
  if (!team) return <div className="empty">Choose a team first.</div>;
  if (!pro)
    return (
      <div className="md-home">
        <h1>Analysis</h1>
        <Upgrade feature="Match analysis" blurb="Paste a Veo link and get the match auto-tagged, with stats, clips, set pieces, scouting and an analyst report. Coaching staff only." />
      </div>
    );
  if (!team.match_ai)
    return (
      <div className="md-home">
        <h1>Analysis</h1>
        {isAdmin ? (
          <TeamSwitch teamId={team.id} teamName={team.name} ageGroup={team.age_group ?? ""} on={false} />
        ) : (
          <p className="md-muted">Match analysis is switched off for {team.name}. Ask a club admin to turn it on for this team.</p>
        )}
      </div>
    );
  if (tagging) return <Tagger match={tagging} onClose={() => setTagging(null)} />;

  return (
    <div className="an">
      <div className="phead">
        <div>
          <span className="eyebrow">{team.name} · coaching staff only 🔒</span>
          <h1>Analysis</h1>
        </div>
      </div>
      <div className="subtabs" role="tablist">
        {(
          [
            ["matches", "Tag matches"],
            ["playlists", "Playlists"],
            ["setpieces", "Set pieces"],
            ["scouting", "Scouting"],
            ["codes", "Code window"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
            {l}
          </button>
        ))}
      </div>
      {tab === "matches" && (
        <>
          <MatchList team={team} onTag={setTagging} />
          <TrainingConsent team={team} />
          {isAdmin && <TeamSwitch teamId={team.id} teamName={team.name} ageGroup={team.age_group ?? ""} on />}
        </>
      )}
      {tab === "playlists" && <Playlists team={team} />}
      {tab === "setpieces" && <SetPieces team={team} />}
      {tab === "scouting" && <Scouting team={team} />}
      {tab === "codes" && <CodeWindow team={team} />}
    </div>
  );
}

/** All tagged events for the team's matches (RLS keeps it to coaching staff). */
function useTeamEvents(team: Team) {
  const { data, supabase } = useApp();
  const [events, setEvents] = useState<MatchEvent[] | null>(null);
  const [periods, setPeriods] = useState<Record<string, Period[]>>({});
  const ids = useMemo(() => data.matches.filter((m) => m.team_id === team.id).map((m) => m.id), [data.matches, team.id]);
  const load = useCallback(async () => {
    const { rows } = await loadEvents(supabase, ids);
    setEvents(rows);
    if (ids.length) {
      const { data: pr } = await supabase.from("match_analysis").select("match_id,periods").in("match_id", ids);
      setPeriods(Object.fromEntries(((pr ?? []) as { match_id: string; periods: Period[] }[]).map((r) => [r.match_id, r.periods])));
    }
  }, [supabase, ids]);
  useEffect(() => {
    load();
  }, [load]);
  return { events, periods, reload: load };
}

/* ---------------------------------------------------------------- matches */

function MatchList({ team, onTag }: { team: Team; onTag: (m: Match) => void }) {
  const { data } = useApp();
  const { events } = useTeamEvents(team);
  const today = todayIso();
  const list = data.matches.filter((m) => m.team_id === team.id && (m.status === "played" || m.date <= today)).sort((a, b) => b.date.localeCompare(a.date));
  const count = (id: string) => events?.filter((e) => e.match_id === id).length ?? 0;
  if (!list.length) return <p className="md-muted">No played matches yet.</p>;
  return (
    <ul className="an-list">
      {list.map((m) => (
        <li key={m.id}>
          <div>
            <b>vs {m.opponent}</b>
            <small className="muted">
              {day(m.date)}
              {m.our_score !== null && m.their_score !== null && ` · ${m.our_score}–${m.their_score}`}
              {m.video_url ? " · video linked" : " · no video link"}
              {events && ` · ${count(m.id)} tags`}
            </small>
          </div>
          <button className="btn primary sm" type="button" onClick={() => onTag(m)}>
            {count(m.id) ? "Keep tagging" : "Tag this match"}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* ---------------------------------------------------------------- playlists */

function Playlists({ team }: { team: Team }) {
  const { data, supabase, toast } = useApp();
  const { events, periods } = useTeamEvents(team);
  const { codes } = useCodes(team.id);
  const [lists, setLists] = useState<ClipPlaylist[]>([]);
  const [playing, setPlaying] = useState<MatchEvent[] | null>(null);
  const [f, setF] = useState({ kind: "", team: "us", player: "", match: "" });
  const [title, setTitle] = useState("");

  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.from("clip_playlists").select("id,team_id,title,note,items,updated_at").eq("team_id", team.id).order("updated_at", { ascending: false });
    if (error && /clip_playlists/.test(error.message)) toast("Run update 38 in Supabase first.");
    setLists((rows ?? []) as ClipPlaylist[]);
  }, [supabase, team.id, toast]);
  useEffect(() => {
    load();
  }, [load]);

  const byId = new Map((events ?? []).map((e) => [e.id, e]));
  const picked = (events ?? []).filter((e) => (!f.kind || e.kind === f.kind) && (!f.team || e.team === f.team) && (!f.player || e.player_id === f.player) && (!f.match || e.match_id === f.match));
  const matches = data.matches.filter((m) => m.team_id === team.id);
  const players = data.players.filter((p) => p.team_ids.includes(team.id));

  async function save() {
    if (!title.trim()) return toast("Give the playlist a name.");
    if (!picked.length) return toast("No clips match.");
    const { error } = await supabase.from("clip_playlists").insert({ team_id: team.id, title: title.trim().slice(0, 80), items: picked.slice(0, 200).map((e) => ({ event_id: e.id })) });
    if (error) return toast(errMsg(error));
    setTitle("");
    toast("Playlist saved");
    load();
  }
  async function del(id: string) {
    if (!window.confirm("Delete this playlist? The tags stay.")) return;
    await supabase.from("clip_playlists").delete().eq("id", id);
    load();
  }

  if (playing) return <Reel clips={playing} codes={codes} periods={periods} onClose={() => setPlaying(null)} />;
  return (
    <div className="an-cols">
      <section className="in-card">
        <div className="in-h">
          <h2>Make a playlist</h2>
        </div>
        <div className="an-filter">
          <select className="input" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} aria-label="Event">
            <option value="">Any event</option>
            {codes.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
          <select className="input" value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} aria-label="Team">
            <option value="us">Us</option>
            <option value="them">Opponents</option>
            <option value="">Both</option>
          </select>
          <select className="input" value={f.player} onChange={(e) => setF({ ...f, player: e.target.value })} aria-label="Player">
            <option value="">Any player</option>
            {players.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name}
              </option>
            ))}
          </select>
          <select className="input" value={f.match} onChange={(e) => setF({ ...f, match: e.target.value })} aria-label="Match">
            <option value="">All matches</option>
            {matches.map((m) => (
              <option key={m.id} value={m.id}>
                {day(m.date)} vs {m.opponent}
              </option>
            ))}
          </select>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          {events === null ? "Loading tags…" : `${picked.length} clip${picked.length === 1 ? "" : "s"} match.`}
        </p>
        <div className="mr-inline">
          <input className="input" maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Our final-third entries, last 3 games" aria-label="Playlist name" />
          <button className="btn" type="button" disabled={!picked.length} onClick={() => setPlaying(picked)}>
            Watch
          </button>
          <button className="btn primary" type="button" disabled={!picked.length} onClick={save}>
            Save
          </button>
        </div>
      </section>
      <section className="in-card">
        <div className="in-h">
          <h2>Saved playlists</h2>
        </div>
        {lists.length === 0 ? (
          <p className="md-muted">None yet.</p>
        ) : (
          <ul className="an-list">
            {lists.map((l) => {
              const clips = l.items.map((it) => byId.get(it.event_id)).filter((e): e is MatchEvent => !!e);
              return (
                <li key={l.id}>
                  <div>
                    <b>{l.title}</b>
                    <small className="muted">{clips.length} clips</small>
                  </div>
                  <span className="mr-inline">
                    <button className="btn primary sm" type="button" disabled={!clips.length} onClick={() => setPlaying(clips)}>
                      Play
                    </button>
                    <button className="linkbtn" type="button" onClick={() => del(l.id)}>
                      Delete
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- set pieces */

function SetPieces({ team }: { team: Team }) {
  const { events, periods } = useTeamEvents(team);
  const { codes } = useCodes(team.id);
  const [side, setSide] = useState<"us" | "them">("us");
  const [playing, setPlaying] = useState<MatchEvent[] | null>(null);
  if (playing) return <Reel clips={playing} codes={codes} periods={periods} onClose={() => setPlaying(null)} />;
  const spKinds = new Set([...codes.filter((c) => c.setPiece).map((c) => c.key), "corner", "free_kick", "throw_in"]);
  const sp = (events ?? []).filter((e) => spKinds.has(e.kind) && e.team === side);
  const groups = new Map<string, MatchEvent[]>();
  sp.forEach((e) => {
    const k = `${e.kind}|${e.routine || "No routine named"}`;
    groups.set(k, [...(groups.get(k) ?? []), e]);
  });
  const rows = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
  return (
    <section className="in-card">
      <div className="in-h">
        <h2>Set-piece library</h2>
        <div className="seg" role="group" aria-label="Whose set pieces">
          <button type="button" aria-pressed={side === "us"} onClick={() => setSide("us")}>
            Ours
          </button>
          <button type="button" aria-pressed={side === "them"} onClick={() => setSide("them")}>
            Opponents&apos;
          </button>
        </div>
      </div>
      {events === null ? (
        <p className="md-muted">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="md-muted">No set pieces tagged yet. Tag corners (K), free kicks (R) and long throws (H), and name the routine.</p>
      ) : (
        <table className="vsn-table">
          <thead>
            <tr>
              <th scope="col">Routine</th>
              <th scope="col">Times</th>
              <th scope="col">Led to a shot</th>
              <th scope="col">Goals</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, list]) => {
              const [kind, routine] = k.split("|");
              const shots = list.filter((e) => e.outcome === "shot" || e.outcome === "goal").length;
              const goals = list.filter((e) => e.outcome === "goal").length;
              return (
                <tr key={k}>
                  <th scope="row">
                    {routine} <small className="muted">{kindLabel(kind, codes)}</small>
                  </th>
                  <td className="tnum">{list.length}</td>
                  <td className="tnum">{Math.round((100 * shots) / list.length)}%</td>
                  <td className="tnum">{goals}</td>
                  <td>
                    <button className="btn sm" type="button" onClick={() => setPlaying(list)}>
                      Watch
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- scouting */

function Scouting({ team }: { team: Team }) {
  const { data, supabase, toast } = useApp();
  const { events, periods } = useTeamEvents(team);
  const [reports, setReports] = useState<ScoutingReport[]>([]);
  const [open, setOpen] = useState<ScoutingReport | null>(null);
  const [opp, setOpp] = useState("");
  const load = useCallback(async () => {
    const { data: rows, error } = await supabase.from("scouting_reports").select("id,team_id,opponent,match_id,formation,sections,key_players,clips,updated_at").eq("team_id", team.id).order("updated_at", { ascending: false });
    if (error && /scouting_reports/.test(error.message)) toast("Run update 38 in Supabase first.");
    setReports((rows ?? []) as ScoutingReport[]);
  }, [supabase, team.id, toast]);
  useEffect(() => {
    load();
  }, [load]);
  const opponents = [...new Set(data.matches.filter((m) => m.team_id === team.id).map((m) => m.opponent))].sort();

  async function create() {
    const name = opp.trim();
    if (!name) return toast("Enter the opponent.");
    const next = data.matches.filter((m) => m.team_id === team.id && m.opponent === name && m.date >= todayIso()).sort((a, b) => a.date.localeCompare(b.date))[0];
    const { data: row, error } = await supabase
      .from("scouting_reports")
      .insert({ team_id: team.id, opponent: name.slice(0, 80), match_id: next?.id ?? null })
      .select("id,team_id,opponent,match_id,formation,sections,key_players,clips,updated_at")
      .single();
    if (error) return toast(errMsg(error));
    setOpp("");
    setOpen(row as ScoutingReport);
    load();
  }

  if (open) return <ScoutEditor report={open} events={events ?? []} periods={periods} team={team} onClose={() => (setOpen(null), load())} />;
  return (
    <div className="an-cols">
      <section className="in-card">
        <div className="in-h">
          <h2>New scouting report</h2>
        </div>
        <div className="mr-inline">
          <input className="input" list="an-opps" maxLength={80} value={opp} onChange={(e) => setOpp(e.target.value)} placeholder="Opponent" aria-label="Opponent" />
          <datalist id="an-opps">
            {opponents.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
          <button className="btn primary" type="button" onClick={create}>
            Start
          </button>
        </div>
        <p className="muted" style={{ margin: 0, fontSize: 13 }}>
          Tag their events (press T for their team) when you watch your games against them, or their games against others, and the report pulls their numbers and clips in.
        </p>
      </section>
      <section className="in-card">
        <div className="in-h">
          <h2>Reports</h2>
        </div>
        {reports.length === 0 ? (
          <p className="md-muted">None yet.</p>
        ) : (
          <ul className="an-list">
            {reports.map((r) => {
              const m = data.matches.find((x) => x.id === r.match_id);
              return (
                <li key={r.id}>
                  <div>
                    <b>{r.opponent}</b>
                    <small className="muted">{m ? `For ${day(m.date)}` : "No fixture linked"}</small>
                  </div>
                  <button className="btn sm" type="button" onClick={() => setOpen(r)}>
                    Open
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function ScoutEditor({ report, events, periods, team, onClose }: { report: ScoutingReport; events: MatchEvent[]; periods: Record<string, Period[]>; team: Team; onClose: () => void }) {
  const { data, supabase, toast } = useApp();
  const { codes } = useCodes(team.id);
  const [r, setR] = useState(report);
  const [busy, setBusy] = useState(false);
  const [playing, setPlaying] = useState<MatchEvent[] | null>(null);
  const vsIds = new Set(data.matches.filter((m) => m.team_id === team.id && m.opponent === r.opponent).map((m) => m.id));
  const theirs = events.filter((e) => vsIds.has(e.match_id) && e.team === "them");
  const count = (k: string, o?: string) => theirs.filter((e) => e.kind === k && (!o || e.outcome === o)).length;
  const byId = new Map(events.map((e) => [e.id, e]));
  const attached = r.clips.map((c) => byId.get(c.event_id)).filter((e): e is MatchEvent => !!e);
  const fixtures = data.matches.filter((m) => m.team_id === team.id && m.opponent === r.opponent).sort((a, b) => b.date.localeCompare(a.date));

  async function save(close = false) {
    setBusy(true);
    const { error } = await supabase
      .from("scouting_reports")
      .update({ opponent: r.opponent, match_id: r.match_id, formation: r.formation, sections: r.sections, key_players: r.key_players.filter((k) => k.name || k.note || k.shirt !== null), clips: r.clips })
      .eq("id", r.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    toast("Report saved");
    if (close) onClose();
  }
  async function del() {
    if (!window.confirm(`Delete the ${r.opponent} report?`)) return;
    await supabase.from("scouting_reports").delete().eq("id", r.id);
    onClose();
  }
  const toggleClip = (id: string) => setR((x) => ({ ...x, clips: x.clips.some((c) => c.event_id === id) ? x.clips.filter((c) => c.event_id !== id) : [...x.clips, { event_id: id }].slice(0, 60) }));

  if (playing) return <Reel clips={playing} codes={codes} periods={periods} title={`${r.opponent} report`} onClose={() => setPlaying(null)} />;
  return (
    <div className="sc">
      <div className="phead sc-noprint">
        <button className="linkbtn" type="button" onClick={() => save(true)}>
          ← Save and close
        </button>
        <span className="mr-inline">
          <button className="btn sm" type="button" onClick={() => window.print()}>
            Print / PDF
          </button>
          <button className="btn primary sm" type="button" disabled={busy} onClick={() => save()}>
            {busy ? "Saving…" : "Save"}
          </button>
        </span>
      </div>
      <article className="sc-doc">
        <header className="sc-head">
          <span className="eyebrow">{team.name} · opposition report · coaching staff only</span>
          <h1>{r.opponent}</h1>
          <div className="row2">
            <label className="field">
              <span>For the match</span>
              <select className="input" value={r.match_id ?? ""} onChange={(e) => setR({ ...r, match_id: e.target.value || null })}>
                <option value="">Not linked</option>
                {fixtures.map((m) => (
                  <option key={m.id} value={m.id}>
                    {day(m.date)}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Their usual shape</span>
              <input className="input" maxLength={20} value={r.formation} onChange={(e) => setR({ ...r, formation: e.target.value })} placeholder="e.g. 4-2-3-1" />
            </label>
          </div>
        </header>

        {theirs.length > 0 && (
          <section className="sc-sec">
            <h2>From our tagged games against them</h2>
            <p className="sc-nums">
              <span>
                <b className="tnum">{count("shot")}</b> shots ({count("shot", "on target")} on target)
              </span>
              <span>
                <b className="tnum">{count("box_entry")}</b> box entries
              </span>
              <span>
                <b className="tnum">{count("turnover_won")}</b> balls won
              </span>
              <span>
                <b className="tnum">{count("corner")}</b> corners
              </span>
            </p>
            <div className="sc-pitches">
              <figure>
                <MiniPitch x={null} y={null} dots={theirs.filter((e) => e.kind === "shot" || e.kind === "goal").map((e) => ({ x: e.x === null ? null : 100 - e.x, y: e.y, team: "them" }))} />
                <figcaption className="muted">Where they shoot from (they attack →)</figcaption>
              </figure>
              <figure>
                <MiniPitch x={null} y={null} dots={theirs.filter((e) => e.kind === "turnover_won").map((e) => ({ x: e.x === null ? null : 100 - e.x, y: e.y, team: "them" }))} />
                <figcaption className="muted">Where they win the ball</figcaption>
              </figure>
            </div>
          </section>
        )}

        {SCOUT_SECTIONS.map((s) => (
          <section key={s.key} className="sc-sec">
            <h2>{s.label}</h2>
            <textarea className="input" rows={s.key === "how_to_beat" ? 3 : 4} maxLength={3000} value={r.sections[s.key] ?? ""} onChange={(e) => setR({ ...r, sections: { ...r.sections, [s.key]: e.target.value } })} placeholder={s.hint} />
            <p className="sc-print">{r.sections[s.key]}</p>
          </section>
        ))}

        <section className="sc-sec">
          <h2>Key players</h2>
          {r.key_players.map((k, i) => (
            <div className="sc-kp" key={i}>
              <input className="input" inputMode="numeric" value={k.shirt ?? ""} onChange={(e) => setR({ ...r, key_players: r.key_players.map((x, j) => (j === i ? { ...x, shirt: e.target.value ? Math.min(99, Number(e.target.value.replace(/\D/g, ""))) : null } : x)) })} placeholder="#" aria-label="Shirt number" />
              <input className="input" maxLength={60} value={k.name} onChange={(e) => setR({ ...r, key_players: r.key_players.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} placeholder="Name or position" aria-label="Name" />
              <input className="input" maxLength={200} value={k.note} onChange={(e) => setR({ ...r, key_players: r.key_players.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)) })} placeholder="Strong left foot, drifts inside" aria-label="Note" />
              <button className="icon-btn sc-noprint" type="button" aria-label="Remove" onClick={() => setR({ ...r, key_players: r.key_players.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}
          {r.key_players.length < 20 && (
            <button className="linkbtn sc-noprint" type="button" onClick={() => setR({ ...r, key_players: [...r.key_players, { shirt: null, name: "", note: "" }] })}>
              + Add a player
            </button>
          )}
        </section>

        <section className="sc-sec sc-noprint">
          <h2>Clips ({attached.length})</h2>
          {attached.length > 0 && (
            <button className="btn sm" type="button" onClick={() => setPlaying(attached)} style={{ justifySelf: "start" }}>
              Watch the report&apos;s clips
            </button>
          )}
          {theirs.length === 0 ? (
            <p className="muted" style={{ margin: 0 }}>
              No tags of {r.opponent} yet. Tag their events (press T) in a game against them.
            </p>
          ) : (
            <ul className="sc-clips">
              {theirs.map((e) => (
                <li key={e.id}>
                  <label className="check">
                    <input type="checkbox" checked={r.clips.some((c) => c.event_id === e.id)} onChange={() => toggleClip(e.id)} />
                    <span>
                      {kindLabel(e.kind, codes)} <small className="muted">{[clock(e.t), e.shirt !== null ? `#${e.shirt}` : "", e.outcome, e.routine, e.note].filter(Boolean).join(" · ")}</small>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
        </section>
        <button className="linkbtn sc-noprint" type="button" onClick={del}>
          Delete this report
        </button>
      </article>
    </div>
  );
}
