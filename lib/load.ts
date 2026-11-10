import type { PlayerLoad } from "./types";

/** Typical week over the last 4 weeks (minutes). */
export const weeklyAverage = (l: PlayerLoad) => Math.round(l.mins_28d / 4);

/**
 * "High" when the last 7 days are well above what the player usually does
 * (more than 1.5 × their 4-week weekly average, and at least 2 hours).
 * Sudden jumps in load are the most common warning sign for training injuries.
 */
export function isHighLoad(l: PlayerLoad | undefined) {
  if (!l || l.mins_7d < 120) return false;
  const avg = l.mins_28d / 4;
  return l.mins_7d > 1.5 * avg;
}

export const fmtMins = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}` : `${m} min`);
