"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { useFamilyRedirect } from "../FamilyRedirect";
import { Diagram, Icon } from "@/components/ui";
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
  const [view, setView] = useState<"club" | "library">("club");
  const ds = filterDrills(data.drills, cat, q);
  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">Shared across all teams · {data.drills.length} drills</div>
          <h1>Drill library</h1>
        </div>
        {canEdit && (
          <button className="btn primary" onClick={() => open({ kind: "drill-edit", id: null })}>
            <Icon id="i-plus" />
            New drill
          </button>
        )}
      </div>
      <div className="subtabs" role="tablist" style={{ marginBottom: 14 }}>
        <button role="tab" aria-selected={view === "club"} onClick={() => setView("club")}>
          Our drills ({data.drills.length})
        </button>
        <button role="tab" aria-selected={view === "library"} onClick={() => setView("library")}>
          Overlap library ({LIBRARY.length})
        </button>
      </div>
      {view === "library" ? (
        <LibraryBrowser />
      ) : (
      <>
      <div className="toolbar">
        <label className="search">
          <Icon id="i-search" />
          <input className="input" id="drill-q" type="search" placeholder="Search drills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search drills" />
        </label>
        <div className="chips">
          {(["all", ...Object.keys(CATS)] as ("all" | Category)[]).map((c) => (
            <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>
              {c === "all" ? "All" : CATS[c]}
            </button>
          ))}
        </div>
      </div>
      <div className="drills">
        {ds.length ? (
          ds.map((d) => (
            <button key={d.id} className="card dcard" onClick={() => open({ kind: "drill", id: d.id })}>
              <div className="pic">
                <Diagram d={d.diagram} label={d.name} />
                <span className="badge" data-cat={d.category}>
                  {CATS[d.category]}
                </span>
                <span className="mins">{d.minutes}′</span>
              </div>
              <div className="body">
                <h3>{d.name}</h3>
                <p>{d.description}</p>
                <div className="dmeta">
                  <span>
                    <Icon id="i-people" />
                    {d.player_count || "–"}
                  </span>
                  <span>
                    <Icon id="i-area" />
                    {d.area || "–"}
                  </span>
                </div>
              </div>
            </button>
          ))
        ) : (
          <div className="empty">
            {data.drills.length ? "No drills match." : canEdit ? "Your library is empty. Create your first drill, or add some from the Overlap library." : "No drills yet."}
          </div>
        )}
      </div>
      </>
      )}
    </>
  );
}
