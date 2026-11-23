import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { LIBRARY, AGE_BANDS, THEMES } from "./library-drills";

/* Writes each player's match feedback with Claude. Runs on the server only; the API key never reaches the browser.
 * Privacy: players are sent as "P1", "P2"… with their position and the team's age group. No names, dates of birth
 * or contact details leave Overlap, and names typed into coach notes are swapped for the player's label first. */

export const MODEL = "claude-opus-5-5";

export type AiPlayer = {
  label: string;
  position: string;
  role: "start" | "bench";
  minutes: number | null;
  goals: number;
  assists: number;
  yellow: number;
  red: number;
  rating: number | null;
  shots: number;
  on_target: number;
  key_passes: number;
  tackles: number;
  saves: number;
  notes: string;
  moments: { t: string; note: string }[];
  goals_now: { area: string; title: string }[];
  recent: string[];
  /** Estimates from automatic video analysis, if the player was identified by shirt number. */
  video?: string;
  /** Events the analyst tagged for this player on the match video. */
  tags?: string;
};
export type AiMatch = {
  ageGroup: string;
  opponent: string;
  homeAway: string;
  competition: string;
  ourScore: number | null;
  theirScore: number | null;
  lengthMins: number;
  teamReport: string;
  focus: string;
  /** From automatic video analysis, if the coach ran it: e.g. "Possession 58% us, 42% them". */
  videoStats?: string;
};
export type AiDrill = { ref: string; name: string; kind: string; ages: string; about: string };

const AREAS = ["technical", "tactical", "physical", "psychological", "social"] as const;

const Report = z.object({
  player: z.string().describe('The player\'s label, e.g. "P3".'),
  headline: z.string().describe("One encouraging sentence (max ~20 words) summing up their game."),
  went_well: z.array(z.string()).describe("2-3 specific things that went well, each one sentence, grounded in the stats or coach notes."),
  work_on: z
    .array(z.object({ title: z.string().describe("Short name of the focus, e.g. 'Scanning before receiving'."), how: z.string().describe("1-2 sentences: what to do differently and how to practise it.") }))
    .describe("1-2 things to work on. Never more than 2."),
  drills: z.array(z.object({ ref: z.string().describe("A ref copied exactly from the drill list."), why: z.string().describe("One sentence linking the drill to their work-on point.") })).describe("1-3 drills from the list for next training."),
  goal_ideas: z
    .array(z.object({ area: z.enum(AREAS), title: z.string().describe("A goal the player can achieve in 4-8 weeks, max 12 words."), detail: z.string().describe("How the coach will know it's achieved.") }))
    .describe("0-2 development goal ideas. Leave empty if their current goals already cover it."),
});
const Output = z.object({ reports: z.array(Report) });
export type AiReport = z.infer<typeof Report>;

const SYSTEM = `You are an experienced, warm grassroots football (soccer) coach-educator in Australia. You write short, personal post-match feedback for individual players, based only on the coach's stats and notes.

Who reads it: the player and their parents, so write to the player as "you" in plain, friendly Australian English. Match the age group: for under-12s use very simple words and focus on effort, enjoyment and one skill; for teenagers you can be more tactical; for seniors be direct.

Rules:
- Be specific and honest. Ground every point in the numbers, the coach's notes or the moments listed for that player. Never invent events, minutes, goals or moments that aren't in the data.
- If a player has little data (no notes, few stats), keep it short and general rather than guessing; praise effort and pick one sensible focus for their position.
- Strengths first. Keep "work on" to 1-2 points, framed positively ("Next step: ...").
- Never compare players with each other, never mention other players' labels, never criticise their character, body, weight or ability to be selected. Nothing about injuries or health.
- Ratings are the coach's private guide. Never quote the rating number.
- Drills: only use refs from the drill list, copied exactly. Prefer the club's own drills when they fit. Pick drills that suit the age group.
- Goal ideas must be achievable, measurable and different from the player's current goals.
- Write one report for every player listed, using their label.`;

