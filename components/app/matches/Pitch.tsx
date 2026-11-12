"use client";

import type { Player } from "@/lib/types";
import type { Formation } from "@/lib/formations";

/**
 * A half-pitch with the line-up. Each spot shows the player's shirt number and first name.
 * When `onPick` is given the spots are buttons (for coaches picking the team).
 */
export function Pitch({
  formation,
  bySlot,
  selected,
  onPick,
  highlight,
}: {
  formation: Formation;
  bySlot: Map<number, Player>;
  selected?: number | null;
  onPick?: (slot: number) => void;
  highlight?: Set<string>;
}) {
  return (
    <div className="pitch-lineup" role={onPick ? "group" : "img"} aria-label={`Line-up, ${formation.name}`}>
      <svg className="pitch-lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <rect x="2" y="2" width="96" height="96" rx="1.5" />
        <line x1="2" y1="2" x2="98" y2="2" />
        <path d="M30 98 V82 H70 V98" />
        <path d="M42 98 V93 H58 V98" />
        <path d="M38 82 A12 9 0 0 0 62 82" />
        <path d="M38 2 A12 9 0 0 0 62 2" />
      </svg>
      {formation.slots.map((s, i) => {
        const p = bySlot.get(i);
        const label = p ? `${s.pos}: ${p.full_name}` : `${s.pos}: empty`;
        const content = (
          <>
            <span className="pl-dot">{p ? (p.shirt_number ?? p.full_name[0]) : "+"}</span>
            <span className="pl-name">{p ? p.full_name.split(" ")[0] : s.pos}</span>
          </>
        );
        const style = { left: `${s.x}%`, top: `${s.y}%` };
        return onPick ? (
          <button
            key={i}
            type="button"
            className="pl-slot"
            style={style}
            aria-pressed={selected === i}
            data-empty={!p || undefined}
            aria-label={label}
            onClick={() => onPick(i)}
          >
            {content}
          </button>
        ) : (
          <span key={i} className="pl-slot" style={style} data-empty={!p || undefined} data-mine={(p && highlight?.has(p.id)) || undefined} title={label}>
            {content}
          </span>
        );
      })}
    </div>
  );
}
