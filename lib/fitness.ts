/*
 * Overlap's fitness tests: what each one measures, how to run it, how it's scored, and a rough guide
 * to typical results by age. The guide is deliberately broad (there's no single official standard for
 * junior footballers) and clubs can change it.
 */

export type FitnessGroup = "speed" | "endurance" | "skills";
export type AgeGroup = "u10" | "u12" | "u14" | "u16" | "open";
export type FitnessTest = {
  key: string;
  name: string;
  short: string;
  group: FitnessGroup;
  unit: string;
  /** How results read: seconds to 2 places, a mm:ss time trial, a level/speed to 1 place, or a count. */
  format: "secs" | "mmss" | "dec1" | "count";
  lowerIsBetter: boolean;
  /** Attempts on a test day (the best counts). */
  attempts: number;
  /** "stopwatch" runs one player at a time; "gacon" runs everyone together on the 45-15 timer; "enter" is typed in. */
  mode: "stopwatch" | "gacon" | "enter";
  measures: string;
  diagram: "sprint" | "505" | "illinois" | "ttest" | "yoyo" | "beep" | "loop" | "juggle" | "pass" | "slalom" | "gacon";
  setup: string[];
  steps: string[];
  scoring: string;
  tips: string[];
  /** Typical range (low, high) for each age group. For lower-is-better tests, below `low` is strong. */
  typical: Record<AgeGroup, [number, number]>;
};

export const GROUP_LABEL: Record<FitnessGroup, string> = { speed: "Speed & agility", endurance: "Endurance", skills: "Football skills" };
export const AGE_LABEL: Record<AgeGroup, string> = { u10: "Under 10", u12: "U11–U12", u14: "U13–U14", u16: "U15–U16", open: "U17 & senior" };

/** Gacon 45-15: start speed and step. Each stage is 45 s running, 15 s rest. */
export const GACON = { startKmh: 8, stepKmh: 0.5, stages: 22 };
export const gaconStage = (n: number) => {
  const kmh = GACON.startKmh + GACON.stepKmh * (n - 1);
  return { n, kmh, metres: Math.round(((kmh * 1000) / 3600) * 45 * 100) / 100 };
};

