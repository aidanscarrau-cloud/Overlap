"use client";

import { AREAS, type Ratings } from "@/lib/idp";
import { fmtNum, fmtMon } from "@/lib/format";

const R = 92; // radius of the 10 ring
const CX = 160;
const CY = 128;
const angle = (i: number) => (-90 + i * (360 / AREAS.length)) * (Math.PI / 180);
const pt = (i: number, v: number) => [CX + Math.cos(angle(i)) * (R * v) / 10, CY + Math.sin(angle(i)) * (R * v) / 10] as const;
const shortDate = (d: string) => `${fmtNum(d)} ${fmtMon(d)}`;

/**
 * Radar of the five areas on a 1-10 scale. Latest evaluation is the filled shape;
 * the previous one (if any) is a dashed outline, so the two read apart without colour.
 */
export function RadarChart({ latest, previous, latestDate, previousDate }: { latest: Ratings; previous?: Ratings; latestDate: string; previousDate?: string }) {
  const poly = (r: Ratings) => AREAS.map((a, i) => pt(i, r[a.key] ?? 0).join(",")).join(" ");
  return (
    <figure className="radar">
      <svg viewBox="0 0 320 262" role="img" aria-label={`Ratings: ${AREAS.map((a) => `${a.label} ${latest[a.key] ?? "not rated"}`).join(", ")}`}>
        {[2, 4, 6, 8, 10].map((v) => (
          <polygon key={v} className="radar-grid" points={AREAS.map((_, i) => pt(i, v).join(",")).join(" ")} />
        ))}
        {AREAS.map((_, i) => {
          const [x, y] = pt(i, 10);
          return <line key={i} className="radar-grid" x1={CX} y1={CY} x2={x} y2={y} />;
        })}
        {[5, 10].map((v) => (
          <text key={v} className="radar-tick" x={CX + 4} y={CY - (R * v) / 10 + 3}>
            {v}
          </text>
        ))}
        {previous && <polygon className="radar-prev" points={poly(previous)} />}
        <polygon className="radar-latest" points={poly(latest)} />
        {AREAS.map((a, i) => {
          const v = latest[a.key];
          if (typeof v !== "number") return null;
          const [x, y] = pt(i, v);
          const p = previous?.[a.key];
          return (
            <g key={a.key} className="radar-pt">
              <circle cx={x} cy={y} r="11" fill="transparent" />
              <circle className="radar-dot" cx={x} cy={y} r="4.5" />
              <title>{`${a.label}: ${v}${typeof p === "number" ? ` (was ${p})` : ""}`}</title>
            </g>
          );
        })}
        {AREAS.map((a, i) => {
          const ang = angle(i);
          const x = CX + Math.cos(ang) * (R + 16);
          const y = CY + Math.sin(ang) * (R + 16);
          const anchor = Math.abs(Math.cos(ang)) < 0.2 ? "middle" : Math.cos(ang) > 0 ? "start" : "end";
          return (
            <text key={a.key} className="radar-label" x={x} y={y + (Math.sin(ang) > 0.5 ? 10 : Math.sin(ang) < -0.5 ? -4 : 4)} textAnchor={anchor}>
              {a.label} <tspan className="radar-val">{latest[a.key] ?? "–"}</tspan>
            </text>
          );
        })}
      </svg>
      <figcaption className="chart-legend">
        <span>
          <i className="sw latest" /> Latest ({shortDate(latestDate)})
        </span>
        {previous && previousDate && (
          <span>
            <i className="sw prev" /> Previous ({shortDate(previousDate)})
          </span>
        )}
      </figcaption>
    </figure>
  );
}

/** Tiny trend line on a fixed 1-10 scale, oldest to newest, last value marked. */
export function Sparkline({ values, label }: { values: { v: number; d: string }[]; label: string }) {
  if (values.length < 2) return null;
  const W = 84,
    H = 26,
    pad = 3;
  const x = (i: number) => pad + (i * (W - 2 * pad)) / (values.length - 1);
  const y = (v: number) => H - pad - ((v - 1) * (H - 2 * pad)) / 9;
  const pts = values.map((p, i) => `${x(i)},${y(p.v)}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${label} over time: ${values.map((p) => p.v).join(", ")}`}>
      <polyline points={pts} />
      <circle cx={x(values.length - 1)} cy={y(last.v)} r="3" />
      <title>{values.map((p) => `${shortDate(p.d)}: ${p.v}`).join("\n")}</title>
    </svg>
  );
}

/** 1-10 rating bar with the change since the previous evaluation. */
export function RatingBar({ value, previous }: { value: number | undefined; previous?: number }) {
  const delta = typeof value === "number" && typeof previous === "number" ? Math.round((value - previous) * 10) / 10 : null;
  return (
    <span className="rating">
      <span className="rating-track" aria-hidden="true">
        <i style={{ width: `${((value ?? 0) / 10) * 100}%` }} />
        {typeof previous === "number" && <b style={{ left: `${(previous / 10) * 100}%` }} title={`Previous: ${previous}`} />}
      </span>
      <span className="rating-num tnum">{value ?? "–"}</span>
      {delta !== null && delta !== 0 && (
        <span className={`delta ${delta > 0 ? "up" : "down"}`} aria-label={`${delta > 0 ? "up" : "down"} ${Math.abs(delta)} since last time`}>
          {delta > 0 ? "▲" : "▼"} {Math.abs(delta)}
        </span>
      )}
    </span>
  );
}
