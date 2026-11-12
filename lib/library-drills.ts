import type { Category, Diagram, DiagramArrow, DiagramItem } from "./types";

/**
 * Overlap's built-in drill library: original practices written for Overlap, which any club can
 * add to its own drill library (and then change). Diagrams use the 100 × 64 pitch of the drill designer.
 */

export type Theme = "warmup" | "passing" | "1v1" | "possession" | "pressing" | "transition" | "buildup" | "final3rd" | "finishing" | "games";
export type AgeBand = "young" | "youth" | "senior";
export const THEMES: Record<Theme, string> = {
  warmup: "Warm-ups",
  passing: "Passing & movement",
  "1v1": "1v1",
  possession: "Rondos & possession",
  pressing: "Pressing & defending",
  transition: "Transitions",
  buildup: "Build-up & switching",
  final3rd: "Final third",
  finishing: "Finishing",
  games: "Fun & conditioned games",
};
export const AGE_BANDS: Record<AgeBand, string> = { young: "U7–U11", youth: "U12–U16", senior: "U17+ & seniors" };

export type LibraryDrill = {
  key: string;
  name: string;
  theme: Theme;
  category: Category;
  ages: AgeBand[];
  minutes: number;
  player_count: string;
  area: string;
  /** Purpose, setup, how it works and progressions, as plain text with blank lines between parts. */
  description: string;
  points: string[];
  diagram: Diagram;
};

/* ---------- small helpers for drawing ---------- */
const c = (x: number, y: number): DiagramItem => ["c", x, y];
const p = (x: number, y: number, l?: string): DiagramItem => (l ? ["p", x, y, l] : ["p", x, y]);
const o = (x: number, y: number, l?: string): DiagramItem => (l ? ["o", x, y, l] : ["o", x, y]);
const n = (x: number, y: number, l?: string): DiagramItem => (l ? ["n", x, y, l] : ["n", x, y]);
const b = (x: number, y: number): DiagramItem => ["b", x, y];
/** Goal: `y` is the top of the goal (it is 12 tall). Left-hand goals face right. */
const goalR = (y = 26): DiagramItem => ["g", 95, y];
const goalL = (y = 26): DiagramItem => ["g", 2, y, "L"];
const box = (x1: number, y1: number, x2: number, y2: number) => [c(x1, y1), c(x2, y1), c(x2, y2), c(x1, y2)];
const gateV = (x: number, y: number, w = 5) => [c(x, y - w / 2), c(x, y + w / 2)];
const gateH = (x: number, y: number, w = 5) => [c(x - w / 2, y), c(x + w / 2, y)];
const pass = (x1: number, y1: number, x2: number, y2: number): DiagramArrow => ["pass", x1, y1, x2, y2];
const run = (x1: number, y1: number, x2: number, y2: number): DiagramArrow => ["run", x1, y1, x2, y2];
const drib = (x1: number, y1: number, x2: number, y2: number): DiagramArrow => ["drib", x1, y1, x2, y2];
const dia = (items: DiagramItem[], arrows: DiagramArrow[] = [], full = false): Diagram => ({ items, arrows, full });
const text = (...parts: string[]) => parts.join("\n\n");

