"use client";

import { useState } from "react";
import { AnimatedDiagram } from "@/components/app/AnimatedDiagram";
import type { Diagram } from "@/lib/types";

export type DemoDrill = { key: string; name: string; minutes: number; players: string; area: string; points: string[]; diagram: Diagram };

/** A real drill from the library, playing on the pitch, so visitors see what "drills you can watch" means. */
export function DrillDemo({ drills }: { drills: DemoDrill[] }) {
  const [i, setI] = useState(0);
  const d = drills[i];
  return (
    <figure className="lp-shot lp-drill">
      <div className="lp-drill-tabs" role="tablist" aria-label="Choose a drill">
        {drills.map((x, k) => (
          <button key={x.key} type="button" role="tab" aria-selected={k === i} onClick={() => setI(k)}>
            {x.name}
          </button>
        ))}
      </div>
      <div className="lp-drill-pitch">
        <AnimatedDiagram key={d.key} d={d.diagram} label={d.name} />
      </div>
      <figcaption>
        <b>{d.name}</b>
        <span>
          {d.minutes} min · {d.players} players · {d.area}
        </span>
        <ul>
          {d.points.slice(0, 3).map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}
