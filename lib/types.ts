/** "coach" is the head coach; "assistant" an assistant coach. */
export type Role = "admin" | "coach" | "assistant" | "player" | "parent";
export type Status = "available" | "injured" | "unavailable";
export type Position = "GK" | "DEF" | "MID" | "FWD";
export type Category = "warmup" | "technical" | "tactical" | "game" | "fitness" | "cooldown";

export type Club = { id: string; name: string; logo_url: string | null; brand_primary?: string | null; brand_accent?: string | null; /** "lite" (free) or "pro". Missing (before update 31) counts as Pro. */ plan?: "lite" | "pro"; /** AI match feedback switched on by an admin (update 33). */ ai_reports?: boolean };
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
  /** Optional; used for age rules such as chat (staff can see and set it). */
  birth_year?: number | null;
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
  /** Sessions created together as a repeating series share this id. */
  series_id: string | null;
};
export type HomeAway = "home" | "away" | "neutral";
export type MatchStatus = "scheduled" | "postponed" | "cancelled" | "played";
export type MatchFormat = "5" | "7" | "9" | "11";
export type Match = {
  id: string;
  club_id: string;
  team_id: string;
  date: string;
  kickoff: string;
  meet_time: string | null;
  opponent: string;
  home_away: HomeAway;
  venue: string;
  competition: string;
  round: string;
  format: MatchFormat;
  length_mins: number;
  status: MatchStatus;
  our_score: number | null;
  their_score: number | null;
  formation: string;
  squad_published: boolean;
  report: string;
  external_ref: string | null;
  /** Link to the match video, e.g. Veo (update 33). */
  video_url?: string | null;
  updated_at: string;
};
/** A player in a match squad: line-up position and stats. */
export type MatchPlayer = {
  match_id: string;
  player_id: string;
  role: "start" | "bench";
  slot: number | null;
  minutes: number | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
};
/** What a coach logs for one player after a match (staff only). */
export type MatchReview = {
  match_id: string;
  player_id: string;
  rating: number | null;
  shots: number;
  on_target: number;
  key_passes: number;
  tackles: number;
  saves: number;
  notes: string;
  moments: { t: string; note: string }[];
  updated_at: string;
};
export type ReportDrill = { ref: string; name: string; why: string };
export type ReportGoal = { area: string; title: string; detail: string; added?: boolean };
/** A player's personal feedback from a match. Families see it once the coach shares it. */
export type MatchReport = {
  id: string;
  match_id: string;
  player_id: string;
  status: "draft" | "shared";
  headline: string;
  went_well: string[];
  work_on: { title: string; how: string }[];
  drills: ReportDrill[];
  goal_ideas: ReportGoal[];
  coach_message: string;
  /** Timestamps to watch back in the match video (copied from the coach's log). */
  moments: { t: string; note: string }[];
  ai: boolean;
  author_name: string;
  updated_at: string;
  shared_at: string | null;
};
export type MatchReply = { match_id: string; player_id: string; going: boolean; note: string; updated_at: string };
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

export type NotificationKind =
  | "session_new"
  | "session_changed"
  | "session_cancelled"
  | "announcement"
  | "reply_reminder"
  | "evaluation"
  | "goal"
  | "match_new"
  | "match_changed"
  | "match_cancelled"
  | "squad"
  | "result"
  | "self_review"
  | "self_review_done"
  | "message"
  | "injury"
  | "match_report"
  | "trial";
export type ChatSummary = {
  id: string;
  kind: "team" | "staff" | "direct" | "group";
  team_id: string | null;
  posting: "all" | "staff";
  name: string;
  last_at: string | null;
  last_body: string | null;
  last_author: string | null;
  unread: number;
  muted: boolean;
  other_user: string | null;
};
export type SelfReview = {
  id: string;
  player_id: string;
  author_id: string | null;
  author_name: string;
  message: string;
  due_date: string | null;
  created_at: string;
  ratings: import("./idp").Ratings;
  going_well: string;
  improve: string;
  goal_idea: string;
  submitted_at: string | null;
  submitted_by_name: string;
  coach_reply: string;
  replied_at: string | null;
};
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
export type NotificationPrefs = { sessions: boolean; announcements: boolean; reminders: boolean; development: boolean; messages: boolean; email: EmailPref };

