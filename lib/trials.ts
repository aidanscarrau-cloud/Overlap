/* Trials: shared wording, defaults and the spreadsheet importer (used in the browser and on the server). */

import type { TrialStatus } from "./types";

export const TRIAL_STATUS: Record<TrialStatus, string> = {
  applied: "Signed up",
  shortlisted: "Shortlisted",
  offered: "Offer sent",
  accepted: "Accepted",
  declined: "Declined",
  not_selected: "Not selected",
};

export const DEFAULT_AGREEMENTS = [
  "We're available to attend the trial dates.",
  "We understand the team trains regularly during the season, plus pre-season training.",
  "We understand that selection is not guaranteed.",
  "We give permission for the player to be filmed at training and games (for example by a Veo camera) for coaching.",
  "The information above is correct and I give permission for my child to take part in the trials.",
];

export type PublicTrial = {
  id: string;
  title: string;
  intro: string;
  closes_on: string | null;
  open: boolean;
  agreements: string[];
  ask_player_contact: boolean;
  team: string;
  club: { name: string; logo: string | null; primary: string | null; accent: string | null };
  dates: { date: string; start: string; end: string | null; location: string }[];
};

const d = (s: string) => {
  const [y, m, dd] = s.split("-").map(Number);
  return new Date(y, m - 1, dd);
};
export const trialDay = (s: string) => d(s).toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long" });
export const time12 = (t: string | null | undefined) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
};
export const dateLine = (x: { date: string; start: string; end?: string | null; location?: string }) =>
  `${trialDay(x.date)}, ${time12(x.start)}${x.end ? `–${time12(x.end)}` : ""}${x.location ? ` at ${x.location}` : ""}`;

export const ageOn = (dob: string | null, on = new Date()) => {
  if (!dob) return null;
  const b = d(dob);
  let a = on.getFullYear() - b.getFullYear();
  if (on.getMonth() < b.getMonth() || (on.getMonth() === b.getMonth() && on.getDate() < b.getDate())) a--;
  return a;
};

/* ------------------------------------------------------------------ spreadsheet import */

/** A small CSV reader that copes with quotes, commas and line breaks inside answers. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let q = false;
  const s = text.replace(/^﻿/, "");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x.trim()));
}

export type ImportField = "full_name" | "dob" | "current_club" | "positions" | "parent_name" | "parent_phone" | "parent_email" | "player_phone" | "player_email";
export const FIELD_LABEL: Record<ImportField, string> = {
  full_name: "Player's name",
  dob: "Date of birth",
  current_club: "Current club",
  positions: "Position(s)",
  parent_name: "Parent's name",
  parent_phone: "Parent's mobile",
  parent_email: "Parent's email",
  player_phone: "Player's mobile",
  player_email: "Player's email",
};

/** Guess which column is which from the headings a form tool wrote. */
export function guessColumns(headers: string[]) {
  const map: Partial<Record<ImportField, number>> = {};
  const h = headers.map((x) => x.toLowerCase());
  const find = (test: (s: string) => boolean) => h.findIndex((s, i) => test(s) && !Object.values(map).includes(i));
  const parentish = (s: string) => /(parent|guardian|mum|dad|mother|father)/.test(s);
  const playerish = (s: string) => /(child|player|kid|son|daughter)/.test(s) && !parentish(s);
  const set = (k: ImportField, i: number) => i >= 0 && map[k] === undefined && (map[k] = i);
  set("dob", find((s) => /(date of birth|dob|birth ?date|birthday)/.test(s)));
  set("parent_email", find((s) => /e-?mail/.test(s) && parentish(s)));
  set("player_email", find((s) => /e-?mail/.test(s) && playerish(s)));
  set("parent_phone", find((s) => /(mobile|phone|contact number)/.test(s) && parentish(s)));
  set("player_phone", find((s) => /(mobile|phone)/.test(s) && playerish(s)));
  set("parent_name", find((s) => parentish(s) && /name/.test(s)));
  set("full_name", find((s) => /name/.test(s) && !parentish(s) && !/club|team/.test(s)));
  set("current_club", find((s) => /(current|previous|last) ?(club|team)|^club$/.test(s)));
  set("positions", find((s) => /position/.test(s)));
  // A lone email or phone column belongs to the parent.
  set("parent_email", find((s) => /e-?mail/.test(s)));
  set("parent_phone", find((s) => /(mobile|phone)/.test(s)));
  return map;
}

/** Yes/No questions (consents, availability) become ticked agreements. */
export function yesNoColumns(headers: string[], rows: string[][], used: number[]) {
  return headers
    .map((hd, i) => ({ hd, i }))
    .filter(({ hd, i }) => !used.includes(i) && !/timestamp|time ?stamp/i.test(hd))
    .filter(({ i }) => {
      const vals = rows.map((r) => (r[i] ?? "").trim().toLowerCase()).filter(Boolean);
      return vals.length > 0 && vals.every((v) => /^(yes|no|y|n|true|false|agree|i agree)\b/.test(v));
    });
}

/** "2/3/2011", "02/03/2011", "2011-03-02" or "2 Mar 2011" → "2011-03-02" (Australian day-first). */
export function parseDob(s: string): string | null {
  const t = s.trim();
  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return ok(+m[1], +m[2], +m[3]);
  m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let y = +m[3];
    if (y < 100) y += y > 50 ? 1900 : 2000;
    return ok(y, +m[2], +m[1]);
  }
  const p = Date.parse(t);
  if (!Number.isNaN(p)) {
    const x = new Date(p);
    return ok(x.getFullYear(), x.getMonth() + 1, x.getDate());
  }
  return null;
  function ok(y: number, mo: number, da: number) {
    if (mo < 1 || mo > 12 || da < 1 || da > 31 || y < 1950 || y > new Date().getFullYear()) return null;
    return `${y}-${String(mo).padStart(2, "0")}-${String(da).padStart(2, "0")}`;
  }
}

/** Collapse spaces and fix names typed in the wrong case, word by word ("harry KANE" → "Harry Kane"),
 *  while leaving mixed-case words alone ("McDonald", "O'Brien", "van Dijk" typed by hand). */
export const tidyName = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, " ")
    .split(" ")
    .map((w) => (w === w.toLowerCase() || w === w.toUpperCase() ? w.toLowerCase().replace(/(^|['-])([a-z])/g, (_, a: string, b: string) => a + b.toUpperCase()) : w))
    .join(" ");

export type TrialPos = "GK" | "DEF" | "MID" | "FWD";
export const TRIAL_POS: TrialPos[] = ["GK", "DEF", "MID", "FWD"];
export const POS_GROUP: Record<TrialPos, string> = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
/** Their first-listed position, the same way the database decides when they join the squad. */
export function guessPos(positions: string): TrialPos | null {
  const p = positions.split(/[,/;&|]|\band\b|\bor\b/i)[0]?.trim().toLowerCase() ?? "";
  if (!p) return null;
  if (/(goal|keeper|gk)/.test(p)) return "GK";
  if (/(def|back|\bcb\b|\blb\b|\brb\b|sweeper)/.test(p)) return "DEF";
  if (/(strik|forward|wing|attack|\bfwd\b|\bcf\b|\bst\b)/.test(p)) return "FWD";
  return "MID";
}
export const posOf = (a: { position?: string | null; positions: string }) => ((a.position as TrialPos | null | undefined) ?? guessPos(a.positions));
