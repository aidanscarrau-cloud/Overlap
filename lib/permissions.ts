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
  { key: "invites.create", label: "Invite players and parents", help: "Only to teams they belong to." },
  { key: "announcements.post", label: "Post announcements", help: "To their teams. Only admins post to the whole club." },
] as const;

export type Perm = (typeof PERMS)[number]["key"];
export type Perms = Record<Perm, boolean>;
export type RolePerm = { role: Role; perm: Perm; allowed: boolean };
export const CONFIGURABLE_ROLES: Exclude<Role, "admin">[] = ["coach", "player", "parent"];

/** Must match public.default_perm() in the database. */
export const defaultPerm = (role: Role, perm: Perm) => (role === "admin" ? true : role === "coach" ? perm !== "teams.view_all" : false);

export function permsFor(role: Role, rows: RolePerm[]): Perms {
  const out = {} as Perms;
  for (const { key } of PERMS) {
    const row = rows.find((r) => r.role === role && r.perm === key);
    out[key] = role === "admin" ? true : (row?.allowed ?? defaultPerm(role, key));
  }
  return out;
}
