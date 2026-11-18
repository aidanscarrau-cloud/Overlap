"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { SheetFrame } from "../sheets/SheetFrame";
import { Icon } from "@/components/ui";
import { DrillDetail, DrillTile, purposeOf } from "../drills/DrillParts";
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
    if (!fresh.length) return toast("Already in your club's drills");
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
    toast(fresh.length === 1 ? `${fresh[0].name} added to your club's drills` : `${fresh.length} drills added to your club's drills`);
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
  const shelves = theme === "all" && !s;

  const tile = (d: LibraryDrill) => {
    const added = have.has(norm(d.name));
    return (
      <DrillTile
        key={d.key}
        name={d.name}
        diagram={d.diagram}
        category={d.category}
        label={THEMES[d.theme]}
        minutes={d.minutes}
        players={d.player_count}
        extra={d.ages.map((a) => AGE_BANDS[a]).join(" · ")}
        purpose={purposeOf(d.description)}
        onOpen={() => open({ kind: "library-drill", key: d.key })}
        action={
          canEdit ? (
            added ? (
              <span className="dt-added" title="In your club's drills" aria-label="In your club's drills">
                ✓
              </span>
            ) : (
              <button type="button" className="dt-add" disabled={busy} onClick={() => add([d])} aria-label={`Add ${d.name} to your club's drills`} title="Add to our drills">
                +
              </button>
            )
          ) : undefined
        }
      />
    );
  };

  return (
    <>
      <div className="dfind">
        <label className="dsearch">
          <Icon id="i-search" />
          <input type="search" placeholder="Search drills" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search the Overlap library" />
        </label>
        <select className="dage" value={age} onChange={(e) => setAge(e.target.value as "all" | AgeBand)} aria-label="Age group">
          <option value="all">All ages</option>
          {(Object.keys(AGE_BANDS) as AgeBand[]).map((a) => (
            <option key={a} value={a}>
              {AGE_BANDS[a]}
            </option>
          ))}
        </select>
      </div>
      <div className="dchips" role="group" aria-label="Theme">
        {(["all", ...themes] as ("all" | Theme)[]).map((t) => (
          <button key={t} className="chip" aria-pressed={theme === t} onClick={() => setTheme(t)}>
            {t === "all" ? "All" : THEMES[t]}
          </button>
        ))}
      </div>
      {shelves ? (
        themes.map((t) => {
          const row = list.filter((d) => d.theme === t);
          if (!row.length) return null;
          const missing = row.filter((d) => !have.has(norm(d.name)));
          return (
            <section key={t} className="dshelf-sec">
              <div className="dshelf-h">
                <h2>
                  {THEMES[t]} <small>{row.length}</small>
                </h2>
                <span className="dshelf-links">
                  {canEdit && missing.length > 1 && (
                    <button type="button" className="linkbtn" disabled={busy} onClick={() => add(missing)}>
                      Add all {missing.length}
                    </button>
                  )}
                  <button type="button" className="linkbtn" onClick={() => setTheme(t)}>
                    See all
                  </button>
                </span>
              </div>
              <div className="dshelf">{row.map(tile)}</div>
            </section>
          );
        })
      ) : list.length ? (
        <div className="dgrid">{list.map(tile)}</div>
      ) : (
        <div className="dempty">
          <b>No practices match.</b>
          <span>Try another word, or clear the filters.</span>
        </div>
      )}
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
          {can("drills.edit") && added && <span className="lib-added">✓ In your club&apos;s drills</span>}
          <button className="btn" onClick={close}>
            Close
          </button>
          {can("drills.edit") && !added && (
            <button className="btn primary" disabled={busy} onClick={() => add([d]).then(close)}>
              Add to our drills
            </button>
          )}
        </>
      }
    >
      <DrillDetail
        name={d.name}
        diagram={d.diagram}
        category={d.category}
        label={THEMES[d.theme]}
        minutes={d.minutes}
        players={d.player_count}
        area={d.area}
        ages={d.ages.map((a) => AGE_BANDS[a]).join(" · ")}
        description={d.description}
        points={d.points}
      />
    </SheetFrame>
  );
}
