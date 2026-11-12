"use client";

import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, SheetFrame } from "../sheets/SheetFrame";
import { ReplyButtons } from "../Replies";
import { Pitch } from "./Pitch";
import { pingPush } from "@/lib/push-client";
import { DEFAULT_LENGTH, FORMATIONS, FORMAT_LABEL, formationFor } from "@/lib/formations";
import { HA_LABEL, RESULT_WORD, resultOf } from "@/lib/matches";
import { errMsg, hhmm, parseD, todayIso } from "@/lib/format";
import type { HomeAway, Match, MatchFormat, MatchPlayer, MatchStatus, Player } from "@/lib/types";

const longDate = (d: string) => parseD(d).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
type Draft = {
  opponent: string;
  home_away: HomeAway;
  date: string;
  kickoff: string;
  meet_time: string;
  venue: string;
  competition: string;
  round: string;
  format: MatchFormat;
  length_mins: number;
  status: MatchStatus;
};

export function MatchSheet({ id, date }: { id: string | null; date?: string }) {
  const { data, team, canDo } = useApp();
  const match = id ? data.matches.find((m) => m.id === id) : null;
  if (id && !match) return <SheetFrame title="Match not found">This match has been deleted.</SheetFrame>;
  const teamId = match?.team_id ?? team?.id;
  if (!canDo("matches.edit", teamId)) return match ? <MatchView match={match} /> : <SheetFrame title="New match">You can&apos;t add matches for this team.</SheetFrame>;
  return <MatchEditor match={match ?? null} date={date} />;
}

/* ================================================================ coaches */

