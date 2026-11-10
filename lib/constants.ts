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
export const ROLES: Record<Role, string> = { admin: "Club admin", coach: "Coach", player: "Player", parent: "Parent" };
export const ROLE_HELP: Record<Role, string> = {
  admin: "Manages the club, teams and members",
  coach: "Plans sessions and manages squads",
  player: "Sees sessions and updates their own availability",
  parent: "Sees their child's sessions and updates their availability",
};
