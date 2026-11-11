import type { Category, Position, Role, Status } from "./types";

export const CATS: Record<Category, string> = {
  warmup: "Warm-up",
  technical: "Technical",
  tactical: "Tactical",
  game: "Game",
  fitness: "Fitness",
  cooldown: "Cool-down",
};
export const POS: Position[] = ["GK", "DEF", "MID", "FWD"];
export const POSNAME: Record<Position, string> = { GK: "Goalkeepers", DEF: "Defenders", MID: "Midfielders", FWD: "Forwards" };
export const STATUS: Record<Status, string> = { available: "Available", injured: "Injured", unavailable: "Unavailable" };
export const ROLES: Record<Role, string> = { admin: "Club admin", coach: "Head coach", assistant: "Assistant coach", player: "Player", parent: "Parent" };
export const ROLES_PLURAL: Record<Role, string> = { admin: "Club admins", coach: "Head coaches", assistant: "Assistant coaches", player: "Players", parent: "Parents" };
export const ROLE_HELP: Record<Role, string> = {
  admin: "Manages the club, teams and members",
  coach: "Runs their teams: squads, sessions, development plans and invites",
  assistant: "Helps run their teams: sessions, attendance and drills",
  player: "Sees sessions and updates their own availability",
  parent: "Sees their child's sessions and updates their availability",
};
