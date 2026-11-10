export const AREAS = [
  { key: "technical", label: "Technical", help: "Ball skills: first touch, passing, dribbling, finishing" },
  { key: "tactical", label: "Tactical", help: "Decisions, positioning, understanding the game plan" },
  { key: "physical", label: "Physical", help: "Speed, strength, endurance, agility" },
  { key: "psychological", label: "Psychological", help: "Confidence, focus, resilience, attitude" },
  { key: "social", label: "Social", help: "Communication, teamwork, leadership" },
] as const;

export type Area = (typeof AREAS)[number]["key"];
export type Ratings = Partial<Record<Area, number>>;

export type Evaluation = {
  id: string;
  player_id: string;
  evaluated_on: string;
  ratings: Ratings;
  comments: Partial<Record<Area, string>>;
  strengths: string;
  improvements: string;
  summary: string;
  shared: boolean;
  author_name: string;
  created_at: string;
};
export type GoalStatus = "active" | "achieved" | "dropped";
export type Goal = {
  id: string;
  player_id: string;
  area: Area;
  title: string;
  detail: string;
  target_date: string | null;
  status: GoalStatus;
  progress: number;
  achieved_on: string | null;
  author_name: string;
  created_at: string;
  updated_at: string;
};
export type GoalUpdate = {
  id: string;
  goal_id: string;
  note: string;
  progress: number | null;
  by_staff: boolean;
  author_id: string | null;
  author_name: string;
  created_at: string;
};

export const areaLabel = (a: string) => AREAS.find((x) => x.key === a)?.label ?? a;

/** Average of the rated areas, one decimal place. */
export function overall(r: Ratings | undefined | null) {
  const v = AREAS.map((a) => r?.[a.key]).filter((x): x is number => typeof x === "number");
  return v.length ? Math.round((10 * v.reduce((s, x) => s + x, 0)) / v.length) / 10 : null;
}

/** A player is due a review if never evaluated or not in the last 90 days. */
export const REVIEW_DAYS = 90;
export function reviewDue(latest: Evaluation | undefined) {
  if (!latest) return true;
  return Date.now() - new Date(latest.evaluated_on + "T00:00:00").getTime() > REVIEW_DAYS * 864e5;
}