function MatchEditor({ match, date }: { match: Match | null; date?: string }) {
  const { data, team, refresh, close } = useApp();
  const [tab, setTab] = useState<"details" | "squad" | "result">(match ? (match.status === "played" || match.date < todayIso() ? "result" : "squad") : "details");
  const teamName = data.teams.find((t) => t.id === (match?.team_id ?? team?.id))?.name ?? "Your team";
  return (
    <SheetFrame title={match ? `${teamName} vs ${match.opponent}` : "New match"}>
      {match && (
        <div className="subtabs" role="tablist">
          {(
            [
              ["details", "Details"],
              ["squad", "Squad & line-up"],
              ["result", "Result & stats"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {l}
            </button>
          ))}
        </div>
      )}
      {tab === "details" && <DetailsForm match={match} date={date} onDone={() => (close(), refresh())} />}
      {tab === "squad" && match && <SquadPicker match={match} />}
      {tab === "result" && match && <ResultForm match={match} />}
    </SheetFrame>
  );
}

function DetailsForm({ match, date, onDone }: { match: Match | null; date?: string; onDone: () => void }) {
  const { team, supabase, toast } = useApp();
  const [d, setD] = useState<Draft>(() =>
    match
      ? {
          opponent: match.opponent,
          home_away: match.home_away,
          date: match.date,
          kickoff: hhmm(match.kickoff),
          meet_time: match.meet_time ? hhmm(match.meet_time) : "",
          venue: match.venue,
          competition: match.competition,
          round: match.round,
          format: match.format,
          length_mins: match.length_mins,
          status: match.status === "played" ? "played" : match.status,
        }
      : { opponent: "", home_away: "home", date: date ?? todayIso(), kickoff: "09:00", meet_time: "", venue: "", competition: "League", round: "", format: "11", length_mins: DEFAULT_LENGTH["11"], status: "scheduled" },
  );
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!d.opponent.trim()) return toast("Enter the opponent's name.");
    setBusy(true);
    const row = {
      opponent: d.opponent.trim(),
      home_away: d.home_away,
      date: d.date,
      kickoff: d.kickoff || "09:00",
      meet_time: d.meet_time || null,
      venue: d.venue.trim(),
      competition: d.competition.trim(),
      round: d.round.trim(),
      format: d.format,
      length_mins: Math.max(10, Math.min(150, Number(d.length_mins) || 60)),
      status: d.status,
    };
    const { error } = match ? await supabase.from("matches").update(row).eq("id", match.id) : await supabase.from("matches").insert({ ...row, team_id: team!.id });
    setBusy(false);
    if (error) return toast(errMsg(error));
    pingPush();
    toast(match ? "Match saved" : "Match added");
    onDone();
  }
  async function remove() {
    const { error } = await supabase.from("matches").delete().eq("id", match!.id);
    if (error) return toast(errMsg(error));
    pingPush();
    toast("Match deleted");
    onDone();
  }

  return (
    <form onSubmit={save} style={{ display: "grid", gap: 14 }}>
      <div className="row2">
        <label className="field">
          <span>Opponent</span>
          <input className="input" id="m-opp" required maxLength={80} value={d.opponent} onChange={(e) => set({ opponent: e.target.value })} placeholder="e.g. Rovers FC" />
        </label>
        <label className="field">
          <span>Home or away</span>
          <select className="input" id="m-ha" value={d.home_away} onChange={(e) => set({ home_away: e.target.value as HomeAway })}>
            <option value="home">Home</option>
            <option value="away">Away</option>
            <option value="neutral">Neutral ground</option>
          </select>
        </label>
        <label className="field">
          <span>Date</span>
          <input className="input" type="date" id="m-date" required value={d.date} onChange={(e) => set({ date: e.target.value })} />
        </label>
        <label className="field">
          <span>Kick-off</span>
          <input className="input" type="time" id="m-time" value={d.kickoff} onChange={(e) => set({ kickoff: e.target.value })} />
        </label>
        <label className="field">
          <span>Arrive by (optional)</span>
          <input className="input" type="time" id="m-meet" value={d.meet_time} onChange={(e) => set({ meet_time: e.target.value })} />
        </label>
        <label className="field">
          <span>Venue</span>
          <input className="input" id="m-venue" maxLength={120} value={d.venue} onChange={(e) => set({ venue: e.target.value })} placeholder="Ground and field" />
        </label>
        <label className="field">
          <span>Competition</span>
          <input className="input" id="m-comp" list="m-comp-list" maxLength={60} value={d.competition} onChange={(e) => set({ competition: e.target.value })} />
          <datalist id="m-comp-list">
            <option value="League" />
            <option value="Cup" />
            <option value="Friendly" />
            <option value="Gala day" />
            <option value="Tournament" />
          </datalist>
        </label>
        <label className="field">
          <span>Round (optional)</span>
          <input className="input" id="m-round" maxLength={30} value={d.round} onChange={(e) => set({ round: e.target.value })} placeholder="e.g. 5" />
        </label>
        <label className="field">
          <span>Match size</span>
          <select
            className="input"
            id="m-format"
            value={d.format}
            onChange={(e) => {
              const f = e.target.value as MatchFormat;
              set({ format: f, length_mins: d.length_mins === DEFAULT_LENGTH[d.format] ? DEFAULT_LENGTH[f] : d.length_mins });
            }}
          >
            {(["11", "9", "7", "5"] as MatchFormat[]).map((f) => (
              <option key={f} value={f}>
                {FORMAT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span>Length (minutes)</span>
          <input className="input" type="number" inputMode="numeric" id="m-length" min={10} max={150} value={d.length_mins} onChange={(e) => set({ length_mins: +e.target.value })} />
        </label>
        {match && match.status !== "played" && (
          <label className="field">
            <span>Status</span>
            <select className="input" id="m-status" value={d.status} onChange={(e) => set({ status: e.target.value as MatchStatus })}>
              <option value="scheduled">On</option>
              <option value="postponed">Postponed</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
        )}
      </div>
      <div className="sheet-actions">
        {match ? <ConfirmButton label="Delete match" onConfirm={remove} disabled={busy} /> : <span className="spacer" />}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Saving…" : match ? "Save details" : "Add match"}
        </button>
      </div>
    </form>
  );
}

type Pick = { role: "start" | "bench"; slot: number | null };

function SquadPicker({ match }: { match: Match }) {
  const { data, squad, squadOf, matchRepliesFor, supabase, refresh, toast } = useApp();
  const saved = squadOf(match.id);
  const [formationName, setFormationName] = useState(formationFor(match.format, match.formation).name);
  const formation = formationFor(match.format, formationName);
  const [picks, setPicks] = useState<Map<string, Pick>>(() => new Map(saved.map((r) => [r.player_id, { role: r.role, slot: r.role === "start" ? r.slot : null }])));
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [extra, setExtra] = useState<string[]>(() => saved.map((r) => r.player_id));
  const replies = matchRepliesFor(match.id);

  const teamPlayers = squad(match.team_id);
  const listIds = [...new Set([...teamPlayers.map((p) => p.id), ...extra])];
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const order = (p: Player) => {
    const r = replies.get(p.id);
    return p.status !== "available" ? 3 : r?.going ? 0 : !r ? 1 : 2;
  };
  const list = listIds
    .map((pid) => byId.get(pid))
    .filter((p): p is Player => !!p)
    .sort((a, b) => order(a) - order(b) || (a.shirt_number ?? 999) - (b.shirt_number ?? 999));
  const others = data.players.filter((p) => !listIds.includes(p.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));

  const bySlot = new Map<number, Player>();
  picks.forEach((v, pid) => {
    if (v.role === "start" && v.slot !== null && v.slot < formation.slots.length && byId.get(pid)) bySlot.set(v.slot, byId.get(pid)!);
  });
  const starters = [...picks.values()].filter((v) => v.role === "start").length;
  const bench = [...picks.values()].filter((v) => v.role === "bench").length;
  const yes = teamPlayers.filter((p) => replies.get(p.id)?.going).length;
  const no = teamPlayers.filter((p) => replies.get(p.id)?.going === false).length;

  function occupant(slot: number) {
    for (const [pid, v] of picks) if (v.role === "start" && v.slot === slot) return pid;
    return null;
  }
  function setRole(pid: string, role: "start" | "bench" | "out") {
    setPicks((prev) => {
      const next = new Map(prev);
      const mine = next.get(pid);
      if (role === "out") next.delete(pid);
      else if (role === "bench") next.set(pid, { role: "bench", slot: null });
      else {
        let slot = selected;
        if (slot === null) {
          slot = formation.slots.findIndex((_, i) => ![...next.entries()].some(([, v]) => v.role === "start" && v.slot === i));
          if (slot < 0) {
            toast("The line-up is full. Tap a spot on the pitch first to swap someone out.");
            return prev;
          }
        }
        const occ = [...next.entries()].find(([, v]) => v.role === "start" && v.slot === slot)?.[0];
        if (occ && occ !== pid) next.set(occ, mine?.role === "start" && mine.slot !== null ? { role: "start", slot: mine.slot } : { role: "bench", slot: null });
        next.set(pid, { role: "start", slot });
      }
      return next;
    });
    setSelected(null);
  }
  function pickSlot(slot: number) {
    if (selected === null || selected === slot) return setSelected(selected === slot ? null : slot);
    // Second tap on another spot swaps the two players.
    const a = occupant(selected);
    const b = occupant(slot);
    setPicks((prev) => {
      const next = new Map(prev);
      if (a) next.set(a, { role: "start", slot });
      if (b) next.set(b, { role: "start", slot: selected });
      return next;
    });
    setSelected(null);
  }
  function changeFormation(name: string) {
    const f = formationFor(match.format, name);
    setFormationName(f.name);
    setPicks((prev) => {
      const next = new Map(prev);
      next.forEach((v, pid) => {
        if (v.role === "start" && (v.slot === null || v.slot >= f.slots.length)) next.set(pid, { role: "bench", slot: null });
      });
      return next;
    });
  }

  async function save(announce: boolean) {
    setBusy(true);
    try {
      const keep = [...picks.keys()];
      const gone = saved.map((r) => r.player_id).filter((pid) => !picks.has(pid));
      if (gone.length) {
        const { error } = await supabase.from("match_players").delete().eq("match_id", match.id).in("player_id", gone);
        if (error) throw error;
      }
      if (keep.length) {
        const rows = keep.map((pid) => ({ match_id: match.id, player_id: pid, role: picks.get(pid)!.role, slot: picks.get(pid)!.role === "start" ? picks.get(pid)!.slot : null }));
        const { error } = await supabase.from("match_players").upsert(rows, { onConflict: "match_id,player_id" });
        if (error) throw error;
      }
      const { error } = await supabase
        .from("matches")
        .update({ formation: formation.name, ...(announce ? { squad_published: true } : {}) })
        .eq("id", match.id);
      if (error) throw error;
      if (announce) pingPush();
      toast(announce ? "Squad announced. Players and parents have been told." : "Squad saved");
      refresh();
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }

  const replyText = (p: Player) => {
    if (p.status !== "available") return <span className="rbadge no">{p.status === "injured" ? "Injured" : "Unavailable"}</span>;
    const r = replies.get(p.id);
    if (!r) return <span className="rbadge wait">No reply</span>;
    return r.going ? <span className="rbadge yes">✓ Available</span> : <span className="rbadge no">✕ Can&apos;t play{r.note ? `: ${r.note}` : ""}</span>;
  };

  return (
    <div className="squad-pick">
      <p className="muted" style={{ margin: 0, fontSize: 14 }}>
        {longDate(match.date)}, {hhmm(match.kickoff)} · {yes} available, {no} can&apos;t play, {teamPlayers.length - yes - no} haven&apos;t replied
      </p>
      <div className="squad-grid">
        <div style={{ display: "grid", gap: 10, alignContent: "start" }}>
          <label className="field" style={{ maxWidth: 220 }}>
            <span>Formation ({FORMAT_LABEL[match.format]})</span>
            <select className="input" id="m-formation" value={formation.name} onChange={(e) => changeFormation(e.target.value)}>
              {FORMATIONS[match.format].map((f) => (
                <option key={f.name} value={f.name}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
          <Pitch formation={formation} bySlot={bySlot} selected={selected} onPick={pickSlot} />
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            {selected !== null
              ? `Choose a player for ${formation.slots[selected].pos}, or tap another spot to swap them.`
              : "Tap Start next to a player to fill the next spot. Tap a spot first to choose who goes there."}
          </p>
        </div>
        <div style={{ display: "grid", gap: 6, alignContent: "start", minWidth: 0 }}>
          <div className="squad-count">
            <b>{starters}</b> of {formation.slots.length} starting · <b>{bench}</b> on the bench
          </div>
          <ul className="squad-list">
            {list.map((p) => {
              const v = picks.get(p.id);
              return (
                <li key={p.id}>
                  <span className="squad-name">
                    <span className="tnum muted">{p.shirt_number ?? "–"}</span>
                    <span style={{ minWidth: 0 }}>
                      <b>{p.full_name}</b>
                      {replyText(p)}
                    </span>
                  </span>
                  <span className="seg" role="group" aria-label={`${p.full_name} in this match`}>
                    <button type="button" aria-pressed={v?.role === "start"} onClick={() => setRole(p.id, "start")}>
                      Start
                    </button>
                    <button type="button" aria-pressed={v?.role === "bench"} onClick={() => setRole(p.id, "bench")}>
                      Bench
                    </button>
                    <button type="button" aria-pressed={!v} onClick={() => setRole(p.id, "out")}>
                      Out
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
          {others.length > 0 && (
            <label className="field">
              <span>Add a player from another team</span>
              <select
                className="input"
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  setExtra((x) => [...x, e.target.value]);
                  setPicks((prev) => new Map(prev).set(e.target.value, { role: "bench", slot: null }));
                }}
              >
                <option value="">Choose a player…</option>
                {others.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name} ({data.teams.find((t) => t.id === p.team_id)?.name ?? ""})
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
      </div>
      <div className="sheet-actions">
        <span className="muted" style={{ fontSize: 13, marginRight: "auto" }}>
          {match.squad_published ? "✓ Squad announced: players and parents can see it." : "Only coaches can see the squad until you announce it."}
        </span>
        <button className="btn" type="button" disabled={busy} onClick={() => save(false)}>
          Save
        </button>
        {!match.squad_published && (
          <button className="btn primary" type="button" disabled={busy || picks.size === 0} onClick={() => save(true)}>
            Save and announce squad
          </button>
        )}
      </div>
    </div>
  );
}

type StatRow = { minutes: string; goals: string; assists: string; yellow: string; red: string };

function ResultForm({ match }: { match: Match }) {
  const { data, squadOf, supabase, refresh, toast } = useApp();
  const rows = squadOf(match.id);
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const teamName = data.teams.find((t) => t.id === match.team_id)?.name ?? "Us";
  const [ours, setOurs] = useState(match.our_score?.toString() ?? "");
  const [theirs, setTheirs] = useState(match.their_score?.toString() ?? "");
  const [report, setReport] = useState(match.report);
  const [busy, setBusy] = useState(false);
  const sorted = useMemo(
    () =>
      [...rows].sort(
        (a, b) => (a.role === b.role ? 0 : a.role === "start" ? -1 : 1) || (a.slot ?? 99) - (b.slot ?? 99) || (byId.get(a.player_id)?.full_name ?? "").localeCompare(byId.get(b.player_id)?.full_name ?? ""),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows],
  );
  const [stats, setStats] = useState<Map<string, StatRow>>(
    () =>
      new Map(
        rows.map((r) => [
          r.player_id,
          {
            minutes: r.minutes !== null ? String(r.minutes) : r.role === "start" ? String(match.length_mins) : "",
            goals: r.goals ? String(r.goals) : "",
            assists: r.assists ? String(r.assists) : "",
            yellow: r.yellow ? String(r.yellow) : "",
            red: r.red ? String(r.red) : "",
          },
        ]),
      ),
  );
  const setStat = (pid: string, k: keyof StatRow, v: string) => setStats((m) => new Map(m).set(pid, { ...m.get(pid)!, [k]: v.replace(/[^\d]/g, "").slice(0, 3) }));
  const goalSum = [...stats.values()].reduce((n, s) => n + (+s.goals || 0), 0);
  const num = (v: string, max: number) => Math.max(0, Math.min(max, +v || 0));

  async function save() {
    if (ours === "" || theirs === "") return toast("Enter both scores.");
    setBusy(true);
    try {
      if (rows.length) {
        const up: MatchPlayer[] = rows.map((r) => {
          const s = stats.get(r.player_id)!;
          return {
            match_id: match.id,
            player_id: r.player_id,
            role: r.role,
            slot: r.slot,
            minutes: s.minutes === "" ? null : num(s.minutes, 150),
            goals: num(s.goals, 20),
            assists: num(s.assists, 20),
            yellow: num(s.yellow, 2),
            red: num(s.red, 1),
          };
        });
        const { error } = await supabase.from("match_players").upsert(up, { onConflict: "match_id,player_id" });
        if (error) throw error;
      }
      const { error } = await supabase
        .from("matches")
        .update({ status: "played", our_score: num(ours, 99), their_score: num(theirs, 99), report: report.trim() })
        .eq("id", match.id);
      if (error) throw error;
      pingPush();
      toast(match.status === "played" ? "Result updated" : "Result saved. The team has been told.");
      refresh();
    } catch (e) {
      toast(errMsg(e));
    }
    setBusy(false);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div className="score-row">
        <label className="field">
          <span>{teamName}</span>
          <input className="input score" inputMode="numeric" id="m-ours" value={ours} onChange={(e) => setOurs(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label={`${teamName} goals`} />
        </label>
        <span className="score-dash">–</span>
        <label className="field">
          <span>{match.opponent}</span>
          <input className="input score" inputMode="numeric" id="m-theirs" value={theirs} onChange={(e) => setTheirs(e.target.value.replace(/\D/g, "").slice(0, 2))} aria-label={`${match.opponent} goals`} />
        </label>
      </div>
      <label className="field">
        <span>Match report (everyone in the team can read it)</span>
        <textarea className="input" id="m-report" rows={3} maxLength={3000} value={report} onChange={(e) => setReport(e.target.value)} placeholder="How it went, standout moments, what we'll work on…" />
      </label>
      {rows.length ? (
        <div className="stats-wrap">
          <table className="stats-table">
            <thead>
              <tr>
                <th scope="col">Player</th>
                <th scope="col">Mins</th>
                <th scope="col">Goals</th>
                <th scope="col">Assists</th>
                <th scope="col" title="Yellow cards">YC</th>
                <th scope="col" title="Red cards">RC</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => {
                const p = byId.get(r.player_id);
                const s = stats.get(r.player_id)!;
                return (
                  <tr key={r.player_id}>
                    <th scope="row">
                      {p?.full_name ?? "Player"} <small className="muted">{r.role === "start" ? "" : "bench"}</small>
                    </th>
                    {(["minutes", "goals", "assists", "yellow", "red"] as const).map((k) => (
                      <td key={k}>
                        <input className="input stat" inputMode="numeric" value={s[k]} onChange={(e) => setStat(r.player_id, k, e.target.value)} aria-label={`${p?.full_name}: ${k}`} placeholder="0" />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted" style={{ margin: 0 }}>
          Pick the squad on the Squad tab to record minutes, goals and assists for each player. You can save just the score now.
        </p>
      )}
      {ours !== "" && rows.length > 0 && goalSum !== +ours && (
        <p className="series-note">
          Player goals add up to {goalSum}, but the score says {ours}. That&apos;s fine if there were own goals; otherwise check the scorers.
        </p>
      )}
      <div className="sheet-actions">
        <span className="spacer" />
        <button className="btn primary" type="button" disabled={busy} onClick={save}>
          {busy ? "Saving…" : match.status === "played" ? "Update result" : "Save result"}
        </button>
      </div>
    </div>
  );
}

/* ================================================================ everyone else */

export function MatchView({ match }: { match: Match }) {
  const { data, myPlayers, squadOf, kidName } = useApp();
  const teamName = data.teams.find((t) => t.id === match.team_id)?.name ?? "";
  const mine = myPlayers.filter((p) => p.team_ids.includes(match.team_id));
  const rows = squadOf(match.id);
  const byId = new Map(data.players.map((p) => [p.id, p]));
  const formation = formationFor(match.format, match.formation);
  const bySlot = new Map<number, Player>();
  rows.forEach((r) => r.role === "start" && r.slot !== null && byId.get(r.player_id) && bySlot.set(r.slot, byId.get(r.player_id)!));
  const bench = rows.filter((r) => r.role === "bench").map((r) => byId.get(r.player_id)).filter(Boolean) as Player[];
  const res = resultOf(match);
  const upcoming = match.date >= todayIso() && match.status === "scheduled";
  const scorers = rows.filter((r) => r.goals > 0).map((r) => `${byId.get(r.player_id)?.full_name ?? "Player"}${r.goals > 1 ? ` (${r.goals})` : ""}`);
  const parent = data.role === "parent";

  return (
    <SheetFrame title={`${teamName} vs ${match.opponent}`}>
      <div className="match-view">
        <p className="match-when">
          <b>{longDate(match.date)}</b>, kick-off {hhmm(match.kickoff)}
          {match.meet_time && <> · arrive by {hhmm(match.meet_time)}</>}
          <br />
          {HA_LABEL[match.home_away]}
          {match.venue && <> at {match.venue}</>}
          {(match.competition || match.round) && <> · {[match.competition, match.round && `Round ${match.round}`].filter(Boolean).join(", ")}</>}
        </p>
        {match.status === "postponed" && <p className="notice bad">This match has been postponed.</p>}
        {match.status === "cancelled" && <p className="notice bad">This match has been cancelled.</p>}
        {res && (
          <div className={`result-big ${res}`}>
            <span>{RESULT_WORD[res]}</span>
            <b className="tnum">
              {match.our_score}–{match.their_score}
            </b>
            {scorers.length > 0 && <small>Goals: {scorers.join(", ")}</small>}
          </div>
        )}
        {match.report && <p className="match-report">{match.report}</p>}
        {upcoming &&
          mine.map((p) => (
            <ReplyButtons key={p.id} matchId={match.id} playerId={p.id} label={parent ? `Can ${kidName(p)} play?` : "Can you play?"} who={parent ? kidName(p) : undefined} />
          ))}
        {rows.length > 0 ? (
          <>
            {mine.map((p) => {
              const r = rows.find((x) => x.player_id === p.id);
              const who = parent ? kidName(p) : "You";
              const text = !r ? `${who} ${parent ? "isn't" : "aren't"} in the squad this time.` : r.role === "start" ? `${who} ${parent ? "is" : "are"} starting${r.slot !== null && formation.slots[r.slot] ? ` (${formation.slots[r.slot].pos})` : ""}.` : `${who} ${parent ? "is" : "are"} on the bench.`;
              return (
                <p key={p.id} className="squad-me">
                  {text}
                  {r && res && (r.goals || r.assists) ? ` Scored ${r.goals}, assisted ${r.assists}.` : ""}
                </p>
              );
            })}
            <Pitch formation={formation} bySlot={bySlot} highlight={new Set(mine.map((p) => p.id))} />
            {bench.length > 0 && <p className="muted">Bench: {bench.map((p) => p.full_name).join(", ")}</p>}
          </>
        ) : (
          upcoming && <p className="muted">The squad hasn&apos;t been announced yet.</p>
        )}
      </div>
    </SheetFrame>
  );
}
