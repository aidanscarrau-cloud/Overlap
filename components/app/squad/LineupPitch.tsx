"use client";

import { useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { STATUS } from "@/lib/constants";
import { errMsg } from "@/lib/format";
import { pingPush } from "@/lib/push-client";
import { FORMATIONS, FORMAT_LABEL, formationFor } from "@/lib/formations";
import type { MatchFormat, Player, Team } from "@/lib/types";

/*
 * The Squad pitch: the team's chosen formation with a player in each spot.
 * Coaches switch to "Edit line-up" to pick the match size and formation, then drag players between spots,
 * from the bench onto the pitch, or off to the bench (or tap one player, then another, to swap them).
 */

type Reply = "y" | "n" | "q";
const REPLY = { y: { t: "✓", c: "#16a34a", bg: "#e8f6ee" }, n: { t: "✕", c: "#c2372f", bg: "#fdecec" }, q: { t: "?", c: "#98a2b3", bg: "#f2f3f5" } };
const STATUS_COLOUR = { available: "#16a34a", injured: "#c2372f", unavailable: "#a16207" } as const;
const FORMATS: MatchFormat[] = ["5", "7", "9", "11"];
type Spot = { kind: "slot"; i: number } | { kind: "bench"; id: string };

/** Junior football in Australia: small-sided games for the youngest, 11-a-side from about U12. */
export function defaultFormat(team: Team): MatchFormat {
  const m = team.name.match(/\bU\s?(\d{1,2})\b/i) ?? team.age_group?.match(/\bU?\s?(\d{1,2})\b/i);
  const n = m ? Number(m[1]) : 99;
  return n <= 7 ? "5" : n <= 9 ? "7" : n <= 11 ? "9" : "11";
}

/** Fill a formation from the squad: the right position first, the most regular attenders first. */
function autoFill(format: MatchFormat, formation: string, players: Player[], rate: (p: Player) => number | null) {
  const f = formationFor(format, formation);
  const pool = players.filter((p) => p.status === "available").sort((a, b) => (rate(b) ?? 0) - (rate(a) ?? 0));
  const used = new Set<string>();
  const slots = new Map<number, string>();
  f.slots.forEach((s, i) => {
    const p = pool.find((x) => !used.has(x.id) && x.position === s.pos);
    if (p) (slots.set(i, p.id), used.add(p.id));
  });
  f.slots.forEach((_, i) => {
    if (slots.has(i)) return;
    const p = pool.find((x) => !used.has(x.id) && x.position !== "GK");
    if (p) (slots.set(i, p.id), used.add(p.id));
  });
  return slots;
}

export function LineupPitch({
  team,
  players,
  replyOf,
  canEdit,
  rate,
  day,
  mine,
  savedOnly,
}: {
  team: Team;
  players: Player[];
  replyOf: (p: Player) => Reply | null;
  canEdit: boolean;
  rate: (p: Player) => number | null;
  day: string;
  /** Players and parents: their own player(s) are highlighted and nobody's profile opens. */
  mine?: Set<string>;
  /** Show nothing until the coach has saved a line-up. */
  savedOnly?: boolean;
}) {
  const { data, supabase, toast, patch, open } = useApp();
  const saved = data.lineups.find((l) => l.team_id === team.id);
  const byId = useMemo(() => new Map(players.map((p) => [p.id, p])), [players]);
  const initial = () => {
    const format = (saved?.format ?? defaultFormat(team)) as MatchFormat;
    const formation = formationFor(format, saved?.formation ?? "").name;
    const slots = saved
      ? new Map(Object.entries(saved.slots).filter(([, id]) => byId.has(id)).map(([k, id]) => [Number(k), id] as const))
      : autoFill(format, formation, players, rate);
    return { format, formation, slots };
  };
  const [edit, setEdit] = useState(false);
  const family = !!mine;
  const [draft, setDraft] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<Spot | null>(null);
  const [ghost, setGhost] = useState<{ x: number; y: number; label: string } | null>(null);
  const drag = useRef<{ from: Spot; x: number; y: number; moved: boolean; label: string; empty: boolean } | null>(null);

  // Outside edit mode, show what's saved (or the automatic pick) as it is now.
  const view = edit ? draft : initial();
  const f = formationFor(view.format, view.formation);
  const onPitch = new Set(view.slots.values());
  const bench = players.filter((p) => !onPitch.has(p.id));
  const outOnPitch = [...view.slots.values()].map((id) => byId.get(id)).filter((p) => p && p.status !== "available").length;

  const setSlots = (fn: (m: Map<number, string>) => void) =>
    setDraft((d) => {
      const m = new Map(d.slots);
      fn(m);
      return { ...d, slots: m };
    });
  function move(from: Spot, to: Spot) {
    if (from.kind === "bench" && to.kind === "bench") return;
    setSlots((m) => {
      if (from.kind === "slot" && to.kind === "slot") {
        const a = m.get(from.i);
        const b = m.get(to.i);
        if (b) m.set(from.i, b);
        else m.delete(from.i);
        if (a) m.set(to.i, a);
        else m.delete(to.i);
      } else if (from.kind === "bench" && to.kind === "slot") {
        m.set(to.i, from.id);
      } else if (from.kind === "slot" && to.kind === "bench") {
        // Dropped on a bench player: they swap places. Dropped on the bench itself: off the pitch.
        if (to.id) m.set(from.i, to.id);
        else m.delete(from.i);
      }
    });
  }

  function tap(s: Spot) {
    if (!picked) return setPicked(s);
    const same = picked.kind === s.kind && (s.kind === "slot" ? (picked as { i: number }).i === s.i : (picked as { id: string }).id === s.id);
    if (!same) {
      if (picked.kind === "bench" && s.kind === "slot") move(picked, s);
      else if (picked.kind === "slot") move(picked, s);
      else if (s.kind === "slot") move(s, picked);
    }
    setPicked(null);
  }

  // Drag with mouse or finger: a ghost follows the pointer and the spot under it on release gets the player.
  function down(e: React.PointerEvent, from: Spot, label: string, empty = false) {
    if (!edit) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { from, x: e.clientX, y: e.clientY, moved: false, label, empty };
  }
  function moveP(e: React.PointerEvent) {
    const d = drag.current;
    if (!d) return;
    // An empty spot can be tapped or dropped on, but there's nothing to drag.
    if (d.empty || (!d.moved && Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6)) return;
    d.moved = true;
    setGhost({ x: e.clientX, y: e.clientY, label: d.label });
  }
  function up(e: React.PointerEvent) {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    if (!d) return;
    if (!d.moved) return tap(d.from);
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest("[data-drop]") as HTMLElement | null;
    if (!el) return;
    const [kind, val] = (el.dataset.drop ?? "").split(":");
    if (kind === "slot") move(d.from, { kind: "slot", i: Number(val) });
    if (kind === "bench") move(d.from, { kind: "bench", id: val ?? "" });
    setPicked(null);
  }

  function setFormat(format: MatchFormat) {
    const formation = FORMATIONS[format][0].name;
    setDraft({ format, formation, slots: autoFill(format, formation, players, rate) });
  }
  function setFormation(name: string) {
    // Keep everyone in the same numbered spot; spots that no longer exist go to the bench.
    setDraft((d) => {
      const n = formationFor(d.format, name).slots.length;
      return { ...d, formation: name, slots: new Map([...d.slots].filter(([i]) => i < n)) };
    });
  }
  async function save(share = false) {
    setBusy(true);
    const slots = Object.fromEntries([...draft.slots].map(([i, id]) => [String(i), id]));
    const { error } = await supabase.rpc("save_team_lineup", { p_team: team.id, p_format: draft.format, p_formation: draft.formation, p_slots: slots, ...(share ? { p_notify: true } : {}) });
    setBusy(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, lineups: [...x.lineups.filter((l) => l.team_id !== team.id), { team_id: team.id, format: draft.format, formation: draft.formation, slots }] }));
    setEdit(false);
    setPicked(null);
    toast(share ? "Line-up saved and shared with the team" : "Line-up saved");
    if (share) pingPush();
  }

  const isPicked = (s: Spot) => !!picked && picked.kind === s.kind && (s.kind === "slot" ? (picked as { i: number }).i === s.i : (picked as { id: string }).id === s.id);
  const dot = (p: Player | undefined, pos: string) => {
    const r = p ? replyOf(p) : null;
    return (
      <span className={`sq-dot${pos === "GK" ? " gk" : ""}${!p ? " empty" : ""}${p && p.status !== "available" ? " out" : ""}${p && mine?.has(p.id) ? " mine" : ""}`}>
        {p ? (p.shirt_number ?? p.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")) : "+"}
        {p && r && !edit && (
          <i style={{ background: REPLY[r].bg, color: REPLY[r].c }} aria-hidden="true">
            {REPLY[r].t}
          </i>
        )}
      </span>
    );
  };

  if (savedOnly && !saved) return null;
  return (
    <section className={`sq-pitch-wrap${edit ? " editing" : ""}`} aria-label="Line-up">
      <div className="lu-bar">
        <span className="lu-name">
          <b>{f.name}</b> · {FORMAT_LABEL[view.format]}
        </span>
        {canEdit &&
          (edit ? (
            <span className="lu-acts">
              <button type="button" className="btn sm" onClick={() => (setEdit(false), setPicked(null))}>
                Cancel
              </button>
              <button type="button" className="btn sm" disabled={busy} onClick={() => save(false)}>
                Save
              </button>
              <button type="button" className="btn sm primary" disabled={busy} onClick={() => save(true)} title="Saves it and lets players and parents know">
                {busy ? "Saving…" : "Save & share"}
              </button>
            </span>
          ) : (
            <button type="button" className="btn sm" onClick={() => (setDraft(initial()), setEdit(true))}>
              Edit line-up
            </button>
          ))}
      </div>
      {edit && (
        <div className="lu-pick">
          <div className="lu-row" role="group" aria-label="Match size">
            {FORMATS.map((x) => (
              <button key={x} type="button" className="chip" aria-pressed={draft.format === x} onClick={() => setFormat(x)}>
                {x}-a-side
              </button>
            ))}
          </div>
          <div className="lu-row" role="group" aria-label="Formation">
            {FORMATIONS[draft.format].map((fm) => (
              <button key={fm.name} type="button" className="chip" aria-pressed={draft.formation === fm.name} onClick={() => setFormation(fm.name)}>
                {fm.name}
              </button>
            ))}
            <button type="button" className="chip lu-auto" onClick={() => setDraft((d) => ({ ...d, slots: autoFill(d.format, d.formation, players, rate) }))}>
              ✦ Auto-fill
            </button>
          </div>
          <p className="lu-help">Drag players into spots, or tap one player then another to swap them. Drag someone onto the bench to take them off.</p>
        </div>
      )}
      <div className="sq-pitch" onPointerMove={moveP} onPointerUp={up} onPointerCancel={() => ((drag.current = null), setGhost(null))}>
        <span className="sq-box top" />
        <span className="sq-box bot" />
        <span className="sq-half" />
        <span className="sq-circle" />
        {f.slots.map((s, i) => {
          const p = byId.get(view.slots.get(i) ?? "");
          const spot: Spot = { kind: "slot", i };
          const label = p ? `${s.pos}: ${p.full_name}` : `${s.pos}: empty`;
          return (
            <button
              key={i}
              type="button"
              className={`sq-tok${isPicked(spot) ? " picked" : ""}`}
              style={{ left: `${s.x}%`, top: `${s.y}%` }}
              data-drop={`slot:${i}`}
              aria-label={label}
              aria-pressed={edit ? isPicked(spot) : undefined}
              onPointerDown={(e) => down(e, spot, p ? String(p.shirt_number ?? p.full_name[0]) : s.pos, !p)}
              onPointerMove={moveP}
              onPointerUp={up}
              onClick={(e) => {
                if (edit) return e.preventDefault();
                if (p && (!family || mine!.has(p.id))) open({ kind: "player", id: p.id });
              }}
              disabled={!edit && !p}
            >
              {dot(p, s.pos)}
              <span className="sq-nm">{p ? p.full_name.split(" ")[0] : s.pos}</span>
            </button>
          );
        })}
        {ghost && (
          <span className="lu-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden="true">
            {ghost.label}
          </span>
        )}
      </div>
      <div className="sq-bench" data-drop="bench:">
        <b>Bench</b>
        <div className="sq-bench-list">
          {bench.map((p) => {
            const spot: Spot = { kind: "bench", id: p.id };
            return (
              <button
                key={p.id}
                type="button"
                className={`sq-bt${p.status !== "available" ? " out" : ""}${isPicked(spot) ? " picked" : ""}`}
                data-drop={`bench:${p.id}`}
                onPointerDown={(e) => down(e, spot, String(p.shirt_number ?? p.full_name[0]))}
                onPointerMove={moveP}
                onPointerUp={up}
                onClick={(e) => {
                  if (edit) return e.preventDefault();
                  if (!family || mine!.has(p.id)) open({ kind: "player", id: p.id });
                }}
                title={`${p.full_name} · ${STATUS[p.status]}`}
                aria-label={`${p.full_name}, ${STATUS[p.status]}${edit ? ", on the bench" : ""}`}
              >
                {p.shirt_number ?? p.full_name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("")}
                <i style={{ background: STATUS_COLOUR[p.status] }} />
              </button>
            );
          })}
          {!bench.length && <span className="sq-bench-note">Everyone&apos;s on the pitch</span>}
        </div>
      </div>
      {!edit && outOnPitch > 0 && (
        <p className="lu-warn">
          {outOnPitch} player{outOnPitch === 1 ? " in the line-up is" : "s in the line-up are"} injured or unavailable.
        </p>
      )}
      {!edit && day && (
        <p className="sq-legend">
          <span>
            <i style={{ background: REPLY.y.bg, color: REPLY.y.c }}>✓</i>coming {day}
          </span>
          <span>
            <i style={{ background: REPLY.n.bg, color: REPLY.n.c }}>✕</i>can&apos;t
          </span>
          <span>
            <i style={{ background: REPLY.q.bg, color: REPLY.q.c }}>?</i>no reply
          </span>
        </p>
      )}
    </section>
  );
}
