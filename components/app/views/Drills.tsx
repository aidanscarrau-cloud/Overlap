"use client";

import { useApp } from "../AppProvider";
import { useFamilyRedirect } from "../FamilyRedirect";
import { Icon } from "@/components/ui";
import { BrowseDrills, SessionBuilder } from "../drills/DrillsHub";
import type { Category, Drill } from "@/lib/types";

export const filterDrills = (drills: Drill[], cat: "all" | Category, q: string) => {
  const s = q.trim().toLowerCase();
  return drills.filter((d) => (cat === "all" || d.category === cat) && (!s || (d.name + " " + d.description).toLowerCase().includes(s)));
};

export function Drills() {
  // Players and parents don't use this page; send them home.
  const family = useFamilyRedirect();
  return family ? null : <DrillsPage />;
}

function DrillsPage() {
  const { data, can, open, team } = useApp();
  const canEdit = can("drills.edit");
  return (
    <div className="drills-page">
      <div className="phead">
        <div>
          <div className="eyebrow">{team ? team.name : data.club.name} · {data.drills.length} club drills</div>
          <h1>Drills</h1>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => open({ kind: "drill-edit", id: null })}>
            <Icon id="i-plus" />
            New drill
          </button>
        )}
      </div>
      <div className="dhub">
        <div className="dhub-side">
          <SessionBuilder />
        </div>
        <BrowseDrills />
      </div>
    </div>
  );
}
