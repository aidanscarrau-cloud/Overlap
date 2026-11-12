import type { Role } from "./types";

export const PERMS = [
  { key: "teams.view_all", label: "See all teams", help: "Otherwise they only see the teams they belong to." },
  { key: "squad.edit", label: "Add and edit players", help: "Includes changing anyone's availability on their teams." },
  { key: "squad.view_notes", label: "See injury and availability notes", help: "Everyone always sees their own note." },
  { key: "sessions.edit", label: "Plan and edit sessions", help: "Create, change and delete sessions for their teams." },
  { key: "sessions.view_notes", label: "Read session notes", help: "Private coaching notes on each session." },
  { key: "attendance.edit", label: "Take attendance", help: "Mark who came to training for their teams." },
  { key: "attendance.view", label: "See attendance records", help: "Everyone always sees their own attendance." },
  { key: "drills.edit", label: "Create and edit drills", help: "The drill library is shared across the club." },
  { key: "members.view", label: "See the members list", help: "Names and roles of everyone in the club." },
  { key: "invites.create", label: "Invite players and parents", help: "Only to teams they belong to. Head coaches with this on can also invite assistant coaches." },
  { key: "announcements.post", label: "Post announcements", help: "To their teams. Only admins post to the whole club." },
  { key: "idp.view", label: "See development plans", help: "Evaluations and goals for players in their teams. Players and parents always see their own shared ones." },
  { key: "idp.edit", label: "Write evaluations and goals", help: "For players in their teams." },
  { key: "matches.edit", label: "Manage matches", help: "Add matches and import draws, pick squads and line-ups, and enter results and stats for their teams." },
] as const;

export type Perm = (typeof PERMS)[number]["key"];
export type Perms = Record<Perm, boolean>;
export type RolePerm = { role: Role; perm: Perm; allowed: boolean };
export const CONFIGURABLE_ROLES: Exclude<Role, "admin">[] = ["coach", "assistant", "player", "parent"];

/** What assistant coaches can do until an admin changes it. */
const ASSISTANT_DEFAULTS: Perm[] = ["squad.view_notes", "sessions.edit", "sessions.view_notes", "attendance.edit", "attendance.view", "drills.edit", "members.view", "idp.view"];

/** Must match public.default_perm() in the database. */
export const defaultPerm = (role: Role, perm: Perm) =>
  role === "admin" ? true : role === "coach" ? perm !== "teams.view_all" : role === "assistant" ? ASSISTANT_DEFAULTS.includes(perm) : false;

/** Admins, head coaches and assistant coaches get the staff screens; players and parents the simple ones. */
export const isStaffRole = (role: Role) => role === "admin" || role === "coach" || role === "assistant";

export function permsFor(role: Role, rows: RolePerm[]): Perms {
  const out = {} as Perms;
  for (const { key } of PERMS) {
    const row = rows.find((r) => r.role === role && r.perm === key);
    out[key] = role === "admin" ? true : (row?.allowed ?? defaultPerm(role, key));
  }
  return out;
}
