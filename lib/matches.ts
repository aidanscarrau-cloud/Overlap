import type { HomeAway, Match, MatchPlayer } from "./types";

export type Result = "W" | "D" | "L";
export const RESULT_WORD: Record<Result, string> = { W: "Win", D: "Draw", L: "Loss" };
export const HA_LABEL: Record<HomeAway, string> = { home: "Home", away: "Away", neutral: "Neutral" };

export function resultOf(m: Match): Result | null {
  if (m.status !== "played" || m.our_score === null || m.their_score === null) return null;
  return m.our_score > m.their_score ? "W" : m.our_score === m.their_score ? "D" : "L";
}

export const seasonOf = (m: Pick<Match, "date">) => m.date.slice(0, 4);

export type Record_ = { played: number; won: number; drawn: number; lost: number; gf: number; ga: number; form: { r: Result; m: Match }[] };
/** Played, won, drawn, lost, goals and the last five results (newest last). */
export function teamRecord(ms: Match[]): Record_ {
  const played = ms.filter((m) => resultOf(m)).sort((a, b) => (a.date + a.kickoff).localeCompare(b.date + b.kickoff));
  const rec: Record_ = { played: played.length, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, form: [] };
  for (const m of played) {
    const r = resultOf(m)!;
    if (r === "W") rec.won++;
    else if (r === "D") rec.drawn++;
    else rec.lost++;
    rec.gf += m.our_score!;
    rec.ga += m.their_score!;
  }
  rec.form = played.slice(-5).map((m) => ({ r: resultOf(m)!, m }));
  return rec;
}

export type PlayerTotals = { apps: number; starts: number; minutes: number; goals: number; assists: number; yellow: number; red: number };
export const EMPTY_TOTALS: PlayerTotals = { apps: 0, starts: 0, minutes: 0, goals: 0, assists: 0, yellow: 0, red: 0 };

/** Each player's totals across played matches. A squad member counts as an appearance if they played minutes (or started). */
export function playerTotals(ms: Match[], rows: MatchPlayer[]): Map<string, PlayerTotals> {
  const played = new Set(ms.filter((m) => m.status === "played").map((m) => m.id));
  const out = new Map<string, PlayerTotals>();
  for (const r of rows) {
    if (!played.has(r.match_id)) continue;
    const appeared = r.role === "start" || (r.minutes ?? 0) > 0 || r.goals > 0 || r.assists > 0;
    if (!appeared) continue;
    const t = { ...(out.get(r.player_id) ?? EMPTY_TOTALS) };
    t.apps++;
    if (r.role === "start") t.starts++;
    t.minutes += r.minutes ?? 0;
    t.goals += r.goals;
    t.assists += r.assists;
    t.yellow += r.yellow;
    t.red += r.red;
    out.set(r.player_id, t);
  }
  return out;
}
