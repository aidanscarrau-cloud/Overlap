/**
 * Reads a competition draw pasted from a website or spreadsheet (or a CSV file) and turns it
 * into matches for one team. Draw layouts differ between associations, so columns are guessed
 * and the coach can correct the guesses before anything is saved.
 */
import type { HomeAway } from "./types";

export type ColType = "ignore" | "date" | "time" | "datetime" | "home" | "away" | "teams" | "opponent" | "homeaway" | "venue" | "round" | "competition";
export const COL_LABEL: Record<ColType, string> = {
  ignore: "Ignore",
  date: "Date",
  time: "Kick-off time",
  datetime: "Date and time",
  home: "Home team",
  away: "Away team",
  teams: "Both teams (A v B)",
  opponent: "Opponent",
  homeaway: "Home or away",
  venue: "Venue / ground",
  round: "Round",
  competition: "Competition / grade",
};

export type DrawRow = {
  include: boolean;
  date: string;
  kickoff: string;
  opponent: string;
  home_away: HomeAway;
  venue: string;
  round: string;
  competition: string;
  ref: string;
  problem: string;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const pad = (n: number) => String(n).padStart(2, "0");
const clean = (s: string) => s.replace(/ /g, " ").replace(/\s+/g, " ").trim();
export const norm = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, "");

/* ---------------- splitting the text into rows and cells ---------------- */

function splitCsvLine(line: string, sep: string) {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === sep) {
      out.push(cur);
      cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map(clean);
}

/** Text to a grid of cells. Handles tabs (copied from Excel, Sheets or a web table), CSV, semicolons and wide spaces. */
export function parseTable(text: string): string[][] {
  const lines = text.replace(/\r\n?/g, "\n").split("\n").filter((l) => l.trim());
  if (!lines.length) return [];
  const has = (sep: string) => lines.filter((l) => l.includes(sep)).length >= Math.max(1, Math.ceil(lines.length * 0.6));
  let rows: string[][];
  if (has("\t")) rows = lines.map((l) => l.split("\t").map(clean));
  else if (has(",") && lines.every((l) => splitCsvLine(l, ",").length >= 3 || !l.includes(","))) rows = lines.map((l) => splitCsvLine(l, ","));
  else if (has(";")) rows = lines.map((l) => splitCsvLine(l, ";"));
  else if (has("|")) rows = lines.map((l) => l.split("|").map(clean).filter((c, i, a) => c || (i > 0 && i < a.length - 1)));
  else rows = lines.map((l) => l.split(/\s{2,}/).map(clean));
  const width = Math.max(...rows.map((r) => r.length));
  // Drop columns that are empty in every row.
  const keep = Array.from({ length: width }, (_, i) => rows.some((r) => (r[i] ?? "").trim()));
  return rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? "").filter((_, i) => keep[i])).filter((r) => r.some((c) => c));
}

/* ---------------- dates and times ---------------- */

