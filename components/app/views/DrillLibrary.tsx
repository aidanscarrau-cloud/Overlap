"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { SheetFrame } from "../sheets/SheetFrame";
import { Icon } from "@/components/ui";
import { DrillDetail, DrillTile, purposeOf } from "../drills/DrillParts";
import { AGE_BANDS, LIBRARY, LIBRARY_BY_KEY, THEMES, type AgeBand, type LibraryDrill, type Theme } from "@/lib/library-drills";
import { errMsg, fmtDay, fmtMon, fmtNum, todayIso } from "@/lib/format";
import { THEME_LOOK } from "../drills/DrillsHub";

export const norm = (s: string) => s.trim().toLowerCase();

/** Copies library drills into the club's own library, skipping any it already has (by name). */
/** Copies library drills into the club's own drills, skipping any it already has (by name).
 *  Returns a name → club drill id map for every drill asked for, or null if it failed. */
export function useAddDrills() {
  const { data, supabase, refresh, toast, patch } = useApp();
  const have = new Set(data.drills.map((d) => norm(d.name)));
  const [busy, setBusy] = useState(false);
  async function add(list: LibraryDrill[], opts: { quiet?: boolean } = {}): Promise<Map<string, string> | null> {
    const ids = new Map(data.drills.map((d) => [norm(d.name), d.id] as const));
    const fresh = list.filter((d, i) => !have.has(norm(d.name)) && list.findIndex((x) => x.key === d.key) === i);
    if (!fresh.length) {
      if (!opts.quiet) toast("Already in your club's drills");
      return ids;
    }
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
    if (error) {
      toast(errMsg(error));
      return null;
    }
    const added = (ins ?? []) as typeof data.drills;
    added.forEach((d) => ids.set(norm(d.name), d.id));
    patch((x) => ({ ...x, drills: [...x.drills, ...added] }));
    if (!opts.quiet) toast(fresh.length === 1 ? `${fresh[0].name} added to your club's drills` : `${fresh.length} drills added to your club's drills`);
    refresh();
    return ids;
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
  const { can, canDo, close, team, sessionsOf, supabase, toast, refresh, patch } = useApp();
  const d = LIBRARY_BY_KEY.get(drillKey);
  const { have, add, busy } = useAddDrills();
  const [adding, setAdding] = useState(false);
  if (!d) return <SheetFrame title="Drill not found">This drill isn&apos;t in the library.</SheetFrame>;
  const added = have.has(norm(d.name));
  const next = sessionsOf().find((s) => s.date >= todayIso());
  const canPlan = !!team && !!next && canDo("sessions.edit", team.id) && can("drills.edit");

  async function addToSession() {
    if (!next || !d) return;
    setAdding(true);
    const ids = await add([d], { quiet: true });
    const id = ids?.get(norm(d.name));
    if (!id) return setAdding(false);
    const plan = [...next.plan, { drill_id: id, mins: d.minutes }];
    const { error } = await supabase.from("sessions").update({ plan }).eq("id", next.id);
    setAdding(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, sessions: x.sessions.map((s) => (s.id === next.id ? { ...s, plan } : s)) }));
    toast(`${d.name} added to ${fmtDay(next.date)} ${fmtNum(next.date)} ${fmtMon(next.date)}`);
    refresh();
    close();
  }

  return (
    <SheetFrame
      title="Drill"
      foot={
        <>
          <span className="spacer" />
          {can("drills.edit") &&
            (added ? (
              <span className="lib-added">✓ Saved to our drills</span>
            ) : (
              <button className="btn" disabled={busy} onClick={() => add([d])}>
                Save
              </button>
            ))}
          {canPlan ? (
            <button className="btn primary" disabled={adding || busy} onClick={addToSession}>
              {adding ? "Adding…" : `Add to ${fmtDay(next!.date)}'s session`}
            </button>
          ) : (
            <button className="btn" onClick={close}>
              Close
            </button>
          )}
        </>
      }
    >
      <DrillDetail
        name={d.name}
        diagram={d.diagram}
        category={d.category}
        label={THEME_LOOK[d.theme].short}
        colour={THEME_LOOK[d.theme].colour}
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
