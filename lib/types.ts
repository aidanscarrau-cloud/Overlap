/** "coach" is the head coach; "assistant" an assistant coach. */
export type Role = "admin" | "coach" | "assistant" | "player" | "parent";
export type Status = "available" | "injured" | "unavailable";
export type Position = "GK" | "DEF" | "MID" | "FWD";
export type Category = "warmup" | "technical" | "tactical" | "game" | "fitness" | "cooldown";

export type Club = { id: string; name: string; logo_url: string | null };
export type Team = { id: string; club_id: string; name: string; age_group: string; coach_name: string; logo_url: string | null };
export type Player = {
  id: string;
  club_id: string;
  /** Main team. */
  team_id: string;
  /** Main team first, then any other teams they play or train with. */
  team_ids: string[];
  full_name: string;
  shirt_number: number | null;
  position: Position;
  status: Status;
  status_note: string;
};

/** Diagram item: [type, x, y, label?]. Types: p (your player), o (opponent), n (neutral), c (cone), b (ball), g (goal; label "L" = faces left). */
export type DiagramItem = [string, number, number, string?];
/** Diagram arrow: [kind, x1, y1, x2, y2]. Kinds: pass, run, drib. */
export type DiagramArrow = [string, number, number, number, number];
export type Diagram = { items: DiagramItem[]; arrows: DiagramArrow[]; full?: boolean };

export type Drill = {
  id: string;
  club_id: string;
  name: string;
  category: Category;
  minutes: number;
  player_count: string;
  area: string;
  description: string;
  points: string[];
  diagram: Diagram;
};

export type PlanItem = { drill_id: string; mins: number };
export type Session = {
  id: string;
  club_id: string;
  team_id: string;
  date: string;
  start_time: string;
  location: string;
  title: string;
  focus: string;
  notes: string;
  plan: PlanItem[];
};
export type Attendance = { session_id: string; player_id: string };

export type Member = {
  id: string;
  user_id: string;
  role: Role;
  team_ids: string[];
  /** Players this account answers for (their own record, or their children). */
  player_ids: string[];
  full_name: string;
};
export type Invite = {
  code: string;
  role: Role;
  team_id: string | null;
  player_id: string | null;
  create_player: boolean;
  new_player_name: string | null;
  expires_at: string;
  max_uses: number;
  uses: number;
};

export type Announcement = {
  id: string;
  team_id: string | null;
  title: string;
  body: string;
  pinned: boolean;
  author_id: string | null;
  author_name: string;
  created_at: string;
};
export type Reply = { session_id: string; player_id: string; going: boolean; note: string; updated_at: string };

export type PlayerLoad = {
  player_id: string;
  mins_7d: number;
  sessions_7d: number;
  teams_7d: number;
  mins_28d: number;
  sessions_28d: number;
  planned_mins_7d: number;
  planned_sessions_7d: number;
};

export type NotificationKind = "session_new" | "session_changed" | "session_cancelled" | "announcement" | "reply_reminder" | "evaluation" | "goal";
export type AppNotification = {
  id: string;
  club_id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  url: string;
  created_at: string;
  read_at: string | null;
};
export type EmailPref = "always" | "no_phone" | "never";
export type NotificationPrefs = { sessions: boolean; announcements: boolean; reminders: boolean; development: boolean; email: EmailPref };

export type ClubData = {
  /** This person's own inbox, newest first (all their clubs). */
  notifications: AppNotification[];
  notificationPrefs: NotificationPrefs;
  evaluations: import("./idp").Evaluation[];
  goals: import("./idp").Goal[];
  goalUpdates: import("./idp").GoalUpdate[];
  loads: PlayerLoad[];
  announcements: Announcement[];
  replies: Reply[];
  perms: import("./permissions").Perms;
  rolePerms: import("./permissions").RolePerm[];
  /** Teams this person works with (all teams for admins). */
  myTeamIds: string[];
  userId: string;
  myName: string;
  /** Sign-in email, where notification emails go. */
  myEmail: string;
  club: Club;
  clubs: Club[];
  role: Role;
  me: Member;
  teams: Team[];
  players: Player[];
  drills: Drill[];
  sessions: Session[];
  attendance: Attendance[];
  members: Member[];
};