export function drillCatalogue(club: { id: string; name: string; category: string; description: string }[]): AiDrill[] {
  const oneLine = (s: string) => s.replace(/\s+/g, " ").trim().slice(0, 110);
  return [
    ...club.slice(0, 150).map((d) => ({ ref: `club:${d.id}`, name: d.name, kind: d.category, ages: "any", about: oneLine(d.description) })),
    ...LIBRARY.map((d) => ({ ref: `lib:${d.key}`, name: d.name, kind: THEMES[d.theme], ages: d.ages.map((a) => AGE_BANDS[a]).join(", "), about: oneLine(d.description.split("\n")[0].replace(/^What it's for:\s*/i, "")) })),
  ];
}

function prompt(match: AiMatch, players: AiPlayer[]) {
  const score = match.ourScore !== null && match.theirScore !== null ? `${match.ourScore}-${match.theirScore}` : "not recorded";
  const lines = players.map((p) => {
    const stat = [
      `${p.role === "start" ? "Started" : "Bench"}`,
      p.minutes !== null ? `${p.minutes} of ${match.lengthMins} mins` : "minutes not recorded",
      p.rating !== null ? `coach rating ${p.rating}/10 (private)` : "",
      p.goals ? `${p.goals} goal(s)` : "",
      p.assists ? `${p.assists} assist(s)` : "",
      `shots ${p.shots} (${p.on_target} on target)`,
      `key passes ${p.key_passes}`,
      `tackles/interceptions ${p.tackles}`,
      p.position === "GK" ? `saves ${p.saves}` : "",
      p.yellow ? `${p.yellow} yellow card` : "",
      p.red ? "sent off" : "",
    ]
      .filter(Boolean)
      .join(", ");
    return [
      `<player label="${p.label}" position="${p.position}">`,
      `Stats: ${stat}.`,
      p.notes ? `Coach notes: ${p.notes}` : "Coach notes: none.",
      p.moments.length ? `Moments to watch back: ${p.moments.map((m) => `${m.t} ${m.note}`).join("; ")}` : "",
      p.goals_now.length ? `Current development goals: ${p.goals_now.map((g) => `${g.title} (${g.area})`).join("; ")}` : "Current development goals: none.",
      p.recent.length ? `Focus from their recent match feedback: ${p.recent.join("; ")}` : "",
      p.video ? `From automatic video analysis (an estimate, partial): ${p.video}` : "",
      p.tags ? `Tagged on the match video by the analyst: ${p.tags}` : "",
      `</player>`,
    ]
      .filter(Boolean)
      .join("\n");
  });
  return [
    `<match>`,
    `Age group: ${match.ageGroup || "not given"}. Opponent: ${match.opponent} (${match.homeAway}${match.competition ? `, ${match.competition}` : ""}). Score: ${score}. Match length: ${match.lengthMins} mins.`,
    match.focus ? `What the team has been working on at training: ${match.focus}` : "",
    match.teamReport ? `Coach's team report: ${match.teamReport}` : "",
    match.videoStats ? `From automatic video analysis (an estimate): ${match.videoStats}` : "",
    `</match>`,
    ``,
    ...lines,
    ``,
    `Write a report for each of these ${players.length} players.`,
  ]
    .filter((x) => x !== "")
    .join("\n");
}

/** Swap any squad names in free text for the player labels before it leaves Overlap. */
const WORDS = new Set("will may mark grant hope faith joy rose sky summer bill art max rich long short young little brown green white black king hunter mason miller cook baker fox wolf bear hill wood ford page bell lane field rock stone hall gray grey love sunny chase hunter carter ray dash ace drew rob pat sue ben jay kit".split(" "));

export function scrubNames(text: string, names: { full: string; label: string }[]) {
  let out = text;
  // Names match in any case ("leo" too), except names that are also everyday words ("Will", "Grant"),
  // which only match when capitalised.
  const parts = names
    .flatMap((n) => [
      { w: n.full, label: n.label, flags: n.full.split(/\s+/).every((w) => WORDS.has(w.toLowerCase())) ? "g" : "gi" },
      ...n.full
        .split(/\s+/)
        .filter((w) => w.length > 1)
        .map((w) => ({ w, label: n.label, flags: WORDS.has(w.toLowerCase()) ? "g" : "gi" })),
    ])
    .sort((a, b) => b.w.length - a.w.length);
  const esc = (w: string) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  for (const { w, label, flags } of parts) {
    const cap = flags === "g" ? w.charAt(0).toUpperCase() + w.slice(1) : w;
    out = out.replace(new RegExp(`(?<![\\w'])${esc(cap)}(?![\\w'])`, flags), label);
  }
  return out;
}

export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY || process.env.MATCH_AI_MOCK === "1";
}

export async function writeReports(match: AiMatch, players: AiPlayer[], drills: AiDrill[]): Promise<AiReport[]> {
  if (!process.env.ANTHROPIC_API_KEY && process.env.MATCH_AI_MOCK === "1") return mock(players, drills);
  const client = new Anthropic();
  const catalogue = drills.map((d) => `${d.ref} | ${d.name} | ${d.kind} | ages: ${d.ages} | ${d.about}`).join("\n");
  const request = {
    model: MODEL,
    max_tokens: 32000,
    output_config: { effort: "medium" as const, format: betaZodOutputFormat(Output) },
    system: [
      { type: "text" as const, text: SYSTEM },
      { type: "text" as const, text: `<drill_list>\nref | name | type | ages | what it's for\n${catalogue}\n</drill_list>`, cache_control: { type: "ephemeral" as const } },
    ],
    messages: [{ role: "user" as const, content: prompt(match, players) }],
  };
  // If the model declines, the API can hand the request to a fallback model in the same call.
  let msg;
  try {
    msg = await client.beta.messages.stream({ ...request, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }).finalMessage();
  } catch (e) {
    if (!(e instanceof Anthropic.BadRequestError)) throw e;
    console.warn("match reports: retrying without fallbacks:", e.message);
    msg = await client.beta.messages.stream(request).finalMessage();
  }
  if (msg.stop_reason === "refusal") throw new Error("The AI couldn't write these reports. Try again, or write them yourself.");
  if (msg.stop_reason === "max_tokens") throw new Error("The reports were too long to finish. Try fewer players at a time.");
  const out = msg.parsed_output;
  if (!out) throw new Error("The AI's answer couldn't be read. Try again.");
  return out.reports;
}

/** Tidy and bound what came back, and keep only drills that exist. */
export function cleanReport(r: AiReport, drills: AiDrill[]) {
  const byRef = new Map(drills.map((d) => [d.ref, d]));
  const t = (s: string, n: number) => s.replace(/\s+/g, " ").trim().slice(0, n);
  return {
    headline: t(r.headline, 200),
    went_well: r.went_well.map((x) => t(x, 300)).filter(Boolean).slice(0, 3),
    work_on: r.work_on
      .map((w) => ({ title: t(w.title, 80), how: t(w.how, 400) }))
      .filter((w) => w.title)
      .slice(0, 2),
    drills: r.drills
      .filter((d) => byRef.has(d.ref))
      .filter((d, i, a) => a.findIndex((x) => x.ref === d.ref) === i)
      .slice(0, 3)
      .map((d) => ({ ref: d.ref, name: byRef.get(d.ref)!.name, why: t(d.why, 300) })),
    goal_ideas: r.goal_ideas
      .map((g) => ({ area: AREAS.includes(g.area) ? g.area : "technical", title: t(g.title, 140), detail: t(g.detail, 500), added: false }))
      .filter((g) => g.title)
      .slice(0, 2),
  };
}

/** Local testing without a key (MATCH_AI_MOCK=1): a plausible, clearly canned answer. */
function mock(players: AiPlayer[], drills: AiDrill[]): AiReport[] {
  const lib = drills.filter((d) => d.ref.startsWith("lib:"));
  return players.map((p, i) => ({
    player: p.label,
    headline: `A hard-working game${p.goals ? ` with ${p.goals} goal${p.goals > 1 ? "s" : ""}` : ""}. Well done.`,
    went_well: [p.key_passes ? `You made ${p.key_passes} key passes that opened up the play.` : "You kept working for the team the whole time you were on.", p.tackles ? `You won the ball back ${p.tackles} times.` : "You showed for the ball and kept it simple."],
    work_on: [{ title: p.position === "FWD" ? "Hitting the target" : "Scanning before receiving", how: "Before the ball comes to you, take a quick look over your shoulder so you already know your next pass." }],
    drills: [{ ref: lib[i % lib.length].ref, why: "It practises exactly this in a game-like way." }],
    goal_ideas: [{ area: "technical", title: "Check your shoulder before every pass you receive", detail: "Coach sees it in 3 games in a row." }],
  }));
}
