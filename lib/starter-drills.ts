import type { Category, Diagram } from "./types";

// Starter drills added to new clubs that choose sample data.
export const STARTER_DRILLS: { key: string; name: string; category: Category; minutes: number; player_count: string; area: string; description: string; points: string[]; diagram: Diagram }[] = [
 {
  "name": "Rondo 5v2",
  "category": "warmup",
  "minutes": 12,
  "player_count": "7",
  "area": "15 × 15 m",
  "description": "Five players keep the ball around the outside of a square while two defenders try to win it. Defender who wins it swaps with the player who lost it.",
  "points": [
   "Open body shape to see both options",
   "Play on the far foot of the receiver",
   "Move to make an angle after every pass",
   "Defenders press as a pair: one blocks, one steals"
  ],
  "diagram": {
   "items": [
    [
     "c",
     34,
     10
    ],
    [
     "c",
     66,
     10
    ],
    [
     "c",
     66,
     54
    ],
    [
     "c",
     34,
     54
    ],
    [
     "p",
     50,
     10
    ],
    [
     "p",
     34,
     28
    ],
    [
     "p",
     66,
     30
    ],
    [
     "p",
     42,
     54
    ],
    [
     "p",
     60,
     54
    ],
    [
     "o",
     46,
     30
    ],
    [
     "o",
     54,
     38
    ],
    [
     "b",
     52,
     12
    ]
   ],
   "arrows": [
    [
     "pass",
     50,
     10,
     35,
     27
    ],
    [
     "pass",
     35,
     29,
     41,
     52
    ],
    [
     "run",
     66,
     30,
     66,
     40
    ]
   ],
   "full": false
  },
  "key": "d1"
 },
 {
  "name": "Passing Square",
  "category": "warmup",
  "minutes": 10,
  "player_count": "8–12",
  "area": "20 × 20 m",
  "description": "Players at each corner pass and follow their pass around the square. Progress to one-twos, third-man runs and changing direction on the whistle.",
  "points": [
   "First touch out of your feet, away from pressure",
   "Pass with the instep, weight it to the front foot",
   "Communicate early: name, then touch"
  ],
  "diagram": {
   "items": [
    [
     "c",
     30,
     12
    ],
    [
     "c",
     70,
     12
    ],
    [
     "c",
     70,
     52
    ],
    [
     "c",
     30,
     52
    ],
    [
     "p",
     27,
     12
    ],
    [
     "p",
     24,
     12
    ],
    [
     "p",
     73,
     12
    ],
    [
     "p",
     70,
     9
    ],
    [
     "p",
     73,
     52
    ],
    [
     "p",
     30,
     55
    ],
    [
     "b",
     29,
     14
    ]
   ],
   "arrows": [
    [
     "pass",
     30,
     13,
     68,
     13
    ],
    [
     "run",
     27,
     15,
     62,
     16
    ],
    [
     "pass",
     70,
     14,
     70,
     50
    ],
    [
     "pass",
     70,
     52,
     32,
     52
    ]
   ],
   "full": false
  },
  "key": "d2"
 },
 {
  "name": "1v1 to Goal",
  "category": "technical",
  "minutes": 15,
  "player_count": "6–10",
  "area": "25 × 20 m",
  "description": "Attacker receives from the server and goes 1v1 against a defender to score in the big goal. Defender scores by dribbling through the end gates.",
  "points": [
   "Attack the front foot of the defender",
   "Change of pace after the fake",
   "Defenders: stay side-on, show onto the weaker foot"
  ],
  "diagram": {
   "items": [
    [
     "g",
     96,
     26
    ],
    [
     "o",
     91,
     32
    ],
    [
     "c",
     8,
     20
    ],
    [
     "c",
     8,
     44
    ],
    [
     "p",
     22,
     32
    ],
    [
     "b",
     25,
     32
    ],
    [
     "o",
     56,
     32
    ],
    [
     "p",
     10,
     32,
     "S"
    ]
   ],
   "arrows": [
    [
     "pass",
     12,
     32,
     20,
     32
    ],
    [
     "drib",
     25,
     32,
     78,
     24
    ],
    [
     "run",
     56,
     32,
     70,
     27
    ]
   ],
   "full": false
  },
  "key": "d3"
 },
 {
  "name": "Build-up 6v4",
  "category": "tactical",
  "minutes": 20,
  "player_count": "10–12",
  "area": "Half pitch",
  "description": "Goalkeeper and back five build out against four pressing attackers. Score by passing through either target gate on the halfway line.",
  "points": [
   "GK and centre-backs create a back three when pressed",
   "Full-backs high and wide to stretch the press",
   "Look for the pass that breaks a line",
   "Defensive midfielder shows on the blind side of the striker"
  ],
  "diagram": {
   "items": [
    [
     "g",
     0,
     26,
     "L"
    ],
    [
     "p",
     6,
     32,
     "GK"
    ],
    [
     "p",
     22,
     16
    ],
    [
     "p",
     22,
     48
    ],
    [
     "p",
     40,
     7
    ],
    [
     "p",
     40,
     57
    ],
    [
     "p",
     36,
     32
    ],
    [
     "o",
     34,
     20
    ],
    [
     "o",
     34,
     44
    ],
    [
     "o",
     48,
     32
    ],
    [
     "o",
     58,
     14
    ],
    [
     "c",
     92,
     16
    ],
    [
     "c",
     92,
     24
    ],
    [
     "c",
     92,
     40
    ],
    [
     "c",
     92,
     48
    ]
   ],
   "arrows": [
    [
     "pass",
     8,
     30,
     20,
     18
    ],
    [
     "pass",
     24,
     15,
     38,
     8
    ],
    [
     "run",
     40,
     57,
     70,
     52
    ],
    [
     "pass",
     24,
     49,
     35,
     34
    ]
   ],
   "full": false
  },
  "key": "d4"
 },
 {
  "name": "Pressing Triggers 4v4+3",
  "category": "tactical",
  "minutes": 18,
  "player_count": "11",
  "area": "35 × 30 m",
  "description": "Two teams of four with three neutral players. When the ball goes backwards or a player takes a poor touch, the team without the ball presses together.",
  "points": [
   "Recognise the trigger: back pass, bad touch, player facing own goal",
   "Nearest player presses on a curve to cut the passing lane",
   "Others step up and squeeze the space within 3 seconds"
  ],
  "diagram": {
   "items": [
    [
     "c",
     14,
     8
    ],
    [
     "c",
     86,
     8
    ],
    [
     "c",
     86,
     56
    ],
    [
     "c",
     14,
     56
    ],
    [
     "p",
     28,
     22
    ],
    [
     "p",
     30,
     44
    ],
    [
     "p",
     56,
     18
    ],
    [
     "p",
     62,
     46
    ],
    [
     "o",
     44,
     30
    ],
    [
     "o",
     70,
     30
    ],
    [
     "o",
     40,
     48
    ],
    [
     "o",
     48,
     14
    ],
    [
     "n",
     14,
     32
    ],
    [
     "n",
     86,
     32
    ],
    [
     "n",
     50,
     56
    ],
    [
     "b",
     46,
     32
    ]
   ],
   "arrows": [
    [
     "run",
     56,
     18,
     46,
     28
    ],
    [
     "run",
     30,
     44,
     40,
     46
    ],
    [
     "run",
     62,
     46,
     68,
     34
    ],
    [
     "pass",
     44,
     30,
     16,
     32
    ]
   ],
   "full": false
  },
  "key": "d5"
 },
 {
  "name": "7v7 Small-Sided Game",
  "category": "game",
  "minutes": 25,
  "player_count": "14",
  "area": "50 × 35 m",
  "description": "Conditioned game linked to the session theme. Bonus goal for scoring within 6 seconds of winning the ball, or after a pass that breaks a line.",
  "points": [
   "Apply the session theme under game pressure",
   "Coach in the stoppages, not over the top of play",
   "Keep score and rotate keepers every 5 minutes"
  ],
  "diagram": {
   "items": [
    [
     "g",
     0,
     26,
     "L"
    ],
    [
     "g",
     96,
     26
    ],
    [
     "p",
     6,
     32
    ],
    [
     "p",
     20,
     18
    ],
    [
     "p",
     20,
     46
    ],
    [
     "p",
     34,
     32
    ],
    [
     "p",
     42,
     14
    ],
    [
     "p",
     42,
     50
    ],
    [
     "p",
     48,
     32
    ],
    [
     "o",
     94,
     32
    ],
    [
     "o",
     80,
     18
    ],
    [
     "o",
     80,
     46
    ],
    [
     "o",
     66,
     32
    ],
    [
     "o",
     58,
     14
    ],
    [
     "o",
     58,
     50
    ],
    [
     "o",
     54,
     32
    ],
    [
     "b",
     36,
     30
    ]
   ],
   "arrows": [
    [
     "pass",
     34,
     32,
     42,
     16
    ],
    [
     "run",
     42,
     50,
     62,
     44
    ]
   ],
   "full": true
  },
  "key": "d6"
 },
 {
  "name": "Finishing Combinations",
  "category": "technical",
  "minutes": 15,
  "player_count": "6–10",
  "area": "Penalty box +",
  "description": "Wall pass with the layer at the edge of the box, then finish first time. Rotate positions: shooter becomes layer, layer collects balls.",
  "points": [
   "Disguise the pass to the layer",
   "Strike across the keeper, low and early",
   "Follow every shot in for rebounds"
  ],
  "diagram": {
   "items": [
    [
     "g",
     96,
     26
    ],
    [
     "o",
     91,
     32,
     "GK"
    ],
    [
     "c",
     60,
     22
    ],
    [
     "c",
     60,
     42
    ],
    [
     "p",
     30,
     32
    ],
    [
     "b",
     33,
     32
    ],
    [
     "p",
     64,
     20
    ],
    [
     "p",
     30,
     44
    ]
   ],
   "arrows": [
    [
     "pass",
     33,
     32,
     62,
     21
    ],
    [
     "run",
     31,
     34,
     70,
     36
    ],
    [
     "pass",
     64,
     22,
     72,
     35
    ],
    [
     "pass",
     73,
     36,
     95,
     30
    ]
   ],
   "full": false
  },
  "key": "d7"
 },
 {
  "name": "Repeated Sprint Shuttles",
  "category": "fitness",
  "minutes": 12,
  "player_count": "Any",
  "area": "40 m lanes",
  "description": "Sprint out to the cone and back, 6 reps per set with 20 seconds rest. Three sets with 2 minutes between sets.",
  "points": [
   "Decelerate in short, low steps before turning",
   "Drive arms through the turn",
   "Record times for set 1 and set 3"
  ],
  "diagram": {
   "items": [
    [
     "c",
     14,
     14
    ],
    [
     "c",
     14,
     32
    ],
    [
     "c",
     14,
     50
    ],
    [
     "c",
     40,
     14
    ],
    [
     "c",
     40,
     32
    ],
    [
     "c",
     40,
     50
    ],
    [
     "c",
     66,
     14
    ],
    [
     "c",
     66,
     32
    ],
    [
     "c",
     66,
     50
    ],
    [
     "p",
     10,
     14
    ],
    [
     "p",
     10,
     32
    ],
    [
     "p",
     10,
     50
    ]
   ],
   "arrows": [
    [
     "run",
     14,
     14,
     63,
     14
    ],
    [
     "run",
     14,
     32,
     63,
     32
    ],
    [
     "run",
     14,
     50,
     63,
     50
    ]
   ],
   "full": false
  },
  "key": "d8"
 },
 {
  "name": "Cool-down & Stretch",
  "category": "cooldown",
  "minutes": 8,
  "player_count": "Any",
  "area": "Circle",
  "description": "Light jog, then static stretches held for 30 seconds each: hamstrings, quads, hip flexors, calves and glutes.",
  "points": [
   "Breathe out into each stretch",
   "Hydrate and refuel within 30 minutes",
   "Coach recap: one thing that went well, one to improve"
  ],
  "diagram": {
   "items": [
    [
     "p",
     50,
     14
    ],
    [
     "p",
     64,
     20
    ],
    [
     "p",
     70,
     32
    ],
    [
     "p",
     64,
     44
    ],
    [
     "p",
     50,
     50
    ],
    [
     "p",
     36,
     44
    ],
    [
     "p",
     30,
     32
    ],
    [
     "p",
     36,
     20
    ],
    [
     "n",
     50,
     32,
     "C"
    ]
   ],
   "arrows": [],
   "full": false
  },
  "key": "d9"
 }
];
