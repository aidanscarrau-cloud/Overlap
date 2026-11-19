import type { FitnessTest } from "@/lib/fitness";

/* Set-up pictures for each fitness test: a pitch, cones, the running path and distances. */

const G = "#2f8a4f";
const LINE = "rgba(255,255,255,.85)";
const PATH = "#ffd166";
const CONE = "#ff8a1f";

function Cone({ x, y, l }: { x: number; y: number; l?: string }) {
  return (
    <g>
      <path d={`M${x - 1.8} ${y + 1.4}L${x} ${y - 2.2}L${x + 1.8} ${y + 1.4}Z`} fill={CONE} />
      {l && (
        <text x={x} y={y + 5.6} fontSize="3" fontWeight="700" fill="#fff" textAnchor="middle" style={{ fontFamily: "var(--body)" }}>
          {l}
        </text>
      )}
    </g>
  );
}
function Runner({ x, y }: { x: number; y: number }) {
  return <circle cx={x} cy={y} r="2.4" fill="#ffd23f" stroke="#1a1a1a" strokeWidth=".4" />;
}
function Path({ d, dash }: { d: string; dash?: boolean }) {
  return <path d={d} fill="none" stroke={PATH} strokeWidth=".8" strokeDasharray={dash ? "1.6 1.2" : undefined} strokeLinecap="round" strokeLinejoin="round" markerEnd="url(#fa)" />;
}
function Label({ x, y, t, a = "middle" }: { x: number; y: number; t: string; a?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontSize="3.2" fontWeight="700" fill="#fff" textAnchor={a} style={{ fontFamily: "var(--body)" }}>
      {t}
    </text>
  );
}
function Line({ x1, y1, x2, y2 }: { x1: number; y1: number; x2: number; y2: number }) {
  return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={LINE} strokeWidth=".6" />;
}
function Measure({ x1, x2, y, t }: { x1: number; x2: number; y: number; t: string }) {
  return (
    <g>
      <line x1={x1} y1={y} x2={x2} y2={y} stroke="rgba(255,255,255,.6)" strokeWidth=".4" strokeDasharray="1 1" />
      <line x1={x1} y1={y - 1.5} x2={x1} y2={y + 1.5} stroke="rgba(255,255,255,.6)" strokeWidth=".4" />
      <line x1={x2} y1={y - 1.5} x2={x2} y2={y + 1.5} stroke="rgba(255,255,255,.6)" strokeWidth=".4" />
      <rect x={(x1 + x2) / 2 - 6} y={y - 2.6} width="12" height="5" rx="1.5" fill="rgba(0,0,0,.35)" />
      <text x={(x1 + x2) / 2} y={y + 1.1} fontSize="3" fontWeight="700" fill="#fff" textAnchor="middle" style={{ fontFamily: "var(--body)" }}>
        {t}
      </text>
    </g>
  );
}

