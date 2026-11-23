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
  group: "attack" | "defend" | "set" | "other";
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
  { key: "note", label: "Moment", hotkey: "m", group: "other" },
];
export const KIND_BY_KEY = new Map(EVENT_KINDS.map((k) => [k.key, k]));
export const KIND_BY_HOTKEY = new Map(EVENT_KINDS.map((k) => [k.hotkey, k]));
export const kindLabel = (k: string) => KIND_BY_KEY.get(k)?.label ?? k;

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
  created_at: string;
};
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
