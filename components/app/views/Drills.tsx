"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { Diagram, Icon } from "@/components/ui";
import { CATS } from "@/lib/constants";
import type { Category, Drill } from "@/lib/types";

export const filterDrills = (drills: Drill[], cat: "all" | Category, q: string) => {
  const s = q.trim().toLowerCase();
  return drills.filter((d) => (cat === "all" || d.category === cat) && (!s || (d.name + " " + d.description).toLowerCase().includes(s)));
};

export function Drills() {
  const { data, can, open } = useApp();
  const canEdit = can("drills.edit");
  const [cat, setCat] = useState<"all" | Category>("all");
  const [q, setQ] = useState("");
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
          <div className="empty">{data.drills.length ? "No drills match." : canEdit ? "Your library is empty. Create your first drill." : "No drills yet."}</div>
        )}
      </div>
    </>
  );
}
