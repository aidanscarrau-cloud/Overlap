import type { MatchFormat } from "./types";

/** A spot on the pitch: x across (0 left to 100 right), y down (0 their goal to 100 ours). */
export type Slot = { x: number; y: number; pos: string };
export type Formation = { name: string; slots: Slot[] };

const row = (y: number, pos: string, n: number, spread = 70): Slot[] =>
  Array.from({ length: n }, (_, i) => ({ x: n === 1 ? 50 : 50 - spread / 2 + (spread * i) / (n - 1), y, pos }));
const gk: Slot = { x: 50, y: 92, pos: "GK" };

/** Formations for each match size, goalkeeper first. Junior football uses 5, 7 and 9-a-side. */
export const FORMATIONS: Record<MatchFormat, Formation[]> = {
  "11": [
    { name: "4-4-2", slots: [gk, ...row(74, "DEF", 4, 76), ...row(48, "MID", 4, 76), ...row(20, "FWD", 2, 30)] },
    { name: "4-3-3", slots: [gk, ...row(74, "DEF", 4, 76), ...row(50, "MID", 3, 54), ...row(22, "FWD", 3, 64)] },
    { name: "4-2-3-1", slots: [gk, ...row(75, "DEF", 4, 76), ...row(58, "MID", 2, 32), ...row(38, "MID", 3, 64), ...row(16, "FWD", 1)] },
    { name: "3-5-2", slots: [gk, ...row(74, "DEF", 3, 56), ...row(48, "MID", 5, 84), ...row(20, "FWD", 2, 30)] },
    { name: "4-1-4-1", slots: [gk, ...row(76, "DEF", 4, 76), ...row(60, "MID", 1), ...row(40, "MID", 4, 76), ...row(16, "FWD", 1)] },
  ],
  "9": [
    { name: "3-3-2", slots: [gk, ...row(72, "DEF", 3, 60), ...row(46, "MID", 3, 64), ...row(20, "FWD", 2, 30)] },
    { name: "3-2-3", slots: [gk, ...row(72, "DEF", 3, 60), ...row(50, "MID", 2, 36), ...row(22, "FWD", 3, 64)] },
    { name: "2-4-2", slots: [gk, ...row(72, "DEF", 2, 40), ...row(48, "MID", 4, 76), ...row(20, "FWD", 2, 30)] },
  ],
  "7": [
    { name: "2-3-1", slots: [gk, ...row(70, "DEF", 2, 44), ...row(44, "MID", 3, 64), ...row(18, "FWD", 1)] },
    { name: "3-2-1", slots: [gk, ...row(70, "DEF", 3, 60), ...row(44, "MID", 2, 40), ...row(18, "FWD", 1)] },
    { name: "2-1-2-1", slots: [gk, ...row(72, "DEF", 2, 44), ...row(56, "MID", 1), ...row(38, "MID", 2, 56), ...row(16, "FWD", 1)] },
  ],
  "5": [
    { name: "2-2", slots: [gk, ...row(64, "DEF", 2, 44), ...row(28, "FWD", 2, 44)] },
    { name: "1-2-1", slots: [gk, ...row(68, "DEF", 1), ...row(46, "MID", 2, 56), ...row(20, "FWD", 1)] },
  ],
};

export const formationFor = (format: MatchFormat, name: string) =>
  FORMATIONS[format].find((f) => f.name === name) ?? FORMATIONS[format][0];

export const FORMAT_LABEL: Record<MatchFormat, string> = { "5": "5-a-side", "7": "7-a-side", "9": "9-a-side", "11": "11-a-side" };
/** Usual match length in minutes for each size (junior games are shorter). */
export const DEFAULT_LENGTH: Record<MatchFormat, number> = { "5": 40, "7": 50, "9": 60, "11": 80 };