export const TESTS: FitnessTest[] = [
  {
    key: "sprint_10",
    name: "10m sprint",
    short: "10m",
    group: "speed",
    unit: "s",
    format: "secs",
    lowerIsBetter: true,
    attempts: 2,
    mode: "stopwatch",
    measures: "Acceleration: how quickly a player gets going from standing.",
    diagram: "sprint",
    setup: ["Two cones 10 m apart in a straight line on flat grass.", "A start line 0.5 m behind the first cone, so the watch starts on the player's first movement."],
    steps: ["Player starts in a split stance behind the line. No rocking.", "Start the stopwatch on their first movement.", "Stop it as their chest crosses the finish cones.", "Rest at least 2 minutes, then a second try."],
    scoring: "Best of 2 tries, in seconds.",
    tips: ["Do it at the start of the session after a good warm-up, never when players are tired.", "Use the same surface and footwear each time so results compare."],
    typical: { u10: [2.3, 2.6], u12: [2.15, 2.4], u14: [2.0, 2.25], u16: [1.9, 2.1], open: [1.75, 1.95] },
  },
  {
    key: "sprint_20",
    name: "20m sprint",
    short: "20m",
    group: "speed",
    unit: "s",
    format: "secs",
    lowerIsBetter: true,
    attempts: 2,
    mode: "stopwatch",
    measures: "Speed over a typical match sprint distance.",
    diagram: "sprint",
    setup: ["Two cones 20 m apart in a straight line on flat grass.", "Space after the finish so players can slow down safely."],
    steps: ["Player starts in a split stance behind the line.", "Start on first movement, stop as their chest crosses the finish.", "Two tries with at least 2 minutes rest."],
    scoring: "Best of 2 tries, in seconds.",
    tips: ["Run them through the finish: tell players to sprint to a cone 5 m past the line."],
    typical: { u10: [4.0, 4.5], u12: [3.75, 4.15], u14: [3.45, 3.85], u16: [3.25, 3.6], open: [3.05, 3.35] },
  },
  {
    key: "sprint_30",
    name: "30m sprint",
    short: "30m",
    group: "speed",
    unit: "s",
    format: "secs",
    lowerIsBetter: true,
    attempts: 2,
    mode: "stopwatch",
    measures: "Top speed over a longer sprint.",
    diagram: "sprint",
    setup: ["Two cones 30 m apart in a straight line.", "10 m of space after the finish to slow down."],
    steps: ["Split-stance start behind the line.", "Start on first movement, stop as the chest crosses the finish.", "Two tries, at least 3 minutes rest."],
    scoring: "Best of 2 tries, in seconds.",
    tips: ["For older squads, a 10m split on the same run shows acceleration and top speed together."],
    typical: { u10: [5.6, 6.2], u12: [5.2, 5.7], u14: [4.8, 5.3], u16: [4.5, 4.95], open: [4.2, 4.6] },
  },
  {
    key: "agility_505",
    name: "5-0-5 agility",
    short: "5-0-5",
    group: "speed",
    unit: "s",
    format: "secs",
    lowerIsBetter: true,
    attempts: 2,
    mode: "stopwatch",
    measures: "Turning speed: stopping, turning 180° and accelerating again.",
    diagram: "505",
    setup: ["Three lines: a start line, a timing line 10 m on, and a turning line 5 m past that (15 m in total)."],
    steps: ["Player sprints from the start line through the timing line.", "Start the stopwatch as they cross the timing line.", "They plant a foot on the turning line, turn 180° and sprint back.", "Stop the watch as they cross the timing line again.", "Two tries: one turning on the left foot, one on the right."],
    scoring: "Best of 2 tries, in seconds (timed over the 5 m in and 5 m out).",
    tips: ["A foot must touch the turning line or the try doesn't count.", "Note which foot turns faster: big gaps are worth working on."],
    typical: { u10: [3.0, 3.3], u12: [2.8, 3.1], u14: [2.6, 2.9], u16: [2.45, 2.75], open: [2.3, 2.6] },
  },
  {
    key: "illinois",
    name: "Illinois agility",
    short: "Illinois",
    group: "speed",
    unit: "s",
    format: "secs",
    lowerIsBetter: true,
    attempts: 1,
    mode: "stopwatch",
    measures: "Agility on a weaving course with changes of direction.",
    diagram: "illinois",
    setup: ["A 10 m × 5 m box with a cone at each corner.", "Four cones down the middle line, 3.3 m apart."],
    steps: ["Player lies face down at the start cone, hands by shoulders.", "On 'Go', get up, sprint 10 m, turn, come back.", "Weave up through the middle cones and back down.", "Sprint 10 m up and back to finish at the end cone."],
    scoring: "One timed run, in seconds.",
    tips: ["Walk everyone through the course once slowly first; most mistakes are wrong turns."],
    typical: { u10: [19.5, 21.5], u12: [18.5, 20.5], u14: [17.5, 19.5], u16: [16.8, 18.5], open: [15.8, 17.5] },
  },
  {
    key: "t_test",
    name: "T-test",
    short: "T-test",
    group: "speed",
    unit: "s",
    format: "secs",
    lowerIsBetter: true,
    attempts: 2,
    mode: "stopwatch",
    measures: "Forwards, sideways and backwards movement.",
    diagram: "ttest",
    setup: ["Cone A start, cone B 10 m straight ahead.", "Cones C and D 5 m either side of B, making a T."],
    steps: ["Sprint from A to B and touch it.", "Shuffle sideways to C and touch it (don't cross your feet).", "Shuffle to D, touch it, shuffle back to B.", "Run backwards to A."],
    scoring: "Best of 2 tries, in seconds.",
    tips: ["Players must face forwards throughout. Crossing feet or not touching a cone is a re-run."],
    typical: { u10: [13.5, 15.0], u12: [12.5, 14.0], u14: [11.5, 13.0], u16: [10.8, 12.2], open: [10.0, 11.5] },
  },
  {
    key: "gacon",
    name: "Gacon 45-15",
    short: "Gacon",
    group: "endurance",
    unit: "km/h",
    format: "dec1",
    lowerIsBetter: false,
    attempts: 1,
    mode: "gacon",
    measures: "Aerobic capacity and the ability to repeat hard efforts, with a mental-toughness edge: runs get faster every minute.",
    diagram: "gacon",
    setup: [
      "Use the pitch perimeter (or a running track). Mark a start line.",
      "Place a cone at each distance in the cone table, measured from the start line around the perimeter. Each stage's cone is where that stage's run should finish.",
      "Overlap's timer gives the beeps: one to start each 45 s run and one to stop for the 15 s rest.",
    ],
    steps: [
      "Stage 1 is 8 km/h: players run 100 m in 45 s.",
      "When the rest beep goes they stop at (or before) that stage's cone and rest 15 s where they are.",
      "On the next beep they carry on around the perimeter to the next cone. Each stage adds 0.5 km/h (6.25 m more in 45 s).",
      "A player is out when they don't reach the cone before the rest beep twice in a row, or they stop.",
      "Tap each player in the app the moment they're out; Overlap saves their last completed stage.",
    ],
    scoring: "The speed of the last stage completed, in km/h. A rough estimate of maximal aerobic speed.",
    tips: [
      "Run groups of 6–10 with a coach watching each side of the pitch.",
      "Starting at 8 km/h suits juniors; strong senior squads can still start there, it just takes a few easy stages.",
      "Players will want to jog early stages too fast: tell them to hit each cone just as the beep goes.",
    ],
    typical: { u10: [11.5, 13.5], u12: [12.5, 14.5], u14: [13.5, 15.5], u16: [14.5, 16.5], open: [15.5, 18.0] },
  },
  {
    key: "yoyo_ir1",
    name: "Yo-Yo IR1",
    short: "Yo-Yo",
    group: "endurance",
    unit: "level",
    format: "dec1",
    lowerIsBetter: false,
    attempts: 1,
    mode: "enter",
    measures: "Ability to recover between repeated high-intensity runs, like in a match.",
    diagram: "yoyo",
    setup: ["Two lines 20 m apart, plus a recovery cone 5 m behind the start line.", "The Yo-Yo IR1 audio track on a speaker."],
    steps: ["Run 20 m out and 20 m back in time with the beeps.", "After each 40 m, jog to the recovery cone and back during the 10 s rest.", "The beeps get faster each level.", "Out after missing the line twice."],
    scoring: "Last level and shuttle completed (e.g. 15.4).",
    tips: ["Type each player's level from your sheet after the test."],
    typical: { u10: [11.5, 13.5], u12: [12.5, 14.5], u14: [13.5, 15.5], u16: [14.5, 16.5], open: [15.5, 17.5] },
  },
  {
    key: "beep",
    name: "Beep test",
    short: "Beep",
    group: "endurance",
    unit: "level",
    format: "dec1",
    lowerIsBetter: false,
    attempts: 1,
    mode: "enter",
    measures: "Continuous aerobic fitness.",
    diagram: "beep",
    setup: ["Two lines 20 m apart.", "The beep test audio on a speaker."],
    steps: ["Run between the lines in time with the beeps.", "The beeps get faster every minute.", "Out after missing the line twice in a row."],
    scoring: "Last level and shuttle reached (e.g. 8.5).",
    tips: ["Type each player's level from your sheet after the test."],
    typical: { u10: [4, 6], u12: [5, 7.5], u14: [6.5, 9], u16: [7.5, 10], open: [9, 12] },
  },
  {
    key: "trial_1k",
    name: "1km time trial",
    short: "1km",
    group: "endurance",
    unit: "",
    format: "mmss",
    lowerIsBetter: true,
    attempts: 1,
    mode: "enter",
    measures: "Running endurance over a set distance.",
    diagram: "loop",
    setup: ["Measure a loop (a pitch perimeter is roughly 340–360 m) and work out the laps for 1 km."],
    steps: ["Everyone starts together.", "Call out lap times so players can pace themselves.", "Note each finish time."],
    scoring: "Finish time (minutes:seconds).",
    tips: ["Type times as 4:05 or 245 (seconds)."],
    typical: { u10: [270, 330], u12: [240, 300], u14: [220, 270], u16: [200, 250], open: [190, 230] },
  },
  {
    key: "trial_2k",
    name: "2km time trial",
    short: "2km",
    group: "endurance",
    unit: "",
    format: "mmss",
    lowerIsBetter: true,
    attempts: 1,
    mode: "enter",
    measures: "Longer running endurance.",
    diagram: "loop",
    setup: ["Measure a loop and work out the laps for 2 km."],
    steps: ["Everyone starts together.", "Call out lap times.", "Note each finish time."],
    scoring: "Finish time (minutes:seconds).",
    tips: ["Type times as 8:30 or 510 (seconds)."],
    typical: { u10: [600, 720], u12: [540, 660], u14: [480, 600], u16: [450, 540], open: [420, 500] },
  },
  {
    key: "juggling",
    name: "Juggling",
    short: "Juggling",
    group: "skills",
    unit: "touches",
    format: "count",
    lowerIsBetter: false,
    attempts: 2,
    mode: "enter",
    measures: "Ball control and touch.",
    diagram: "juggle",
    setup: ["A ball each, players spread out in pairs (one juggles, one counts)."],
    steps: ["Start with the ball in the hands or flicked up.", "Count every touch with feet, thighs or head before the ball hits the ground.", "Two tries."],
    scoring: "Best of 2, number of touches.",
    tips: ["Cap it at 200 so the session keeps moving."],
    typical: { u10: [10, 30], u12: [20, 60], u14: [40, 100], u16: [60, 150], open: [80, 200] },
  },
  {
    key: "weak_foot",
    name: "Weak-foot passing",
    short: "Weak foot",
    group: "skills",
    unit: "/10",
    format: "count",
    lowerIsBetter: false,
    attempts: 1,
    mode: "enter",
    measures: "Passing accuracy with the weaker foot.",
    diagram: "pass",
    setup: ["A 1 m wide gate 12 m away (U10: 8 m)."],
    steps: ["10 passes with the weaker foot, ball stopped each time.", "Count the passes that go through the gate."],
    scoring: "Passes through the gate, out of 10.",
    tips: ["Let players warm up their weaker foot for a minute first."],
    typical: { u10: [3, 5], u12: [4, 6], u14: [5, 7], u16: [6, 8], open: [6, 8] },
  },
  {
    key: "slalom",
    name: "Dribble slalom",
    short: "Slalom",
    group: "skills",
    unit: "s",
    format: "secs",
    lowerIsBetter: true,
    attempts: 2,
    mode: "stopwatch",
    measures: "Close control at speed.",
    diagram: "slalom",
    setup: ["6 cones in a line, 2 m apart, with a start line 2 m before the first.", "Players dribble through and back."],
    steps: ["Start with the ball on the line.", "Weave through all cones, round the last one and weave back.", "Stop the watch when ball and player cross the line."],
    scoring: "Best of 2 tries, in seconds. Missing a cone adds 1 second.",
    tips: ["Use any foot. Note the time and the number of missed cones."],
    typical: { u10: [13, 16], u12: [12, 14.5], u14: [11, 13], u16: [10.5, 12], open: [10, 11.5] },
  },
];
export const TEST_BY_KEY = new Map(TESTS.map((t) => [t.key, t]));