/** A team's chosen formation and who stands where (spot index → player id). */
export type TeamLineup = { team_id: string; format: MatchFormat; formation: string; slots: Record<string, string> };

export type FitnessDay = { id: string; team_id: string; date: string; title: string; tests: string[]; notes: string };
export type FitnessResult = { id: string; team_id: string; test_day_id: string | null; player_id: string; test_key: string; attempt: number; value: number; tested_on: string };
export type FitnessBand = { test_key: string; age_group: "u10" | "u12" | "u14" | "u16" | "open"; typical_low: number; typical_high: number };

export type TrialStatus = "applied" | "shortlisted" | "offered" | "accepted" | "declined" | "not_selected";
export type Trial = { id: string; club_id: string; team_id: string; title: string; intro: string; slug: string; status: "open" | "closed" | "done"; closes_on: string | null; agreements: string[]; ask_player_contact: boolean; created_at: string; squad_target?: number | null; position_targets?: Partial<Record<"GK" | "DEF" | "MID" | "FWD", number>> };
export type TrialDate = { id: string; trial_id: string; date: string; start_time: string; end_time: string | null; location: string };
export type TrialApplicant = {
  id: string;
  trial_id: string;
  team_id: string;
  full_name: string;
  dob: string | null;
  current_club: string;
  positions: string;
  /** Set by a coach; otherwise guessed from `positions`. */
  position?: "GK" | "DEF" | "MID" | "FWD" | null;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  player_phone: string;
  player_email: string;
  agreed: Record<string, boolean>;
  notes: string;
  status: TrialStatus;
  source: "form" | "import" | "manual";
  offered_at: string | null;
  responded_at: string | null;
  last_emailed: string | null;
  last_emailed_at: string | null;
  player_id: string | null;
  submitted_at: string;
};
export type TrialAttendance = { applicant_id: string; date_id: string };
export type TrialRating = { id: string; applicant_id: string; date_id: string | null; rated_by: string; rated_by_name: string; rating: number | null; notes: string; updated_at: string };

export type Injury = {
  id: string; team_id: string; player_id: string; body_part: string; side: "left" | "right" | "both" | "na";
  kind: "sprain" | "strain" | "knock" | "fracture" | "concussion" | "illness" | "overuse" | "other";
  severity: "minor" | "moderate" | "serious"; occurred_on: string; cause: "training" | "match" | "outside" | "unknown";
  notes: string; expected_return: string | null; stage: number; cleared_by_doctor: boolean; status: "active" | "recovered";
  recovered_on: string | null; reported_by_family: boolean; created_by_name: string; created_at: string;
};

export type ClubData = {
  injuries: Injury[];
  /** Profile pictures by user id. */
  avatars: Record<string, string>;
  trials: Trial[];
  trialDates: TrialDate[];
  trialApplicants: TrialApplicant[];
  trialAttendance: TrialAttendance[];
  trialRatings: TrialRating[];
  lineups: TeamLineup[];
  fitnessDays: FitnessDay[];
  fitnessResults: FitnessResult[];
  fitnessBands: FitnessBand[];
  /** Can this person see chat (player accounts under the club's chat age may not). */
  chatAllowed: boolean;
  /** Can they send in team chats (younger players may be read-only). */
  chatCanSend: boolean;
  /** The club's chat age limit. */
  chatMinAge: number;
  chats: ChatSummary[];
  selfReviews: SelfReview[];
  matches: Match[];
  matchPlayers: MatchPlayer[];
  matchReplies: MatchReply[];
  matchReviews: MatchReview[];
  matchReports: MatchReport[];
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
