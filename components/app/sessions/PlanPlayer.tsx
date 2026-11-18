"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatedDiagram } from "../AnimatedDiagram";
import { Diagram } from "@/components/ui";
import { CATS } from "@/lib/constants";
import { addMins } from "@/lib/format";
import type { Drill, PlanItem } from "@/lib/types";
import { purposeOf } from "../drills/DrillParts";

/* Animations inside a session plan: a thumbnail with a play button on each drill, an inline preview,
   and a full-screen walk-through of the whole session, drill by drill. */

export function PlanThumb({ drill, open, onToggle }: { drill: Drill; open: boolean; onToggle: () => void }) {
  return (
    <button type="button" className={`prow-thumb${open ? " on" : ""}`} onClick={onToggle} aria-expanded={open} aria-label={`${open ? "Hide" : "Play"} the animation for ${drill.name}`}>
      <Diagram d={drill.diagram} label={drill.name} />
      <span className="prow-play" aria-hidden="true">
        {open ? (
          <svg viewBox="0 0 24 24">
            <path d="M7 14l5-5 5 5" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24">
            <path d="M8.5 6v12l10-6z" />
          </svg>
        )}
      </span>
    </button>
  );
}

export function PlanPeek({ drill, onOpen }: { drill: Drill; onOpen?: () => void }) {
  const purpose = purposeOf(drill.description);
  return (
    <div className="prow-peek">
      <AnimatedDiagram d={drill.diagram} label={drill.name} />
      {purpose && <p className="peek-purpose">{purpose}</p>}
      {drill.points.length > 0 && (
        <ul className="peek-points">
          {drill.points.map((p, i) => (
            <li key={i}>
              <span aria-hidden="true">✓</span>
              {p}
            </li>
          ))}
        </ul>
      )}
      {onOpen && (
        <button type="button" className="linkbtn" onClick={onOpen}>
          Full drill: setup, how it works and progressions →
        </button>
      )}
    </div>
  );
}

export function WalkButton({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button type="button" className="walk-btn" onClick={onClick}>
      <span className="walk-ic" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M8.5 6v12l10-6z" />
        </svg>
      </span>
      <span>
        <b>Walk through the session</b>
        <small>Watch all {count} drills in order, full screen</small>
      </span>
    </button>
  );
}

/** Full-screen, drill by drill. Arrow keys and swipes move between drills; Esc closes. */
export function SessionWalk({ items, start, onClose, at = 0 }: { items: { item: PlanItem; drill: Drill }[]; start: string; onClose: () => void; at?: number }) {
  const [i, setI] = useState(at);
  const [x0, setX0] = useState<number | null>(null);
  const n = items.length;
  const go = (k: number) => setI((v) => Math.max(0, Math.min(n - 1, v + k)));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", key);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (!n) return null;
  const { item, drill } = items[i];
  let clock = start;
  for (const x of items.slice(0, i)) clock = addMins(clock, +x.item.mins || 0);
  const end = addMins(clock, +item.mins || 0);
  const purpose = purposeOf(drill.description);

  const ui = (
    <div className="walk" role="dialog" aria-modal="true" aria-label={`Session walk-through: drill ${i + 1} of ${n}`}
      onTouchStart={(e) => setX0(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (x0 === null) return;
        const dx = e.changedTouches[0].clientX - x0;
        if (Math.abs(dx) > 60) go(dx < 0 ? 1 : -1);
        setX0(null);
      }}
    >
      <header className="walk-h">
        <div className="walk-dots" aria-hidden="true">
          {items.map((_, k) => (
            <i key={k} className={k < i ? "done" : k === i ? "on" : ""} />
          ))}
        </div>
        <button type="button" className="walk-x" onClick={onClose} aria-label="Close walk-through">
          <svg viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </header>
      <div className="walk-body" key={i}>
        <div className="walk-meta">
          <span className="walk-n">
            Drill {i + 1} of {n}
          </span>
          <span>
            {clock}–{end} · {item.mins} min · {CATS[drill.category]}
          </span>
        </div>
        <h2>{drill.name}</h2>
        <AnimatedDiagram d={drill.diagram} label={drill.name} />
        {purpose && <p className="walk-purpose">{purpose}</p>}
        {drill.points.length > 0 && (
          <ul className="walk-points">
            {drill.points.map((p, k) => (
              <li key={k}>
                <span aria-hidden="true">✓</span>
                {p}
              </li>
            ))}
          </ul>
        )}
      </div>
      <footer className="walk-f">
        <button type="button" className="walk-nav" onClick={() => go(-1)} disabled={i === 0}>
          ← Back
        </button>
        {i < n - 1 ? (
          <button type="button" className="walk-nav next" onClick={() => go(1)}>
            Next: {items[i + 1].drill.name} →
          </button>
        ) : (
          <button type="button" className="walk-nav next" onClick={onClose}>
            Done ✓
          </button>
        )}
      </footer>
    </div>
  );
  // Rendered at the top of the app (inside the club's colours) so it covers the sheet and the menus.
  return typeof document === "undefined" ? ui : createPortal(ui, document.querySelector(".look-root") ?? document.body);
}