export const LIBRARY: LibraryDrill[] = [
  /* ============================== Warm-ups ============================== */
  {
    key: "traffic-lights",
    name: "Traffic Lights Dribble",
    theme: "warmup",
    category: "warmup",
    ages: ["young"],
    minutes: 8,
    player_count: "6-16",
    area: "20 × 20 m",
    description: text(
      "What it's for: getting every player on the ball straight away, with close control, changes of pace and listening.",
      "Setup: a 20 × 20 m square. Every player has a ball inside it. The coach stands on the edge.",
      "How it works: players dribble freely. The coach calls a colour. Green: dribble fast into space. Amber: slow down and use sole rolls and small touches. Red: stop the ball dead with the sole and freeze. Last to stop does 3 toe taps.",
      "Progressions:\n• Add \"Purple\": turn and go the other way.\n• Add \"Blue\": swap balls with the nearest player.\n• Make the square smaller so heads have to come up.",
    ),
    points: ["Small touches when it's busy", "Head up to find space", "Use both feet and the sole"],
    diagram: dia(
      [...box(30, 10, 70, 54), p(38, 20), b(40, 21), p(55, 18), b(57, 19), p(62, 34), b(60, 36), p(44, 40), b(46, 41), p(36, 48), b(38, 47), p(56, 46), b(54, 46), n(76, 32, "C")],
      [drib(38, 20, 46, 26), drib(62, 34, 58, 26), drib(44, 40, 50, 34)],
    ),
  },
  {
    key: "gate-hunters",
    name: "Gate Hunters",
    theme: "warmup",
    category: "warmup",
    ages: ["young", "youth"],
    minutes: 10,
    player_count: "8-16 (pairs)",
    area: "25 × 25 m",
    description: text(
      "What it's for: passing accuracy, weight of pass and moving to receive, in a fun competition.",
      "Setup: scatter 8-10 small gates (two cones about 1.5 m apart) around a 25 × 25 m area. Players work in pairs with one ball.",
      "How it works: pairs score a point each time they pass through a gate and the partner controls it on the other side. They can't use the same gate twice in a row. Play 60-second rounds and count the points.",
      "Progressions:\n• Two-touch only, then one-touch through the gate.\n• Weaker foot only.\n• Add two defenders who can guard gates (not tackle).",
    ),
    points: ["Pass with the inside of the foot", "Move to an angle before the pass", "Look for the next free gate early"],
    diagram: dia(
      [
        ...box(24, 6, 76, 58),
        ...gateV(36, 18, 4),
        ...gateV(62, 16, 4),
        ...gateH(48, 32, 4),
        ...gateV(34, 44, 4),
        ...gateV(64, 46, 4),
        p(30, 18),
        b(32, 19),
        p(42, 18),
        p(58, 16),
        p(68, 20),
        p(48, 26),
        p(48, 38),
        p(28, 46),
      ],
      [pass(32, 18, 40, 18), pass(48, 28, 48, 36), run(68, 20, 66, 12)],
    ),
  },
  {
    key: "sharks-minnows",
    name: "Sharks and Minnows",
    theme: "warmup",
    category: "warmup",
    ages: ["young"],
    minutes: 10,
    player_count: "8-20",
    area: "20 × 30 m",
    description: text(
      "What it's for: dribbling with the head up, protecting the ball and changing direction. Young players love it.",
      "Setup: a 20 × 30 m area. Most players (minnows) start on one end line with a ball each. Two players (sharks) start in the middle without a ball.",
      "How it works: on \"Go\", the minnows dribble to the far end without losing their ball. Sharks try to kick balls out of the area. Minnows who lose their ball become sharks. Keep going until one minnow is left.",
      "Progressions:\n• Minnows must stop the ball on the end line to be safe.\n• Add a safe zone in the middle where minnows can rest for 3 seconds.\n• Older groups: sharks win the ball and must keep it, not just kick it out.",
    ),
    points: ["Keep the ball close near a shark", "Change speed to get past", "Use your body to shield"],
    diagram: dia(
      [...box(20, 8, 80, 56), p(24, 16), b(27, 16), p(24, 26), b(27, 26), p(24, 36), b(27, 36), p(24, 46), b(27, 46), o(50, 22), o(52, 42)],
      [drib(27, 16, 46, 12), drib(27, 36, 44, 32), drib(27, 46, 40, 52), run(50, 22, 45, 30)],
    ),
  },
  {
    key: "activation-lanes",
    name: "Ball Activation Lanes",
    theme: "warmup",
    category: "warmup",
    ages: ["youth", "senior"],
    minutes: 12,
    player_count: "8-20",
    area: "4 lanes of 15 m",
    description: text(
      "What it's for: a match-day or session warm-up that mixes movement prep with sharp passing.",
      "Setup: 4 lanes, 15 m long and 5 m apart. Two or three players at each end of a lane, one ball per lane.",
      "How it works: the first player moves down the lane with a movement (skips, side shuffles, high knees, backwards jog), then receives a pass from the far end, plays it back one-touch and joins that queue. Change the movement every 2 lines. Finish with two minutes of faster patterns: pass, follow your pass, and sprint the last 5 m.",
      "Progressions:\n• Receiver must check away before coming to the ball.\n• Lay-offs on the half-turn.\n• Finish with 5 m acceleration races in pairs.",
    ),
    points: ["Quality on every pass, even in a warm-up", "Gradually raise the intensity", "Talk and call for the ball"],
    diagram: dia(
      [...[14, 26, 38, 50].flatMap((y) => [c(26, y), c(74, y), p(22, y), p(78, y)]), b(24, 14), b(24, 38)],
      [run(26, 14, 70, 14), pass(78, 26, 30, 26), run(26, 38, 70, 38), pass(78, 50, 30, 50)],
    ),
  },

  /* ============================== Passing & movement ============================== */
  {
    key: "follow-your-pass-square",
    name: "Follow Your Pass Square",
    theme: "passing",
    category: "technical",
    ages: ["young", "youth"],
    minutes: 15,
    player_count: "5-8",
    area: "12 × 12 m",
    description: text(
      "What it's for: the basics of pass and move: first touch out of your feet, an accurate pass, and following it.",
      "Setup: a 12 × 12 m square with a cone on each corner. One player on three corners and two on the starting corner. One ball.",
      "How it works: pass to the next corner and follow your pass to that cone. Each receiver takes a touch across their body and passes on. Change direction every 2 minutes.",
      "Progressions:\n• Two balls on opposite corners at the same time.\n• One-touch only.\n• Before passing on, play a one-two with a player standing in the middle.\n• Receiver must check away 2 m and come back to the cone before receiving.",
    ),
    points: ["Open your body to the next cone", "First touch across you, not under you", "Pass firmly to the front foot"],
    diagram: dia(
      [...box(36, 14, 64, 50), p(33, 50), p(31, 54), p(67, 50), p(67, 14), p(33, 14), b(36, 48)],
      [pass(36, 50, 63, 50), run(34, 50, 62, 52), pass(66, 47, 66, 17)],
    ),
  },
  {
    key: "third-man-lines",
    name: "Third Man Lines",
    theme: "passing",
    category: "technical",
    ages: ["youth", "senior"],
    minutes: 15,
    player_count: "9-12",
    area: "30 × 20 m",
    description: text(
      "What it's for: recognising the third-man pass: playing into one player so they can set it for a runner.",
      "Setup: three lines of players. Line A at the start, line B 12 m ahead and slightly wide, line C 20 m ahead on the far side.",
      "How it works: A passes into B, who checks short. B sets the ball back to C, who has dropped in, and C plays a first-time ball into the space ahead of A, who has sprinted beyond. A collects and dribbles to the end. Everyone moves on one line.",
      "Progressions:\n• Add a passive defender behind B.\n• Finish with a shot at a small goal.\n• Swap sides so players use the other foot.",
    ),
    points: ["Run as the ball travels into B, not after", "Set passes soft and in front of the receiver", "Third-man pass into space, not feet"],
    diagram: dia(
      [c(20, 46), c(44, 30), c(62, 50), c(84, 18), p(18, 50, "A"), p(16, 54), p(44, 26, "B"), p(42, 22), p(64, 54, "C"), p(66, 58), b(21, 48)],
      [pass(20, 48, 42, 30), pass(44, 30, 60, 48), pass(62, 50, 80, 22), run(20, 46, 78, 18)],
    ),
  },
  {
    key: "receive-turn-gates",
    name: "Receive and Turn Gates",
    theme: "passing",
    category: "technical",
    ages: ["young", "youth"],
    minutes: 15,
    player_count: "4-6 per grid",
    area: "15 × 15 m",
    description: text(
      "What it's for: checking the shoulder, receiving on the half-turn and playing forward.",
      "Setup: a 15 × 15 m grid with a server at one end and three gates (two cones 2 m apart) on the other three sides. One player in the middle, the rest queue behind the server.",
      "How it works: the middle player checks their shoulder and shows for a pass. The coach points to a gate as the ball travels. The player turns and dribbles through that gate, then joins the server's queue; the server becomes the next middle player.",
      "Progressions:\n• Add a passive defender who follows the middle player.\n• The defender may win the ball: if they do, they score in any gate.\n• Pass through the gate to a teammate instead of dribbling.",
    ),
    points: ["Check your shoulder before the ball arrives", "Open hips so you can see forward", "First touch away from pressure"],
    diagram: dia(
      [...box(30, 10, 70, 54), ...gateH(50, 10, 6), ...gateV(30, 32, 6), ...gateV(70, 32, 6), p(50, 58, "S"), p(54, 61), p(50, 32), b(50, 55), n(76, 48, "C")],
      [pass(50, 55, 50, 35), drib(50, 31, 50, 13), run(50, 32, 33, 32)],
    ),
  },
  {
    key: "long-short-long",
    name: "Long-Short-Long",
    theme: "passing",
    category: "technical",
    ages: ["youth", "senior"],
    minutes: 15,
    player_count: "6-9",
    area: "35 × 15 m",
    description: text(
      "What it's for: switching between driven longer passes and soft short passes, the rhythm teams use to move defences.",
      "Setup: two end players 30 m apart, with a pair of players in the middle (one closer to each end).",
      "How it works: an end player drives a long pass to the far end player. That player plays short to the nearest middle player, who sets it back first time, and the end player switches it long back to the start. Middle players swap roles every minute. Rotate everyone every 3 minutes.",
      "Progressions:\n• Long passes in the air, controlled with one touch.\n• Middle players must turn and play the long pass themselves.\n• Count successful cycles in 60 seconds.",
    ),
    points: ["Long: strike through the middle of the ball", "Short: soft and to the front foot", "Get your body behind the long ball"],
    diagram: dia(
      [c(12, 32), c(88, 32), p(10, 32, "A"), p(90, 32, "B"), p(36, 26), p(64, 38), b(14, 30)],
      [pass(13, 31, 86, 31), pass(88, 34, 66, 38), pass(64, 36, 85, 33)],
    ),
  },
  {
    key: "wall-pass-relay",
    name: "Wall Pass Relay",
    theme: "passing",
    category: "technical",
    ages: ["young"],
    minutes: 12,
    player_count: "8-16 (teams of 4)",
    area: "20 × 25 m",
    description: text(
      "What it's for: one-twos, timing of the return pass and dribbling with speed, as a team race.",
      "Setup: teams of four in lines. Each team has a partner standing beside a cone 8 m away, and a turning cone 15 m away.",
      "How it works: the first player dribbles out, plays a one-two with the partner, collects the return, dribbles round the turning cone and back to give the ball to the next player. The partner swaps with whoever just finished. First team with everyone done wins.",
      "Progressions:\n• Partner must return it one-touch.\n• Play the one-two with the weaker foot.\n• Add a second one-two on the way back.",
    ),
    points: ["Pass and keep running", "Partner: open up and set it into space", "Head up while dribbling at speed"],
    diagram: dia(
      [c(30, 18), c(30, 46), c(70, 18), c(70, 46), p(16, 18), p(12, 18), p(8, 18), p(16, 46), p(12, 46), p(8, 46), p(34, 22, "W"), p(34, 50, "W"), b(19, 18)],
      [drib(19, 18, 28, 17), pass(28, 17, 33, 21), pass(34, 20, 42, 16), run(30, 17, 66, 17)],
    ),
  },

  /* ============================== 1v1 ============================== */
  {
    key: "four-gate-1v1",
    name: "Four Gate 1v1",
    theme: "1v1",
    category: "technical",
    ages: ["young", "youth"],
    minutes: 15,
    player_count: "2 per grid (+ waiting pairs)",
    area: "12 × 12 m",
    description: text(
      "What it's for: beating a defender with feints and changes of direction, and defending without diving in.",
      "Setup: a 12 × 12 m grid with a 2 m gate in the middle of each side. Pairs wait outside; one pair plays, with spare balls nearby.",
      "How it works: the coach plays a ball into the attacker. They score by dribbling through either of the two gates on the defender's side. If the defender wins it, they attack the other two gates. Games last 30 seconds, then the next pair goes.",
      "Progressions:\n• Score through any gate except the one you just used.\n• Defender starts behind the attacker (recovery run).\n• Make it 2v1 for the first 5 seconds, then the helper drops out.",
    ),
    points: ["Attack the defender at speed", "Fake one gate, go to the other", "Defender: side-on, stay on your feet"],
    diagram: dia(
      [...box(32, 12, 68, 52), ...gateH(50, 12, 6), ...gateH(50, 52, 6), ...gateV(32, 32, 6), ...gateV(68, 32, 6), p(46, 42), o(52, 28), b(48, 40), n(74, 46, "C")],
      [drib(48, 40, 58, 30), drib(58, 30, 66, 33)],
    ),
  },
  {
    key: "channel-1v1",
    name: "1v1 Channel to Goal",
    theme: "1v1",
    category: "technical",
    ages: ["youth", "senior"],
    minutes: 15,
    player_count: "6-12 + GK",
    area: "25 × 12 m channel",
    description: text(
      "What it's for: committing a defender in a tight space and finishing quickly, like a winger cutting in or a striker isolated.",
      "Setup: a 12 m wide channel running at a goal with a keeper. Attackers queue at the far end with balls; defenders queue beside the goal.",
      "How it works: a defender passes to the attacker and closes them down. The attacker must beat them inside the channel and shoot before the edge of the box. If the defender wins it, they score by dribbling over the far line. Swap lines each go.",
      "Progressions:\n• Defender starts level with the attacker (race and recover).\n• Add a second attacker who can only receive behind the defender.\n• Limit the attacker to 6 seconds.",
    ),
    points: ["Drive at the defender's front foot", "Create a yard, then shoot early", "Defender: show them onto the weaker foot"],
    diagram: dia(
      [goalR(), p(91, 32, "GK"), ...[c(38, 26), c(82, 26), c(38, 38), c(82, 38)], p(32, 32), p(28, 32), b(35, 32), o(70, 32), o(74, 42)],
      [pass(70, 34, 37, 33), drib(36, 32, 60, 28), drib(60, 28, 78, 30), pass(80, 30, 94, 34)],
    ),
  },
  {
    key: "shield-and-turn",
    name: "Shield and Turn",
    theme: "1v1",
    category: "technical",
    ages: ["young", "youth"],
    minutes: 12,
    player_count: "3 per group",
    area: "15 × 10 m",
    description: text(
      "What it's for: receiving with a defender tight behind you: using your body to protect the ball, then turning when it's on.",
      "Setup: a 15 × 10 m area with two small goals behind the defender. A server stands at the opposite end.",
      "How it works: the server passes to the attacker, who has a defender touching their back. The attacker scores by turning and finishing in either small goal, or wins a point by keeping the ball for 5 seconds and laying it back to the server. Rotate roles every 3 goes.",
      "Progressions:\n• Remove the lay-off point: the attacker must turn.\n• The server joins as a support player for a 2v1.\n• Defender can tackle from the start.",
    ),
    points: ["Wide stance, low centre of gravity", "Feel where the defender is with your arm", "Turn away from the side they're on"],
    diagram: dia(
      [...box(26, 14, 74, 50), ["g", 76, 12], ["g", 76, 40], p(18, 32, "S"), p(46, 32), o(52, 32), b(21, 32)],
      [pass(21, 32, 43, 32), drib(46, 33, 70, 46)],
    ),
  },
  {
    key: "king-of-the-ring",
    name: "King of the Ring",
    theme: "1v1",
    category: "technical",
    ages: ["young"],
    minutes: 10,
    player_count: "6-16",
    area: "15 × 15 m",
    description: text(
      "What it's for: protecting the ball while attacking someone else's, with head up and lots of 1v1 moments.",
      "Setup: a 15 × 15 m square. Every player has a ball.",
      "How it works: players dribble inside the square and try to knock other balls out while keeping their own. Anyone whose ball leaves the square does a quick skill challenge outside (10 toe taps) and comes back in. Count how many balls each player knocks out in 90 seconds.",
      "Progressions:\n• Shrink the square every round.\n• Kings and queens: players who are out stay out until one is left.\n• Your knocked-out ball must be retrieved with a skill move before re-entering.",
    ),
    points: ["Keep your body between the ball and others", "Pick your moment to attack", "Quick feet when someone comes at you"],
    diagram: dia(
      [...box(34, 14, 66, 50), p(40, 22), b(42, 23), p(58, 20), b(56, 21), p(50, 32), b(48, 33), p(42, 44), b(44, 43), p(60, 42), b(58, 43)],
      [drib(48, 33, 44, 40), run(58, 20, 52, 28)],
    ),
  },
  {
    key: "recovery-race",
    name: "1v1 Recovery Race",
    theme: "1v1",
    category: "technical",
    ages: ["youth", "senior"],
    minutes: 15,
    player_count: "6-12 + GK",
    area: "35 × 25 m",
    description: text(
      "What it's for: attacking at full speed when you're ahead, and recovery defending when you've been beaten.",
      "Setup: a goal with a keeper. Attackers start 30 m out with a ball. Defenders start 3 m behind the attacker's shoulder.",
      "How it works: on the attacker's first touch, both go. The attacker tries to score before the defender recovers; the defender sprints to get goal-side and stop the shot. If the defender wins it, they score in a small goal back at the start.",
      "Progressions:\n• Change the head start (2 m, 5 m) to adjust difficulty.\n• Start the defender on the other side.\n• Add a second attacker who joins after 3 seconds.",
    ),
    points: ["Attacker: big touches into space, then shoot early", "Defender: sprint to the goal-side line first", "Defender: once level, slow down and block"],
    diagram: dia(
      [goalR(), p(91, 32, "GK"), ["g", 6, 26, "L"], p(22, 36), b(25, 36), o(18, 42), c(22, 30), c(22, 46)],
      [drib(25, 36, 72, 30), run(18, 42, 70, 36), pass(76, 30, 94, 32)],
    ),
  },

  /* ============================== Rondos & possession ============================== */
  {
    key: "rondo-4v1",
    name: "4v1 Rondo",
    theme: "possession",
    category: "technical",
    ages: ["young", "youth"],
    minutes: 12,
    player_count: "5 per grid",
    area: "8 × 8 m",
    description: text(
      "What it's for: the first rondo every player should learn: support angles, receiving across the body and passing under light pressure.",
      "Setup: an 8 × 8 m square with one player on each side and a defender in the middle.",
      "How it works: the four keep the ball from the defender, staying on their side of the square. If the defender touches the ball, the player who made the mistake swaps in. Count passes: 10 in a row is a point.",
      "Progressions:\n• Two touches, then one touch.\n• Make the square smaller.\n• Make it 5v2 (see Split-Pass Rondo).",
    ),
    points: ["Move along your line to make an angle", "Receive on the back foot", "Disguise your pass"],
    diagram: dia(
      [...box(38, 18, 62, 46), p(50, 16), p(36, 32), p(64, 32), p(50, 48), o(50, 32), b(37, 30)],
      [pass(37, 31, 49, 18), pass(51, 18, 63, 30), run(50, 48, 56, 48)],
    ),
  },
  {
    key: "split-pass-rondo",
    name: "Split-Pass Rondo 5v2",
    theme: "possession",
    category: "tactical",
    ages: ["youth", "senior"],
    minutes: 15,
    player_count: "7 per grid",
    area: "12 × 12 m",
    description: text(
      "What it's for: keeping the ball against two defenders and finding the pass between them.",
      "Setup: a 12 × 12 m square with five players around it (one can float inside) and two defenders in the middle.",
      "How it works: the five keep the ball. A pass that splits the two defenders scores a point. If a defender wins it or the ball leaves the square, the player who lost it and the one who passed to them become defenders.",
      "Progressions:\n• Split pass is worth 2; 10 passes is worth 1.\n• Defenders win a point by winning the ball and passing it out of the square.\n• Limit to two touches, then one.",
    ),
    points: ["Draw a defender, then play past them", "Have a passing line on both sides", "Defenders: one presses, one covers the split"],
    diagram: dia(
      [...box(36, 14, 64, 50), p(50, 12), p(34, 26), p(34, 42), p(66, 34), p(50, 52), o(46, 30), o(54, 36), b(35, 40)],
      [pass(36, 41, 64, 35)],
    ),
  },
  {
    key: "three-zone-keepball",
    name: "Three-Zone Keep-Ball",
    theme: "possession",
    category: "tactical",
    ages: ["youth", "senior"],
    minutes: 18,
    player_count: "10-12",
    area: "36 × 20 m",
    description: text(
      "What it's for: keeping the ball and moving it from one area to another, so players learn to support and switch.",
      "Setup: a 36 × 20 m area split into three 12 m zones. Two teams of four or five, plus one neutral who plays for the team with the ball.",
      "How it works: teams keep the ball. A point is scored each time a team completes a pass from one end zone, through the middle zone, to the other end zone without losing it. Defenders can go anywhere.",
      "Progressions:\n• A pass straight from end zone to end zone scores double.\n• Only two players from each team allowed in the middle zone.\n• Two-touch limit.",
    ),
    points: ["Spread out to make the area big", "Support the ball carrier on both sides", "Look forward first, then switch"],
    diagram: dia(
      [...box(32, 12, 68, 52), c(44, 12), c(44, 52), c(56, 12), c(56, 52), p(36, 22), p(38, 42), p(50, 30), p(62, 20), p(64, 44), o(42, 30), o(52, 22), o(58, 38), o(48, 44), n(50, 50, "N"), b(37, 24)],
      [pass(37, 23, 49, 29), pass(51, 31, 63, 43)],
    ),
  },
  {
    key: "end-zone-possession",
    name: "End Zone 5v5",
    theme: "possession",
    category: "tactical",
    ages: ["young", "youth", "senior"],
    minutes: 20,
    player_count: "10-12",
    area: "40 × 30 m",
    description: text(
      "What it's for: keeping the ball with a purpose: playing forward into space behind the other team.",
      "Setup: a 40 × 30 m pitch with a 5 m end zone at each end. Two teams of five (add a neutral if numbers are odd).",
      "How it works: a team scores by getting a player to receive a pass inside the end zone they're attacking (they can't wait in it; they must run in as the ball is played). After a score, that team keeps the ball and attacks the other way.",
      "Progressions:\n• Receiver must stop the ball in the zone with the sole.\n• 5 passes before you can score.\n• Score by dribbling in for younger groups.",
    ),
    points: ["Look for the run in behind", "Time the run as the passer looks up", "Defend the space, not just the ball"],
    diagram: dia(
      [...box(20, 10, 80, 54), c(28, 10), c(28, 54), c(72, 10), c(72, 54), p(36, 22), p(40, 42), p(52, 30), p(62, 18), p(60, 44), o(46, 22), o(48, 40), o(58, 32), o(66, 24), o(66, 42), b(53, 32)],
      [pass(53, 31, 61, 20), run(62, 44, 76, 38), pass(62, 18, 75, 36)],
    ),
  },
  {
    key: "three-team-keepball",
    name: "Three-Team Keep-Ball",
    theme: "possession",
    category: "tactical",
    ages: ["youth", "senior"],
    minutes: 18,
    player_count: "12-15 (3 teams)",
    area: "30 × 30 m",
    description: text(
      "What it's for: keeping the ball with an overload, and pressing straight away when you lose it.",
      "Setup: a 30 × 30 m square and three teams of four or five in different bibs.",
      "How it works: two teams combine to keep the ball against the third. If the defending team wins it, the team that lost it becomes the defenders. Count passes for each team; most passes in 6 minutes wins.",
      "Progressions:\n• Defending team must win it back within 6 seconds or do a forfeit.\n• Two-touch for the teams in possession.\n• Make the square long and thin to encourage switches.",
    ),
    points: ["Spread wide, use the whole square", "Lose it? Press within 3 seconds", "Talk: who's free, who's pressing"],
    diagram: dia(
      [...box(32, 10, 68, 54), p(36, 16), p(64, 18), p(38, 48), p(62, 50), n(50, 22), n(36, 32), n(64, 36), n(50, 46), o(46, 30), o(54, 34), o(50, 38), b(37, 18)],
      [pass(37, 17, 49, 22), pass(51, 23, 63, 35), run(46, 30, 50, 24)],
    ),
  },
  {
    key: "diamond-rondo",
    name: "Diamond Rondo 4+1 v 2",
    theme: "possession",
    category: "tactical",
    ages: ["youth", "senior"],
    minutes: 15,
    player_count: "7",
    area: "14 × 14 m (diamond)",
    description: text(
      "What it's for: a positional rondo for midfielders: playing into and out of the player in the middle.",
      "Setup: a diamond of four players (bottom, top and two sides) with one central player inside, against two defenders.",
      "How it works: the outside four and the central player keep the ball. A pass into the central player who then plays out to a different player scores a point. Defenders who win the ball swap with the player who lost it (or with the central player if they did).",
      "Progressions:\n• Central player has one touch.\n• Top and bottom can only pass to the central player or the sides.\n• Add a third defender for older groups.",
    ),
    points: ["Central player: scan before every pass", "Outside: pass to the central player's far foot", "Move to keep the central player in view"],
    diagram: dia(
      [c(50, 8), c(28, 32), c(72, 32), c(50, 56), p(50, 10, "T"), p(30, 32), p(70, 32), p(50, 54, "B"), p(50, 32, "6"), o(43, 38), o(57, 26), b(50, 51)],
      [pass(50, 51, 50, 35), pass(52, 31, 68, 32)],
    ),
  },
];

export const LIBRARY_BY_KEY = new Map(LIBRARY.map((d) => [d.key, d]));
