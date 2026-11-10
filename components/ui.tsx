import type { Diagram as DiagramT, Drill, Player, Session } from "@/lib/types";
import { fmtDay, fmtMon, fmtNum } from "@/lib/format";

export function Icon({ id, className = "i" }: { id: string; className?: string }) {
  return (
    <svg className={className} aria-hidden="true">
      <use href={`#${id}`} />
    </svg>
  );
}

export function Shirt({ p, small }: { p: Pick<Player, "position" | "shirt_number">; small?: boolean }) {
  const gk = p.position === "GK";
  return (
    <span className={`shirt${small ? " sm" : ""}${gk ? " gk" : ""}`} aria-hidden="true">
      <svg style={{ fill: gk ? "var(--gold)" : "var(--accent)" }}>
        <use href="#shirt" />
      </svg>
      <b>{p.shirt_number ?? ""}</b>
    </span>
  );
}

export function Timeline({ s, drills, lg }: { s: Pick<Session, "plan">; drills: Map<string, Drill>; lg?: boolean }) {
  return (
    <div className={`timeline${lg ? " lg" : ""}`} aria-hidden="true">
      {s.plan.map((x, i) => {
        const d = drills.get(x.drill_id);
        return d ? <i key={i} data-cat={d.category} style={{ flex: Math.max(1, +x.mins || 1) }} /> : null;
      })}
    </div>
  );
}

export function DateBox({ date }: { date: string }) {
  return (
    <div className="sdate">
      <small>{fmtDay(date)}</small>
      <b>{fmtNum(date)}</b>
      <em>{fmtMon(date)}</em>
    </div>
  );
}

export const totalMins = (s: Pick<Session, "plan">) => s.plan.reduce((n, d) => n + (+d.mins || 0), 0);

const EMPTY: DiagramT = { items: [], arrows: [] };

/** Static pitch diagram used on cards, pickers and the drill view. */
export function Diagram({ d, label }: { d?: DiagramT | null; label: string }) {
  const dia = d && Array.isArray(d.items) ? d : EMPTY;
  return (
    <svg className="dia" viewBox="0 0 100 64" role="img" aria-label={`Diagram: ${label}`}>
      <PitchBase full={!!dia.full} />
      {(dia.arrows || []).map(([k, x1, y1, x2, y2], i) => (
        <line key={"a" + i} className={`d-a${k === "run" ? " d-run" : k === "drib" ? " d-drib" : ""}`} x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#ah)" />
      ))}
      {(dia.items || []).map((it, i) => (
        <DiagramItemShape key={"i" + i} it={it} />
      ))}
    </svg>
  );
}

export function PitchBase({ full }: { full: boolean }) {
  return (
    <>
      <rect className="d-pitch" width="100" height="64" />
      {[0, 2, 4, 6, 8].map((i) => (
        <rect key={i} className="d-stripe" x={i * 10} width="10" height="64" />
      ))}
      <rect className="d-line" x="2" y="2" width="96" height="60" />
      {full && (
        <>
          <line className="d-line" x1="50" y1="2" x2="50" y2="62" />
          <circle className="d-line" cx="50" cy="32" r="7" />
        </>
      )}
    </>
  );
}

export function DiagramItemShape({ it }: { it: DiagramT["items"][number] }) {
  const [t, x, y, l] = it;
  if (t === "c") return <polygon className="d-c" points={`${x},${y - 1.8} ${x - 1.6},${y + 1.2} ${x + 1.6},${y + 1.2}`} />;
  if (t === "b") return <circle className="d-b" cx={x} cy={y} r="1.1" />;
  if (t === "g") return <rect className="d-g" x={l === "L" ? x + 0.5 : x} y={y} width="3" height="12" />;
  return (
    <>
      <circle className={`d-${t}`} cx={x} cy={y} r="2.4" />
      {l ? (
        <text className="d-lbl" x={x} y={y}>
          {l}
        </text>
      ) : null}
    </>
  );
}

export function PitchLines({ className = "lines" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 520 340" aria-hidden="true">
      <rect x="10" y="10" width="500" height="320" rx="4" />
      <line x1="260" y1="10" x2="260" y2="330" />
      <circle cx="260" cy="170" r="56" />
      <circle cx="260" cy="170" r="3" fill="#fff" />
      <rect x="420" y="80" width="90" height="180" />
      <rect x="474" y="130" width="36" height="80" />
      <path d="M420 135a40 40 0 0 0 0 70" />
      <rect x="10" y="80" width="90" height="180" />
      <path d="M100 135a40 40 0 0 1 0 70" />
    </svg>
  );
}

/** Club or team badge: the uploaded logo when there is one, otherwise the default crest. */
export function Crest({ url, size = 36, className = "crest" }: { url?: string | null; size?: number; className?: string }) {
  if (url)
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`${className} crest-img`} src={url} alt="" width={size} height={size} style={{ width: size, height: size }} />;
  return (
    <svg className={className} aria-hidden="true" style={{ width: size, height: size }}>
      <use href="#crest" />
    </svg>
  );
}