/** Picks the year for a date written without one: the next time that day comes round (or recently passed). */
function inferYear(m: number, d: number, today: Date) {
  const y = today.getFullYear();
  const cand = new Date(y, m, d);
  const diff = (cand.getTime() - today.getTime()) / 864e5;
  if (diff < -60) return y + 1;
  if (diff > 300) return y - 1;
  return y;
}
function valid(y: number, m: number, d: number) {
  const dt = new Date(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d;
}

/** Australian-style dates: 5/4/2027, 05-04-27, 2027-04-05, Sat 5 Apr, Saturday 5th April 2027, 5 April. */
export function parseDate(s: string, today = new Date()): string | null {
  const t = clean(s).toLowerCase().replace(/(\d)(st|nd|rd|th)\b/g, "$1").replace(/,/g, " ");
  let m = t.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (m) {
    const [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
    return valid(y, mo, d) ? `${y}-${pad(mo + 1)}-${pad(d)}` : null;
  }
  m = t.match(/\b(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?\b/);
  if (m) {
    const d = +m[1];
    const mo = +m[2] - 1;
    let y = m[3] ? +m[3] : inferYear(mo, d, today);
    if (y < 100) y += 2000;
    return valid(y, mo, d) ? `${y}-${pad(mo + 1)}-${pad(d)}` : null;
  }
  m = t.match(/\b(\d{1,2})\s+([a-z]{3,9})\.?(?:\s+(\d{4}))?\b/);
  if (m && MONTHS.includes(m[2].slice(0, 3))) {
    const d = +m[1];
    const mo = MONTHS.indexOf(m[2].slice(0, 3));
    const y = m[3] ? +m[3] : inferYear(mo, d, today);
    return valid(y, mo, d) ? `${y}-${pad(mo + 1)}-${pad(d)}` : null;
  }
  m = t.match(/\b([a-z]{3,9})\.?\s+(\d{1,2})(?:\s+(\d{4}))?\b/);
  if (m && MONTHS.includes(m[1].slice(0, 3))) {
    const d = +m[2];
    const mo = MONTHS.indexOf(m[1].slice(0, 3));
    const y = m[3] ? +m[3] : inferYear(mo, d, today);
    return valid(y, mo, d) ? `${y}-${pad(mo + 1)}-${pad(d)}` : null;
  }
  return null;
}

/** 9:00, 9.30am, 09:30 AM, 2pm, 14:30. Returns HH:MM (24 hour). */
export function parseTime(s: string): string | null {
  const t = clean(s).toLowerCase();
  const m = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\s|$|[^\d])/g);
  if (!m) return null;
  for (const cand of m) {
    const x = cand.match(/(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?/);
    if (!x) continue;
    if (!x[2] && !x[3]) continue; // a bare number isn't a time
    let h = +x[1];
    const min = x[2] ? +x[2] : 0;
    const ap = x[3]?.[0];
    if (ap === "p" && h < 12) h += 12;
    if (ap === "a" && h === 12) h = 0;
    if (h > 23 || min > 59) continue;
    // "5.04" after a date is more likely part of the date than a time, so require a sensible kick-off hour.
    if (!ap && (h < 6 || h > 22)) continue;
    return `${pad(h)}:${pad(min)}`;
  }
  return null;
}

const ROUND_RE = /^(?:r(?:ound|d)?\.?\s*|week\s*|wk\s*)?(\d{1,2})$/i;
const TEAMS_RE = /\s+(?:v|vs\.?|versus|-)\s+/i;
const BYE_RE = /\bbye\b/i;

/* ---------------- guessing what each column is ---------------- */

export function guessColumns(rows: string[][]): { types: ColType[]; header: boolean } {
  if (!rows.length) return { types: [], header: false };
  const width = rows[0].length;
  const first = rows[0].map((c) => c.toLowerCase());
  const byHeader = (c: string): ColType | null => {
    if (/^(date|day|match date|game date)$|\bdate\b/.test(c)) return /time/.test(c) ? "datetime" : "date";
    if (/time|kick/.test(c)) return "time";
    if (/^home( team)?$|home team/.test(c)) return "home";
    if (/^away( team)?$|away team|visitor/.test(c)) return "away";
    if (/opponent|versus|\bvs\b/.test(c)) return "opponent";
    if (/^(h\/a|home\/away|h or a)$/.test(c)) return "homeaway";
    if (/venue|ground|field|location|pitch|park/.test(c)) return "venue";
    if (/round|^rd$|^week$/.test(c)) return "round";
    if (/comp|division|grade|league|age/.test(c)) return "competition";
    if (/match|fixture|game/.test(c)) return "teams";
    return null;
  };
  const headerTypes = first.map(byHeader);
  const header = headerTypes.filter(Boolean).length >= 2 && !rows[0].some((c) => parseDate(c));
  if (header) return { header, types: headerTypes.map((t) => t ?? "ignore") };

  // No header: look at the values.
  const types: ColType[] = Array(width).fill("ignore");
  const col = (i: number) => rows.map((r) => r[i] ?? "").filter((c) => c);
  const share = (i: number, f: (c: string) => boolean) => {
    const v = col(i);
    return v.length ? v.filter(f).length / v.length : 0;
  };
  const textCols: number[] = [];
  for (let i = 0; i < width; i++) {
    const isDate = share(i, (c) => !!parseDate(c)) > 0.6;
    const isTime = share(i, (c) => !!parseTime(c)) > 0.6;
    if (isDate && isTime) types[i] = "datetime";
    else if (isDate) types[i] = "date";
    else if (isTime) types[i] = "time";
    else if (share(i, (c) => ROUND_RE.test(c)) > 0.6) types[i] = "round";
    else if (share(i, (c) => TEAMS_RE.test(c)) > 0.6) types[i] = "teams";
    else if (share(i, (c) => /^(h|a|home|away)$/i.test(c)) > 0.8) types[i] = "homeaway";
    else textCols.push(i);
  }
  // The two text columns whose values repeat most across rows are usually the teams.
  const repeat = (i: number) => {
    const v = col(i).map(norm);
    return v.length - new Set(v).size;
  };
  const hasTeams = types.includes("teams");
  const sorted = [...textCols].sort((a, b) => repeat(b) - repeat(a) || a - b);
  if (!hasTeams && sorted.length >= 2) {
    const [a, b] = [sorted[0], sorted[1]].sort((x, y) => x - y);
    types[a] = "home";
    types[b] = "away";
    const rest = sorted.slice(2);
    if (rest.length) types[rest[0]] = "venue";
  } else if (sorted.length) {
    types[sorted[0]] = hasTeams ? "venue" : "opponent";
  }
  return { header, types };
}

/** All team names in the draw, most frequent first (your own team is usually near the top). */
export function teamNames(rows: string[][], types: ColType[]): string[] {
  const count = new Map<string, { name: string; n: number }>();
  const add = (name: string) => {
    const k = norm(name);
    if (!k || BYE_RE.test(name)) return;
    const cur = count.get(k);
    count.set(k, { name: cur?.name ?? clean(name), n: (cur?.n ?? 0) + 1 });
  };
  for (const r of rows)
    types.forEach((t, i) => {
      const c = r[i] ?? "";
      if (t === "home" || t === "away") add(c);
      if (t === "teams") c.split(TEAMS_RE).forEach(add);
    });
  return [...count.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)).map((x) => x.name);
}

/** A stable key so re-importing an updated draw changes the same match instead of adding another. */
export const matchRef = (round: string, opponent: string, date: string) => (round ? `r:${norm(round)}|${norm(opponent)}` : `d:${date}|${norm(opponent)}`);

/** Turns the grid into this team's matches. */
export function buildRows(rows: string[][], types: ColType[], header: boolean, ours: string, today = new Date()): DrawRow[] {
  const me = norm(ours);
  const body = header ? rows.slice(1) : rows;
  const out: DrawRow[] = [];
  const get = (r: string[], t: ColType) => {
    const i = types.indexOf(t);
    return i >= 0 ? (r[i] ?? "") : "";
  };
  const sameTeam = (a: string) => {
    const x = norm(a);
    return !!me && (x === me || (x.length > 3 && (x.includes(me) || me.includes(x))));
  };
  for (const r of body) {
    let home = get(r, "home");
    let away = get(r, "away");
    const both = get(r, "teams");
    if (both && !home && !away) [home = "", away = ""] = both.split(TEAMS_RE);
    let opponent = get(r, "opponent");
    let ha: HomeAway = "home";
    const haCell = get(r, "homeaway").toLowerCase();
    if (home || away) {
      if (sameTeam(home)) {
        opponent = away;
        ha = "home";
      } else if (sameTeam(away)) {
        opponent = home;
        ha = "away";
      } else continue; // another team's game in a full competition draw
    } else if (haCell) ha = haCell.startsWith("a") ? "away" : "home";
    if (!opponent || BYE_RE.test(opponent)) continue;

    const dateCell = get(r, "datetime") || get(r, "date");
    const date = parseDate(dateCell, today) ?? "";
    // The time can be in its own column or in the date cell ("05/04/2027 09:00").
    const timeInDate = parseTime(dateCell.replace(/\b\d{4}-\d{1,2}-\d{1,2}\b|\b\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?\b/, ""));
    const kickoff = parseTime(get(r, "time")) ?? timeInDate ?? "";
    const roundRaw = get(r, "round");
    const round = (roundRaw.match(ROUND_RE)?.[1] ?? roundRaw).slice(0, 30);
    opponent = clean(opponent).slice(0, 80);
    out.push({
      include: !!date,
      date,
      kickoff,
      opponent,
      home_away: ha,
      venue: clean(get(r, "venue")).slice(0, 120),
      round,
      competition: clean(get(r, "competition")).slice(0, 60),
      ref: matchRef(round, opponent, date),
      problem: date ? "" : "Couldn't read the date",
    });
  }
  return out;
}
