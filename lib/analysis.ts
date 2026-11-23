/* Match analysis: the events analysts tag on match video, their keyboard shortcuts and outcomes,
 * and the numbers worked out from them. Shared by the tagging screen, playlists, scouting and the AI. */

export type EventKind = {
  key: string;
  label: string;
  /** Single-key shortcut on the tagging screen. */
  hotkey: string;
  /** Outcomes to choose from after tagging (first is the default). */
  outcomes?: string[];
  /** Set pieces can be given a routine name for the set-piece library. */
  setPiece?: boolean;
  /** A phase with a start and an end (press once to start, again to stop), e.g. a press or a counter. */
  phase?: boolean;
  group: "attack" | "defend" | "set" | "phase" | "other";
};

export const EVENT_KINDS: EventKind[] = [
  { key: "goal", label: "Goal", hotkey: "g", group: "attack", outcomes: ["open play", "set piece", "penalty", "own goal"] },
  { key: "shot", label: "Shot", hotkey: "s", group: "attack", outcomes: ["on target", "off target", "blocked"] },
  { key: "chance", label: "Chance created", hotkey: "c", group: "attack", outcomes: ["big chance", "half chance"] },
  { key: "box_entry", label: "Box entry", hotkey: "b", group: "attack", outcomes: ["pass", "carry", "cross"] },
  { key: "final_third", label: "Final-third entry", hotkey: "f", group: "attack", outcomes: ["pass", "carry"] },
  { key: "cross", label: "Cross", hotkey: "x", group: "attack", outcomes: ["completed", "not completed"] },
  { key: "dribble", label: "1v1", hotkey: "d", group: "attack", outcomes: ["won", "lost"] },
  { key: "turnover_won", label: "Ball won", hotkey: "w", group: "defend", outcomes: ["tackle", "interception", "press"] },
  { key: "turnover_lost", label: "Ball lost", hotkey: "l", group: "defend", outcomes: ["bad pass", "tackled", "out of play"] },
  { key: "save", label: "Save", hotkey: "v", group: "defend", outcomes: ["caught", "parried", "tipped over"] },
  { key: "foul", label: "Foul", hotkey: "o", group: "defend", outcomes: ["no card", "yellow", "red"] },
  { key: "corner", label: "Corner", hotkey: "k", group: "set", setPiece: true, outcomes: ["shot", "goal", "cleared", "kept the ball"] },
  { key: "free_kick", label: "Free kick", hotkey: "r", group: "set", setPiece: true, outcomes: ["shot", "goal", "delivered", "cleared", "short"] },
  { key: "throw_in", label: "Long throw", hotkey: "h", group: "set", setPiece: true, outcomes: ["shot", "cleared", "kept the ball"] },
  { key: "build_up", label: "Build-up", hotkey: "u", group: "phase", phase: true, outcomes: ["reached final third", "lost it", "went long"] },
  { key: "counter", label: "Counter-attack", hotkey: "a", group: "phase", phase: true, outcomes: ["shot", "box entry", "slowed down", "lost it"] },
  { key: "press", label: "High press", hotkey: "p", group: "phase", phase: true, outcomes: ["won it", "forced long", "broken"] },
  { key: "note", label: "Moment", hotkey: "m", group: "other" },
];
export const KIND_BY_KEY = new Map(EVENT_KINDS.map((k) => [k.key, k]));
export const KIND_BY_HOTKEY = new Map(EVENT_KINDS.map((k) => [k.hotkey, k]));
export const kindLabel = (k: string, codes?: EventKind[]) => codes?.find((c) => c.key === k)?.label ?? KIND_BY_KEY.get(k)?.label ?? k;
/** Keys the tagging screen keeps for itself (playback, team, undo, numbers). */
export const RESERVED_KEYS = new Set(["t", "z", " ", "[", "]", "\\", ",", ".", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9"]);

export type MatchEvent = {
  id: string;
  match_id: string;
  t: number;
  kind: string;
  team: "us" | "them";
  player_id: string | null;
  shirt: number | null;
  x: number | null;
  y: number | null;
  outcome: string;
  routine: string;
  note: string;
  pre: number;
  post: number;
  /** End of a phase (press, counter...); null for a moment. */
  t_end?: number | null;
  title?: string;
  drawing?: Drawing | null;
  created_at: string;
};

/* ---------- Drawings on a paused frame (telestration) ---------- */
export type Shape = { type: "arrow" | "line" | "circle" | "zone" | "free" | "spot"; pts: [number, number][]; color: string };
/** Shapes in 0–1 video coordinates, shown at `at` seconds (the clip pauses for `hold` seconds). */
export type Drawing = { at: number; hold: number; shapes: Shape[] };

/* ---------- The match clock ---------- */
export type Period = { label: string; start: number; base: number };
/** Match minute for a video time, e.g. "23'" or "45+2'", using when each half kicked off in the video. */
export function matchMinute(t: number, periods: Period[]): string | null {
  const p = [...periods].sort((a, b) => b.start - a.start).find((x) => t >= x.start);
  if (!p) return null;
  const min = Math.floor((t - p.start) / 60) + 1 + p.base;
  const cap = p.base + 45;
  return min > cap && p.base < 90 ? `${cap}+${min - cap}'` : `${min}'`;
}
export function minuteNumber(t: number, periods: Period[]): number | null {
  const p = [...periods].sort((a, b) => b.start - a.start).find((x) => t >= x.start);
  return p ? (t - p.start) / 60 + p.base : null;
}

/* ---------- Expected goals ---------- */
/** A simple location model (distance and angle to goal) for open-play shots: a guide, not an elite model.
 *  x, y are 0–100 on a 105 × 68 pitch with us attacking to the right; their shots attack to the left. */
export function xg(e: Pick<MatchEvent, "kind" | "team" | "x" | "y" | "outcome">): number | null {
  if (e.kind !== "shot" && e.kind !== "goal") return null;
  if (e.kind === "goal" && e.outcome === "penalty") return 0.76;
  if (e.kind === "goal" && e.outcome === "own goal") return null;
  if (e.x === null || e.y === null) return null;
  const px = (e.x / 100) * 105;
  const py = (e.y / 100) * 68;
  const gx = e.team === "us" ? 105 : 0;
  const dx = Math.abs(gx - px);
  const dy = Math.abs(py - 34);
  const dist = Math.hypot(dx, dy);
  // Angle the goal mouth (7.32 m) makes from the shot.
  const a1 = Math.atan2(34 + 3.66 - py, dx);
  const a2 = Math.atan2(34 - 3.66 - py, dx);
  const angle = Math.abs(a1 - a2);
  const logit = 0.09 + 1.5 * angle - 0.16 * dist;
  void dy;
  return Math.min(0.95, Math.max(0.01, 1 / (1 + Math.exp(-logit))));
}

/* ---------- Sportscode XML (export and import) ---------- */
const xmlEsc = (s: string) => s.replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[c]!);
export function sportscodeXml(events: MatchEvent[], label: (k: string) => string, playerName: (id: string | null) => string, teamName: { us: string; them: string }) {
  const inst = events.map((e, i) => {
    const start = Math.max(0, e.t - e.pre);
    const end = (e.t_end ?? e.t) + e.post;
    const labels: [string, string][] = [
      ["Team", teamName[e.team]],
      ...(e.player_id ? ([["Player", playerName(e.player_id)]] as [string, string][]) : []),
      ...(e.shirt !== null && !e.player_id ? ([["Shirt", String(e.shirt)]] as [string, string][]) : []),
      ...(e.outcome ? ([["Outcome", e.outcome]] as [string, string][]) : []),
      ...(e.routine ? ([["Routine", e.routine]] as [string, string][]) : []),
    ];
    return `  <instance>\n    <ID>${i + 1}</ID>\n    <start>${start.toFixed(2)}</start>\n    <end>${end.toFixed(2)}</end>\n    <code>${xmlEsc(label(e.kind))}</code>\n${labels.map(([g, t]) => `    <label>\n      <group>${xmlEsc(g)}</group>\n      <text>${xmlEsc(t)}</text>\n    </label>`).join("\n")}${e.note ? `\n    <free_text>${xmlEsc(e.note)}</free_text>` : ""}\n  </instance>`;
  });
  return `<?xml version="1.0" encoding="utf-8"?>\n<file>\n<ALL_INSTANCES>\n${inst.join("\n")}\n</ALL_INSTANCES>\n</file>\n`;
}
export type ImportedInstance = { start: number; end: number; code: string; labels: Record<string, string>; note: string };
export function parseSportscode(xml: string): ImportedInstance[] {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.querySelector("parsererror")) throw new Error("That file isn't valid XML.");
  return [...doc.querySelectorAll("instance")]
    .map((n) => {
      const labels: Record<string, string> = {};
      n.querySelectorAll("label").forEach((l) => {
        const g = l.querySelector("group")?.textContent?.trim() || "Label";
        labels[g] = l.querySelector("text")?.textContent?.trim() ?? "";
      });
      return {
        start: Number(n.querySelector("start")?.textContent ?? NaN),
        end: Number(n.querySelector("end")?.textContent ?? NaN),
        code: n.querySelector("code")?.textContent?.trim() ?? "",
        labels,
        note: n.querySelector("free_text")?.textContent?.trim() ?? "",
      };
    })
    .filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.code);
}
export type ClipPlaylist = { id: string; team_id: string; title: string; note: string; items: { event_id: string }[]; updated_at: string };
export type ScoutingReport = {
  id: string;
  team_id: string;
  opponent: string;
  match_id: string | null;
  formation: string;
  sections: Partial<Record<ScoutSection, string>>;
  key_players: { shirt: number | null; name: string; note: string }[];
  clips: { event_id: string }[];
  updated_at: string;
};
export type ScoutSection = "in_possession" | "out_of_possession" | "transitions" | "set_pieces" | "how_to_beat";
export const SCOUT_SECTIONS: { key: ScoutSection; label: string; hint: string }[] = [
  { key: "in_possession", label: "In possession", hint: "How they build up, who they look for, where they attack." },
  { key: "out_of_possession", label: "Out of possession", hint: "Press height and triggers, block shape, who's weak defending." },
  { key: "transitions", label: "Transitions", hint: "What they do when they win or lose the ball." },
  { key: "set_pieces", label: "Set pieces", hint: "Corner and free-kick routines, who's dangerous, how they defend them." },
  { key: "how_to_beat", label: "How we beat them", hint: "Our three key messages for the players." },
];

