"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { useFamilyRedirect } from "../FamilyRedirect";
import { Icon } from "@/components/ui";
import { DrillTile, purposeOf } from "../drills/DrillParts";
import { CATS } from "@/lib/constants";
import type { Category, Drill } from "@/lib/types";
import { LibraryBrowser } from "./DrillLibrary";
import { LIBRARY } from "@/lib/library-drills";

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
  const { data, can, open } = useApp();
  const canEdit = can("drills.edit");
  const [cat, setCat] = useState<"all" | Category>("all");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"club" | "library">(data.drills.length ? "club" : "library");
  const ds = filterDrills(data.drills, cat, q);
  const cats = (Object.keys(CATS) as Category[]).filter((c) => data.drills.some((d) => d.category === c));
  return (
    <div className="drills-page">
      <div className="phead">
        <div>
          <div className="eyebrow">
            {data.drills.length} club drill{data.drills.length === 1 ? "" : "s"} · {LIBRARY.length} in the Overlap library
          </div>
          <h1>Drills</h1>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => open({ kind: "drill-edit", id: null })}>
            <Icon id="i-plus" />
            New drill
          </button>
        )}
      </div>
      <div className="seg" role="tablist" aria-label="Which drills">
        <button role="tab" aria-selected={view === "club"} onClick={() => setView("club")}>
          Our drills <span>{data.drills.length}</span>
        </button>
        <button role="tab" aria-selected={view === "library"} onClick={() => setView("library")}>
          Overlap library <span>{LIBRARY.length}</span>
        </button>
      </div>
      {view === "library" ? (
        <LibraryBrowser />
      ) : (
        <>
          <div className="dfind">
            <label className="dsearch">
              <Icon id="i-search" />
              <input type="search" placeholder="Search your drills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search your drills" />
            </label>
          </div>
          {cats.length > 1 && (
            <div className="dchips" role="group" aria-label="Type">
              {(["all", ...cats] as ("all" | Category)[]).map((c) => (
                <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
                  {c === "all" ? "All" : CATS[c]}
                </button>
              ))}
            </div>
          )}
          {ds.length ? (
            <div className="dgrid">
              {ds.map((d) => (
                <DrillTile
                  key={d.id}
                  name={d.name}
                  diagram={d.diagram}
                  category={d.category}
                  label={CATS[d.category]}
                  minutes={d.minutes}
                  players={d.player_count || undefined}
                  extra={d.area || undefined}
                  purpose={purposeOf(d.description)}
                  onOpen={() => open({ kind: "drill", id: d.id })}
                />
              ))}
            </div>
          ) : (
            <div className="dempty">
              <b>{data.drills.length ? "No drills match." : "Your club has no drills yet."}</b>
              {!data.drills.length && (
                <>
                  <span>Start with some of the 60 ready-made practices, then change them to suit your team.</span>
                  <button className="btn primary" onClick={() => setView("library")}>
                    Browse the Overlap library
                  </button>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