function body(d: FitnessTest["diagram"], test: FitnessTest) {
  switch (d) {
    case "sprint": {
      const dist = test.key.split("_")[1] ?? "20";
      return (
        <>
          <Line x1={14} y1={20} x2={14} y2={44} />
          <Line x1={86} y1={20} x2={86} y2={44} />
          <Cone x={14} y={20} l="Start" />
          <Cone x={14} y={44} />
          <Cone x={86} y={20} l="Finish" />
          <Cone x={86} y={44} />
          <Runner x={9} y={32} />
          <Path d="M12 32 H92" />
          <Measure x1={14} x2={86} y={54} t={`${dist} m`} />
        </>
      );
    }
    case "505":
      return (
        <>
          <Line x1={10} y1={22} x2={10} y2={42} />
          <Line x1={60} y1={22} x2={60} y2={42} />
          <Line x1={85} y1={22} x2={85} y2={42} />
          <Label x={10} y={18} t="Start" />
          <Label x={60} y={18} t="Timing line" />
          <Label x={85} y={18} t="Turn" />
          <Runner x={6} y={32} />
          <Path d="M9 30 H84 Q87 32 84 34 H58" />
          <Measure x1={10} x2={60} y={52} t="10 m" />
          <Measure x1={60} x2={85} y={52} t="5 m" />
        </>
      );
    case "illinois":
      return (
        <>
          <Cone x={15} y={14} l="Start" />
          <Cone x={85} y={14} />
          <Cone x={15} y={50} l="Finish" />
          <Cone x={85} y={50} />
          {[27, 41, 55, 69].map((x) => (
            <Cone key={x} x={x} y={32} />
          ))}
          <Path d="M15 17 H82 Q86 20 82 23 H18 Q14 27 20 30 Q27 36 34 30 Q41 25 48 30 Q55 36 62 30 Q69 25 76 32 Q69 39 62 34 Q55 28 48 34 Q41 39 34 34 Q27 28 20 34 Q14 38 18 42 H82 Q86 45 82 48 H18" />
          <Measure x1={15} x2={85} y={59} t="10 m" />
        </>
      );
    case "ttest":
      return (
        <>
          <Cone x={50} y={54} l="A" />
          <Cone x={50} y={16} l="B" />
          <Cone x={22} y={16} l="C" />
          <Cone x={78} y={16} l="D" />
          <Runner x={50} y={58} />
          <Path d="M50 51 V19" />
          <Path d="M48 13 H25" dash />
          <Path d="M25 10 H75" dash />
          <Path d="M75 13 H53" dash />
          <Path d="M53 19 V51" dash />
          <Measure x1={22} x2={50} y={26} t="5 m" />
          <Label x={58} y={36} t="10 m" a="start" />
        </>
      );
    case "yoyo":
    case "beep":
      return (
        <>
          <Line x1={22} y1={14} x2={22} y2={50} />
          <Line x1={78} y1={14} x2={78} y2={50} />
          {d === "yoyo" && <Cone x={10} y={32} l="Recover" />}
          <Runner x={24} y={26} />
          <Path d="M26 26 H76" />
          <Path d="M76 38 H26" />
          {d === "yoyo" && <Path d="M21 44 H12" dash />}
          <Measure x1={22} x2={78} y={57} t="20 m" />
          {d === "yoyo" && <Measure x1={10} x2={22} y={8} t="5 m" />}
        </>
      );
    case "loop":
    case "gacon": {
      // Pitch perimeter. For Gacon, the first few stage cones around it.
      const cones = d === "gacon" ? [0.12, 0.27, 0.43, 0.6, 0.78] : [];
      const per = (t: number) => {
        const w = 76, h = 44, L = 2 * (w + h);
        let s = t * L;
        if (s <= w) return [12 + s, 10];
        s -= w;
        if (s <= h) return [88, 10 + s];
        s -= h;
        if (s <= w) return [88 - s, 54];
        s -= w;
        return [12, 54 - s];
      };
      return (
        <>
          <rect x={12} y={10} width={76} height={44} fill="none" stroke={LINE} strokeWidth=".6" />
          <Line x1={50} y1={10} x2={50} y2={54} />
          <circle cx={50} cy={32} r={6} fill="none" stroke={LINE} strokeWidth=".6" />
          <Runner x={12} y={10} />
          <Label x={12} y={6} t="Start" a="start" />
          <path d="M14 7.5 H86 Q91 8 91 13 V51 Q91 57 86 57 H14 Q9 57 9 51 V14" fill="none" stroke={PATH} strokeWidth=".8" strokeDasharray={d === "loop" ? "1.6 1.2" : undefined} markerEnd="url(#fa)" />
          {cones.map((t, i) => {
            const [x, y] = per(t);
            return <Cone key={i} x={x} y={y} l={`S${i + 1}`} />;
          })}
          {d === "gacon" && <Label x={50} y={24} t="45 s run · 15 s rest" />}
        </>
      );
    }
    case "juggle":
      return (
        <>
          <Runner x={50} y={40} />
          <circle cx={50} cy={26} r="2" fill="#fff" stroke="#1a1a1a" strokeWidth=".4" />
          <path d="M50 37 Q46 31 50 28 M50 28 Q54 31 50 37" fill="none" stroke={PATH} strokeWidth=".7" strokeDasharray="1 1" />
          <Runner x={72} y={40} />
          <Label x={72} y={48} t="Counter" />
          <Label x={50} y={48} t="Juggler" />
        </>
      );
    case "pass":
      return (
        <>
          <Cone x={82} y={27} />
          <Cone x={82} y={37} />
          <Label x={82} y={20} t="1 m gate" />
          <Runner x={18} y={32} />
          <circle cx={22} cy={33} r="1.2" fill="#fff" stroke="#1a1a1a" strokeWidth=".3" />
          <Path d="M24 32 H80" dash />
          <Measure x1={22} x2={82} y={52} t="12 m" />
        </>
      );
    case "slalom":
      return (
        <>
          <Line x1={10} y1={22} x2={10} y2={42} />
          {[22, 34, 46, 58, 70, 82].map((x) => (
            <Cone key={x} x={x} y={32} />
          ))}
          <Runner x={6} y={32} />
          <Path d="M9 28 Q16 24 22 28 Q28 36 34 30 Q40 24 46 30 Q52 36 58 30 Q64 24 70 30 Q76 36 82 30 Q90 32 82 38 Q76 42 70 36 Q64 30 58 36 Q52 42 46 36 Q40 30 34 36 Q28 42 22 36 Q16 32 10 37" />
          <Measure x1={22} x2={34} y={52} t="2 m" />
        </>
      );
  }
}

export function FitnessDiagram({ test }: { test: FitnessTest }) {
  return (
    <svg className="fit-dia" viewBox="0 0 100 64" role="img" aria-label={`Set-up for the ${test.name}`}>
      <defs>
        <marker id="fa" viewBox="0 0 6 6" refX="5" refY="3" markerWidth="3.2" markerHeight="3.2" orient="auto">
          <path d="M0 0L6 3L0 6z" fill={PATH} />
        </marker>
      </defs>
      <rect width="100" height="64" rx="3" fill={G} />
      {[0, 2, 4, 6, 8].map((i) => (
        <rect key={i} x={i * 10} width="10" height="64" fill="#2a7f48" />
      ))}
      {body(test.diagram, test)}
    </svg>
  );
}
