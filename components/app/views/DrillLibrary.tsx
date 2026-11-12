"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { SheetFrame } from "../sheets/SheetFrame";
import { Diagram, Icon } from "@/components/ui";
import { CATS } from "@/lib/constants";
import { AGE_BANDS, LIBRARY, LIBRARY_BY_KEY, THEMES, type AgeBand, type LibraryDrill, type Theme } from "@/lib/library-drills";
import { errMsg } from "@/lib/format";

const norm = (s: string) => s.trim().toLowerCase();

/** Copies library drills into the club's own library, skipping any it already has (by name). */
function useAddDrills() {
  const { data, supabase, refresh, toast, patch } = useApp();
  const have = new Set(data.drills.map((d) => norm(d.name)));
  const [busy, setBusy] = useState(false);
  async function add(list: LibraryDrill[]) {
    const fresh = list.filter((d) => !have.has(norm(d.name)));
    if (!fresh.length) return toast("Already in your library");
    setBusy(true);
    const rows = fresh.map((d) => ({
      club_id: data.club.id,
      name: d.name,
      category: d.category,
      minutes: d.minutes,
      player_count: d.player_count,
      area: d.area,
      description: d.description,
      points: d.points,
      diagram: d.diagram,
    }));
    const { data: ins, error } = await supabase.from("drills").insert(rows).select("id,club_id,name,category,minutes,player_count,area,description,points,diagram");
    setBusy(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, drills: [...x.drills, ...((ins ?? []) as typeof x.drills)] }));
    toast(fresh.length === 1 ? `${fresh[0].name} added to your library` : `${fresh.length} drills added to your library`);
    refresh();
  }
  return { have, add, busy };
}

export function LibraryBrowser() {
  const { can, open } = useApp();
  const canEdit = can("drills.edit");
  const [theme, setTheme] = useState<"all" | Theme>("all");
  const [age, setAge] = useState<"all" | AgeBand>("all");
  const [q, setQ] = useState("");
  const { have, add, busy } = useAddDrills();
  const s = norm(q);
  const list = LIBRARY.filter(
    (d) => (theme === "all" || d.theme === theme) && (age === "all" || d.ages.includes(age)) && (!s || norm(d.name + " " + d.description + " " + d.points.join(" ")).includes(s)),
  );
  const themes = (Object.keys(THEMES) as Theme[]).filter((t) => LIBRARY.some((d) => d.theme === t));
  const notAdded = list.filter((d) => !have.has(norm(d.name)));

  return (
    <>
      <p className="muted lib-intro">
        Ready-made practices written for Overlap. Add the ones you like to your club&apos;s library, then change them however you want.
      </p>
      <div className="toolbar">
        <label className="search">
          <Icon id="i-search" />
          <input className="input" type="search" placeholder="Search the library" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the library" />
        </label>
        <select className="input lib-age" value={age} onChange={(e) => setAge(e.target.value as "all" | AgeBand)} aria-label="Age group">
          <option value="all">All ages</option>
          {(Object.keys(AGE_BANDS) as AgeBand[]).map((a) => (
            <option key={a} value={a}>
              {AGE_BANDS[a]}
            </option>
          ))}
        </select>
        <div className="chips">
          {(["all", ...themes] as ("all" | Theme)[]).map((t) => (
            <button key={t} className="chip" aria-pressed={theme === t} onClick={() => setTheme(t)}>
              {t === "all" ? "All" : THEMES[t]}
              <span className="n">{t === "all" ? LIBRARY.length : LIBRARY.filter((d) => d.theme === t).length}</span>
            </button>
          ))}
        </div>
      </div>
      {canEdit && notAdded.length > 1 && (
        <div className="lib-bulk">
          <button className="btn" disabled={busy} onClick={() => add(notAdded)}>
            Add all {notAdded.length} shown to my library
          </button>
        </div>
      )}
      <div className="drills">
        {list.length ? (
          list.map((d) => {
            const added = have.has(norm(d.name));
            return (
              <div key={d.key} className="card dcard lib-card">
                <button className="lib-open" onClick={() => open({ kind: "library-drill", key: d.key })} aria-label={`Preview ${d.name}`}>
                  <div className="pic">
                    <Diagram d={d.diagram} label={d.name} />
                    <span className="badge" data-cat={d.category}>
                      {CATS[d.category]}
                    </span>
                    <span className="mins">{d.minutes}′</span>
                  </div>
                  <div className="body">
                    <h3>{d.name}</h3>
                    <p>{d.description.split("\n\n")[0].replace(/^What it's for: /, "")}</p>
                    <div className="dmeta">
                      <span>
                        <Icon id="i-people" />
                        {d.player_count}
                      </span>
                      <span>{d.ages.map((a) => AGE_BANDS[a]).join(", ")}</span>
                    </div>
                  </div>
                </button>
                {canEdit && (
                  <div className="lib-foot">
                    {added ? (
                      <span className="lib-added">✓ In your library</span>
                    ) : (
                      <button className="btn sm" disabled={busy} onClick={() => add([d])}>
                        Add to my library
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        ) : (
          <div className="empty">No library drills match.</div>
        )}
      </div>
    </>
  );
}

export function LibraryDrillSheet({ drillKey }: { drillKey: string }) {
  const { can, close } = useApp();
  const d = LIBRARY_BY_KEY.get(drillKey);
  const { have, add, busy } = useAddDrills();
  if (!d) return <SheetFrame title="Drill not found">This drill isn&apos;t in the library.</SheetFrame>;
  const added = have.has(norm(d.name));
  return (
    <SheetFrame
      title={d.name}
      foot={
        <>
          <span className="spacer" />
          <button className="btn" onClick={close}>
            Close
          </button>
          {can("drills.edit") &&
            (added ? (
              <span className="lib-added">✓ In your library</span>
            ) : (
              <button className="btn primary" disabled={busy} onClick={() => add([d]).then(close)}>
                Add to my library
              </button>
            ))}
        </>
      }
    >
      <div className="lib-sheet">
        <Diagram d={d.diagram} label={d.name} />
        <div className="dmeta">
          <span>{THEMES[d.theme]}</span>
          <span>{d.minutes} min</span>
          <span>
            <Icon id="i-people" />
            {d.player_count}
          </span>
          <span>
            <Icon id="i-area" />
            {d.area}
          </span>
          <span>{d.ages.map((a) => AGE_BANDS[a]).join(", ")}</span>
        </div>
        <p className="lib-desc">{d.description}</p>
        <div>
          <h3>Coaching points</h3>
          <ul>
            {d.points.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </div>
      </div>
    </SheetFrame>
  );
}
