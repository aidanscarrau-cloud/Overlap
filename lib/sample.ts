import type { SupabaseClient } from "@supabase/supabase-js";
import type { Position, Status } from "./types";
import { STARTER_DRILLS } from "./starter-drills";
import { iso } from "./format";

/** Fill a new, empty club with example teams, players, drills and sessions. Admin only (enforced by the database). */
export async function addSampleData(supabase: SupabaseClient, clubId: string) {
  let seed = 42;
  const r = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const pick = <T,>(a: T[]) => a[Math.floor(r() * a.length)];

  const teamDefs = [
    { name: "First Team", age_group: "Senior Men", coach_name: "Dan Hollis", size: 18, pool: "m", time: "18:30", loc: "Main Pitch" },
    { name: "Women's First Team", age_group: "Senior Women", coach_name: "Priya Raman", size: 16, pool: "w", time: "19:00", loc: "Pitch 2 (synthetic)" },
    { name: "U12 Mixed", age_group: "Under 12", coach_name: "Kate O’Neill", size: 14, pool: "x", time: "16:30", loc: "Back Field" },
  ];
  const { data: teams, error: tErr } = await supabase
    .from("teams")
    .insert(teamDefs.map(({ name, age_group, coach_name }) => ({ club_id: clubId, name, age_group, coach_name })))
    .select("id,name");
  if (tErr) throw tErr;

  const { data: drills, error: dErr } = await supabase
    .from("drills")
    .insert(STARTER_DRILLS.map(({ key: _k, ...d }) => ({ ...d, club_id: clubId })))
    .select("id,name,minutes");
  if (dErr) throw dErr;
  const byKey = new Map(STARTER_DRILLS.map((d) => [d.key, drills!.find((x) => x.name === d.name)!]));

  const men = ["Liam", "Noah", "Jack", "Oliver", "Leo", "Ethan", "Lucas", "Mason", "Harry", "James", "Kai", "Ryan", "Sam", "Tom", "Ben", "Max", "Eli", "Josh", "Finn", "Zac"];
  const women = ["Mia", "Chloe", "Ava", "Grace", "Zoe", "Ella", "Ruby", "Isla", "Sophie", "Lily", "Amelia", "Hannah", "Maya", "Jade", "Kate", "Tahlia", "Sienna", "Emma"];
  const lasts = ["Walker", "Nguyen", "Kelly", "Brown", "Silva", "Taylor", "Murphy", "Rossi", "Okafor", "Chen", "Hughes", "Patel", "Mitchell", "Costa", "Doyle", "Ward", "Byrne", "Ahmed", "Novak", "Reid"];
  const shape: Position[] = ["GK", "GK", "DEF", "DEF", "DEF", "DEF", "DEF", "MID", "MID", "MID", "MID", "MID", "FWD", "FWD", "FWD", "MID", "DEF", "FWD"];
  const injuries = ["Hamstring strain, 2 wks", "Ankle sprain, 1 wk", "Knee, being assessed"];
  const away = ["Away this week", "School camp", "Illness", "Work commitments"];

  const playerRows: Record<string, unknown>[] = [];
  teamDefs.forEach((def, ti) => {
    const pool = def.pool === "m" ? men : def.pool === "w" ? women : men.concat(women);
    const used = new Set<string>();
    for (let i = 0; i < def.size; i++) {
      let name: string;
      do name = pick(pool) + " " + pick(lasts);
      while (used.has(name));
      used.add(name);
      const x = r();
      const status: Status = x < 0.1 ? "injured" : x < 0.18 ? "unavailable" : "available";
      playerRows.push({
        team_id: teams![ti].id,
        full_name: name,
        shirt_number: i === 0 ? 1 : i === 1 ? 13 : i + 1,
        position: shape[i % shape.length],
        status,
        status_note: status === "injured" ? pick(injuries) : status === "unavailable" ? pick(away) : "",
      });
    }
  });
  const { data: players, error: pErr } = await supabase.from("players").insert(playerRows).select("id,team_id,status");
  if (pErr) throw pErr;

  const templates = [
    { title: "Playing out from the back", focus: "Build-up", keys: ["d2", "d1", "d4", "d6", "d9"] },
    { title: "Pressing in the middle third", focus: "Out of possession", keys: ["d1", "d3", "d5", "d6", "d9"] },
    { title: "Final third combinations", focus: "Attacking", keys: ["d2", "d7", "d3", "d6", "d9"] },
    { title: "Conditioning & small-sided games", focus: "Physical", keys: ["d1", "d8", "d6", "d9"] },
  ];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = iso(today);
  const sessionRows: Record<string, unknown>[] = [];
  teamDefs.forEach((def, ti) => {
    let k = ti;
    for (let d = new Date(today.getTime() - 21 * 864e5); d <= new Date(today.getTime() + 14 * 864e5); d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 2 && d.getDay() !== 4) continue;
      const tpl = templates[k++ % templates.length];
      sessionRows.push({
        team_id: teams![ti].id,
        date: iso(d),
        start_time: def.time,
        location: def.loc,
        title: tpl.title,
        focus: tpl.focus,
        plan: tpl.keys.map((key) => ({ drill_id: byKey.get(key)!.id, mins: byKey.get(key)!.minutes })),
      });
    }
  });
  const { data: sessions, error: sErr } = await supabase.from("sessions").insert(sessionRows).select("id,team_id,date");
  if (sErr) throw sErr;

  const att: { session_id: string; player_id: string }[] = [];
  sessions!
    .filter((s) => s.date < todayStr)
    .forEach((s) =>
      players!
        .filter((p) => p.team_id === s.team_id)
        .forEach((p) => {
          const base = p.status === "injured" ? 0.15 : p.status === "unavailable" ? 0.5 : 0.9;
          if (r() < base) att.push({ session_id: s.id, player_id: p.id });
        }),
    );
  if (att.length) {
    const { error } = await supabase.from("attendance").insert(att);
    if (error) throw error;
  }
}
