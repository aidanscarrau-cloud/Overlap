"use client";

import { useState } from "react";
import { Diagram } from "@/components/ui";
import type { Category, Diagram as DiagramT } from "@/lib/types";
import { CATS } from "@/lib/constants";
import { AnimatedDiagram } from "../AnimatedDiagram";

/* Shared pieces for drill cards and the drill detail view, used by both the club's drills and the Overlap library. */

type Section = { title: string; text: string; bullets: string[] };

const KNOWN: Record<string, string> = {
  "what it's for": "What it's for",
  purpose: "What it's for",
  setup: "Setup",
  "set up": "Setup",
  "how it works": "How it works",
  progressions: "Progressions",
  progression: "Progressions",
  regressions: "Make it easier",
  "make it easier": "Make it easier",
  "make it harder": "Make it harder",
  scoring: "Scoring",
  rules: "Rules",
};

/** Splits "What it's for: … / Setup: … / Progressions:\n• …" text into titled sections. Plain text becomes one "About" section. */
export function parseDescription(text: string): Section[] {
  const parts = (text || "").split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  return parts.map((p, i) => {
    const m = p.match(/^([A-Za-z][A-Za-z' ]{1,24}):\s*/);
    const key = m?.[1].toLowerCase();
    const title = key && KNOWN[key] ? KNOWN[key] : m && m[1].length <= 18 ? m[1] : i === 0 ? "About" : "";
    const rest = m && title ? p.slice(m[0].length) : p;
    const lines = rest.split("\n").map((l) => l.trim()).filter(Boolean);
    const bullets = lines.filter((l) => /^[•\-–*]\s*/.test(l)).map((l) => l.replace(/^[•\-–*]\s*/, ""));
    const plain = lines.filter((l) => !/^[•\-–*]\s*/.test(l)).join(" ");
    const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
    return { title, text: cap(plain), bullets: bullets.map(cap) };
  });
}

/** The one-line purpose for a card. */
export function purposeOf(text: string) {
  const s = parseDescription(text);
  const p = s.find((x) => x.title === "What it's for") ?? s[0];
  if (!p) return "";
  const t = p.text || p.bullets.join(", ");
  return t.charAt(0).toUpperCase() + t.slice(1);
}

const ICONS: Record<string, React.ReactNode> = {
  "What it's for": <path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zm0 5a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm0 3.2a.8.8 0 1 0 0 1.6.8.8 0 0 0 0-1.6z" />,
  Setup: <path d="M12 4l7 14H5zM9 14h6" />,
  "How it works": <path d="M5 12h10M11 6l6 6-6 6" />,
  Progressions: <path d="M4 18l5-5 4 3 7-8M15 8h5v5" />,
};

export function DrillTile({
  name,
  diagram,
  category,
  label,
  minutes,
  players,
  extra,
  purpose,
  onOpen,
  action,
}: {
  name: string;
  diagram: DiagramT;
  category: Category;
  label: string;
  minutes: number;
  players?: string;
  extra?: string;
  purpose?: string;
  onOpen: () => void;
  action?: React.ReactNode;
}) {
  return (
    <div className="dtile2">
      <button type="button" className="dtile2-open" onClick={onOpen} aria-label={`Open ${name}`}>
        <span className="dtile2-pic">
          <Diagram d={diagram} label={name} />
        </span>
        <span className="dtile2-body">
          <span className="dtile2-top">
            <span className="cat-tag" data-cat={category}>
              {label}
            </span>
            <span className="dtile2-min">{minutes} min</span>
          </span>
          <b>{name}</b>
          {purpose && <span className="dtile2-purpose">{purpose}</span>}
          {(players || extra) && (
            <span className="dtile2-meta">
              {players && (
                <span>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <circle cx="9" cy="8" r="3.2" />
                    <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
                    <circle cx="17" cy="9" r="2.4" />
                    <path d="M16 14.3c2.3.2 3.9 1.8 4.4 4.7" />
                  </svg>
                  {players}
                </span>
              )}
              {extra && <span>{extra}</span>}
            </span>
          )}
        </span>
      </button>
      {action && <span className="dtile2-act">{action}</span>}
    </div>
  );
}

export function DrillDetail({
  name,
  diagram,
  category,
  label,
  minutes,
  players,
  area,
  ages,
  description,
  points,
  colour,
}: {
  name: string;
  diagram: DiagramT;
  category: Category;
  label?: string;
  colour?: string;
  minutes: number;
  players?: string;
  area?: string;
  ages?: string;
  description: string;
  points: string[];
}) {
  const sections = parseDescription(description);
  const purpose = sections.find((s) => s.title === "What it's for") ?? (sections[0]?.title === "About" ? sections[0] : undefined);
  const LATER = ["Progressions", "Make it easier", "Make it harder"];
  const setup = sections.filter((s) => s !== purpose && !LATER.includes(s.title));
  const later = sections.filter((s) => LATER.includes(s.title));
  const tabs = [
    { k: "overview", l: "Overview" },
    ...(setup.length ? [{ k: "setup", l: "Setup" }] : []),
    ...(later.length ? [{ k: "progress", l: "Progress" }] : []),
  ];
  const [tab, setTab] = useState("overview");
  const block = (list: Section[]) =>
    list.map((s, i) => (
      <section key={i} className="dsec">
        {s.title && (
          <h3>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {ICONS[s.title] ?? <circle cx="12" cy="12" r="3" />}
            </svg>
            {s.title}
          </h3>
        )}
        {s.text && <p>{s.text}</p>}
        {s.bullets.length > 0 && (
          <ul>
            {s.bullets.map((b, j) => (
              <li key={j}>{b}</li>
            ))}
          </ul>
        )}
      </section>
    ));
  return (
    <div className="ddetail">
      <AnimatedDiagram d={diagram} label={name} />
      <div className="dhead">
        <span className="cat-tag" data-cat={category} style={colour ? ({ "--cc": colour } as React.CSSProperties) : undefined}>
          {label ?? CATS[category]}
        </span>
        <h2>{name}</h2>
      </div>
      <div className="dfacts">
        <span className="dfact">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="8" />
            <path d="M12 8v4l3 2" />
          </svg>
          <b>{minutes}</b> min
        </span>
        {players && (
          <span className="dfact">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="9" cy="8" r="3.2" />
              <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" />
              <circle cx="17" cy="9" r="2.4" />
            </svg>
            <b>{players}</b>
          </span>
        )}
        {area && (
          <span className="dfact">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="4" y="6" width="16" height="12" rx="1.5" />
            </svg>
            <b>{area}</b>
          </span>
        )}
        {ages && <span className="dfact">{ages}</span>}
      </div>
      {tabs.length > 1 && (
        <div className="seg dtabs" role="tablist" aria-label="Drill details">
          {tabs.map((t) => (
            <button key={t.k} role="tab" aria-selected={tab === t.k} onClick={() => setTab(t.k)}>
              {t.l}
            </button>
          ))}
        </div>
      )}
      {tab === "overview" && (
        <>
          {purpose && purpose.text && <p className="dpurpose">{purpose.text}</p>}
          {points.length > 0 && (
            <section className="dpoints">
              <h3>Coaching points</h3>
              <ul>
                {points.map((p, i) => (
                  <li key={i}>
                    <span className="tick" aria-hidden="true">
                      ✓
                    </span>
                    {p}
                  </li>
                ))}
              </ul>
            </section>
          )}
          {tabs.length === 1 && block(setup)}
        </>
      )}
      {tab === "setup" && block(setup)}
      {tab === "progress" && block(later)}
      <div className="dkey" aria-label="Diagram key">
        <span>
          <i className="k-team" />
          Your team
        </span>
        <span>
          <i className="k-opp" />
          Opponents
        </span>
        <span>
          <i className="k-neu" />
          Neutral / coach
        </span>
        <span>
          <i className="k-pass" />
          Pass
        </span>
        <span>
          <i className="k-run" />
          Run
        </span>
        <span>
          <i className="k-drib" />
          Dribble
        </span>
      </div>
    </div>
  );
}