export const clock = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

/** Counts per kind for each team, and per player (ours). */
export function tally(events: MatchEvent[]) {
  const team = { us: new Map<string, number>(), them: new Map<string, number>() };
  const players = new Map<string, Map<string, number>>();
  for (const e of events) {
    const k = e.kind === "shot" && e.outcome === "on target" ? ["shot", "shot_on"] : e.kind === "goal" ? ["goal", "shot", "shot_on"] : [e.kind];
    for (const kk of k) {
      team[e.team].set(kk, (team[e.team].get(kk) ?? 0) + 1);
      if (e.team === "us" && e.player_id) {
        const m = players.get(e.player_id) ?? new Map<string, number>();
        m.set(kk, (m.get(kk) ?? 0) + 1);
        players.set(e.player_id, m);
      }
    }
  }
  return { team, players };
}

/** One line per player for the AI feedback, e.g. "tagged: 3 shots (2 on target), 1 chance created, lost the ball 4 times". */
export function playerTagLine(counts: Map<string, number> | undefined) {
  if (!counts?.size) return "";
  const n = (k: string) => counts.get(k) ?? 0;
  return [
    n("goal") && `${n("goal")} goal${n("goal") > 1 ? "s" : ""}`,
    n("shot") && `${n("shot")} shot${n("shot") > 1 ? "s" : ""} (${n("shot_on")} on target)`,
    n("chance") && `${n("chance")} chance${n("chance") > 1 ? "s" : ""} created`,
    n("box_entry") && `${n("box_entry")} box entr${n("box_entry") > 1 ? "ies" : "y"}`,
    n("final_third") && `${n("final_third")} final-third entr${n("final_third") > 1 ? "ies" : "y"}`,
    n("dribble") && `${n("dribble")} 1v1s`,
    n("turnover_won") && `won the ball ${n("turnover_won")} time${n("turnover_won") > 1 ? "s" : ""}`,
    n("turnover_lost") && `lost the ball ${n("turnover_lost")} time${n("turnover_lost") > 1 ? "s" : ""}`,
    n("save") && `${n("save")} save${n("save") > 1 ? "s" : ""}`,
  ]
    .filter(Boolean)
    .join(", ");
}

/** CSV for analysts (Excel, Sportscode-style imports). */
export function eventsCsv(events: MatchEvent[], playerName: (id: string | null) => string) {
  const head = ["time", "seconds", "event", "team", "player", "shirt", "outcome", "routine", "x", "y", "note"];
  const esc = (v: unknown) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const rows = events.map((e) => [clock(e.t), e.t.toFixed(1), kindLabel(e.kind), e.team, playerName(e.player_id), e.shirt ?? "", e.outcome, e.routine, e.x ?? "", e.y ?? "", e.note]);
  return [head, ...rows].map((r) => r.map(esc).join(",")).join("\n");
}

/** Where a video link plays from. */
export type VideoSource = { kind: "mp4"; url: string } | { kind: "youtube"; id: string } | { kind: "none"; reason: string };
export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|live\/|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return m?.[1] ?? null;
}