/** Rough age from a birth year, else from the team ("U14" -> 13). */
export function ageGroupFor(birthYear: number | null | undefined, teamName: string): AgeGroup {
  let age = birthYear ? new Date().getFullYear() - birthYear : null;
  if (age === null) {
    const m = teamName.match(/\bU\s?(\d{1,2})\b/i);
    age = m ? Number(m[1]) - 1 : 18;
  }
  return age <= 9 ? "u10" : age <= 11 ? "u12" : age <= 13 ? "u14" : age <= 15 ? "u16" : "open";
}

export type BandOverride = { test_key: string; age_group: AgeGroup; typical_low: number; typical_high: number };
export function typicalFor(test: FitnessTest, group: AgeGroup, overrides: BandOverride[] = []): [number, number] {
  const o = overrides.find((x) => x.test_key === test.key && x.age_group === group);
  return o ? [Number(o.typical_low), Number(o.typical_high)] : test.typical[group];
}

/** Where a result sits: 0 (developing) to 1 (strong), with typical between 1/3 and 2/3. */
export function bandPosition(test: FitnessTest, value: number, [lo, hi]: [number, number]) {
  const t = (value - lo) / (hi - lo); // 0 at low edge, 1 at high edge
  const better = test.lowerIsBetter ? 1 - t : t; // 0..1 inside typical, better is higher
  return Math.max(0.03, Math.min(0.97, 1 / 3 + better / 3));
}
export function bandWord(pos: number) {
  return pos < 1 / 3 ? "Developing" : pos <= 2 / 3 ? "Typical" : "Strong";
}

export function formatResult(test: FitnessTest, v: number) {
  if (test.format === "secs") return `${v.toFixed(2)}s`;
  if (test.format === "mmss") return `${Math.floor(v / 60)}:${String(Math.round(v % 60)).padStart(2, "0")}`;
  if (test.format === "dec1") return `${v.toFixed(1)}${test.unit === "km/h" ? " km/h" : ""}`;
  return `${Math.round(v)}${test.unit === "/10" ? "/10" : ""}`;
}
/** Reads what a coach typed: "4:05" or "245" for time trials, "15.4", "3.38", "74". */
export function parseResult(test: FitnessTest, raw: string): number | null {
  const s = raw.trim().replace(",", ".");
  if (!s) return null;
  if (test.format === "mmss" && s.includes(":")) {
    const [m, sec] = s.split(":").map(Number);
    return Number.isFinite(m) && Number.isFinite(sec) ? m * 60 + sec : null;
  }
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export const better = (test: FitnessTest, a: number, b: number) => (test.lowerIsBetter ? a < b : a > b);
export const bestOf = (test: FitnessTest, vals: number[]) => (vals.length ? (test.lowerIsBetter ? Math.min(...vals) : Math.max(...vals)) : null);
