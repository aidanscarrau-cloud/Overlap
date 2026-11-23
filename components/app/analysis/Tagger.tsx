"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppProvider";
import { VideoPlayer, type PlayerHandle } from "./VideoPlayer";
import { Telestrator } from "./Telestrator";
import { Reel } from "./Reel";
import {
  EVENT_KINDS,
  RESERVED_KEYS,
  clock,
  eventsCsv,
  kindLabel,
  matchMinute,
  minuteNumber,
  parseSportscode,
  sportscodeXml,
  tally,
  xg,
  type Drawing,
  type EventKind,
  type MatchEvent,
  type Period,
  type VideoSource,
} from "@/lib/analysis";
import { errMsg } from "@/lib/format";
import type { Match, Player } from "@/lib/types";

/* The tagging screen (coaching staff only): play the match, press a key to tag what happened, type the
 * shirt number, tap where on the pitch; phases (press, build-up, counter) start and stop with one key.
 * Includes the match clock, drawings on frames, presentation mode, an xG match report and Sportscode XML. */

export const EV_COLS = "id,match_id,t,kind,team,player_id,shirt,x,y,outcome,routine,note,pre,post,created_at";
const EV_COLS_PRO = `${EV_COLS},t_end,title,drawing`;
const RATES = [0.25, 0.5, 1, 1.5, 2, 4];
const FRAME = 1 / 25;

export function useMatchSource(matchId: string) {
  const [source, setSource] = useState<VideoSource | null>(null);
  useEffect(() => {
    let dead = false;
    fetch("/api/match-video/source", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ match_id: matchId }) })
      .then((r) => r.json())
      .then((j: { ok?: boolean; source?: VideoSource; error?: string }) => !dead && setSource(j.ok && j.source ? j.source : { kind: "none", reason: j.error || "Couldn't find the video." }))
      .catch(() => !dead && setSource({ kind: "none", reason: "Couldn't reach Overlap. Check your connection." }));
    return () => {
      dead = true;
    };
  }, [matchId]);
  return source;
}

/** The team's own code window, or the standard one. */
export function useCodes(teamId: string) {
  const { supabase } = useApp();
  const [codes, setCodes] = useState<EventKind[]>(EVENT_KINDS);
  const [custom, setCustom] = useState(false);
  const load = useCallback(async () => {
    const { data } = await supabase.from("code_windows").select("buttons").eq("team_id", teamId).maybeSingle();
    const b = (data?.buttons ?? []) as EventKind[];
    setCodes(b.length ? b : EVENT_KINDS);
    setCustom(b.length > 0);
  }, [supabase, teamId]);
  useEffect(() => {
    load();
  }, [load]);
  return { codes, custom, reload: load };
}

/** Events for some matches; falls back to the columns from update 38 if update 39 hasn't run. */
export async function loadEvents(supabase: ReturnType<typeof useApp>["supabase"], matchIds: string[]) {
  if (!matchIds.length) return { rows: [] as MatchEvent[], pro: true };
  const withSource = await supabase.from("match_events").select(`${EV_COLS_PRO},source`).in("match_id", matchIds).order("t").limit(20000);
  if (!withSource.error || !/source/.test(withSource.error.message)) return { rows: (withSource.data ?? []) as MatchEvent[], pro: true, error: withSource.error };
  const r = await supabase.from("match_events").select(EV_COLS_PRO).in("match_id", matchIds).order("t").limit(20000);
  if (r.error && /t_end|title|drawing/.test(r.error.message)) {
    const old = await supabase.from("match_events").select(EV_COLS).in("match_id", matchIds).order("t").limit(20000);
    return { rows: (old.data ?? []) as MatchEvent[], pro: false, error: old.error };
  }
  return { rows: (r.data ?? []) as MatchEvent[], pro: true, error: r.error };
}

export function Tagger({ match, onClose }: { match: Match; onClose: () => void }) {
  const { data, squadOf, squad, supabase, toast } = useApp();
  const auto = useMatchSource(match.id);
  const [local, setLocal] = useState<string | null>(null);
  const source: VideoSource | null = local ? { kind: "mp4", url: local } : auto;
  const player = useRef<PlayerHandle>(null);
  const [now, setNow] = useState(0);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pro, setPro] = useState(true);
  const [team, setTeam] = useState<"us" | "them">("us");
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<{ kind: string; team: string; player: string; auto?: boolean }>({ kind: "", team: "", player: "" });
  const [side, setSide] = useState<"events" | "report">("events");
  const [rate, setRate] = useState(1);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [drawing, setDrawing] = useState<{ at: number } | null>(null);
  const [presenting, setPresenting] = useState<MatchEvent[] | null>(null);
  const digits = useRef<{ buf: string; at: number }>({ buf: "", at: 0 });
  const fileInput = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const xmlInput = useRef<HTMLInputElement>(null);
  const { codes } = useCodes(match.team_id);
  const byKey = useMemo(() => new Map(codes.map((c) => [c.key, c])), [codes]);
  const byHot = useMemo(() => new Map(codes.map((c) => [c.hotkey, c])), [codes]);
  const label = useCallback((k: string) => kindLabel(k, codes), [codes]);
  const teamName = data.teams.find((t) => t.id === match.team_id)?.name ?? "Us";

  const roster = useMemo(() => {
    const inSquad = squadOf(match.id).map((r) => data.players.find((p) => p.id === r.player_id)).filter((p): p is Player => !!p);
    return [...inSquad, ...squad(match.team_id).filter((p) => !inSquad.some((q) => q.id === p.id))];
  }, [data.players, squadOf, squad, match.id, match.team_id]);
  const nameOf = useCallback((id: string | null) => (id ? (data.players.find((p) => p.id === id)?.full_name ?? "") : ""), [data.players]);

  useEffect(() => {
    loadEvents(supabase, [match.id]).then(({ rows, pro, error }) => {
      if (error) toast(/match_events/.test(error.message) ? "Run update 38 in Supabase first." : errMsg(error));
      setEvents(rows);
      setPro(pro);
      setLoaded(true);
    });
    supabase
      .from("match_analysis")
      .select("periods")
      .eq("match_id", match.id)
      .maybeSingle()
      .then(({ data: row }) => setPeriods(((row?.periods ?? []) as Period[]) || []));
  }, [supabase, match.id, toast]);
  useEffect(() => () => void (local && URL.revokeObjectURL(local)), [local]);

  const selected = events.find((e) => e.id === sel) ?? null;
  const open = events.filter((e) => byKey.get(e.kind)?.phase && (e.t_end === null || e.t_end === undefined));
  const minute = (t: number) => matchMinute(t, periods);

  async function add(kind: string) {
    const k = byKey.get(kind) ?? { key: kind, label: kind, hotkey: "", group: "other" as const };
    const t = Math.round((player.current?.time() ?? 0) * 10) / 10;
    // A phase that's running stops when its key is pressed again.
    const running = k.phase ? open.find((e) => e.kind === kind && e.team === team) : undefined;
    if (running) {
      const tEnd = Math.max(running.t, t);
      await update(running.id, { t_end: tEnd });
      setSel(running.id);
      return;
    }
    const e: MatchEvent = {
      id: crypto.randomUUID(),
      match_id: match.id,
      t,
      kind,
      team,
      player_id: null,
      shirt: null,
      x: null,
      y: null,
      outcome: k.outcomes?.[0] ?? "",
      routine: "",
      note: "",
      pre: k.setPiece ? 3 : k.phase ? 2 : 6,
      post: k.setPiece ? 10 : k.phase ? 2 : 4,
      t_end: null,
      title: "",
      drawing: null,
      created_at: new Date().toISOString(),
    };
    if (k.phase && !pro) return toast("Phases need update 39 in Supabase.");
    setEvents((xs) => [...xs, e].sort((a, b) => a.t - b.t));
    setSel(e.id);
    digits.current = { buf: "", at: Date.now() };
    const { created_at, ...row } = e;
    void created_at;
    const ins = pro ? row : (({ t_end, title, drawing, ...r }) => (void t_end, void title, void drawing, r))(row);
    const { error } = await supabase.from("match_events").insert(ins);
    if (error) {
      setEvents((xs) => xs.filter((x) => x.id !== e.id));
      toast(/match_events/.test(error.message) ? "Run update 38 in Supabase first." : errMsg(error));
    }
  }
  const update = useCallback(
    async (id: string, p: Partial<MatchEvent>) => {
      // Any change by a coach confirms an auto-tag.
      if (events.find((x) => x.id === id)?.source === "auto" && p.source === undefined) p = { ...p, source: "" };
      setEvents((xs) => xs.map((x) => (x.id === id ? { ...x, ...p } : x)).sort((a, b) => a.t - b.t));
      const { error } = await supabase.from("match_events").update(p).eq("id", id);
      if (error) toast(/t_end|title|drawing/.test(error.message) ? "Run update 39 in Supabase first." : errMsg(error));
    },
    [supabase, toast, events],
  );
  const autoCount = events.filter((e) => e.source === "auto").length;
  async function confirmAll() {
    if (!window.confirm(`Keep all ${autoCount} auto-tags as they are?`)) return;
    setEvents((xs) => xs.map((x) => (x.source === "auto" ? { ...x, source: "" } : x)));
    const { error } = await supabase.from("match_events").update({ source: "" }).eq("match_id", match.id).eq("source", "auto");
    if (error) toast(errMsg(error));
  }
  async function removeAuto() {
    if (!window.confirm(`Delete the ${autoCount} auto-tags you haven't checked?`)) return;
    setEvents((xs) => xs.filter((x) => x.source !== "auto"));
    setSel(null);
    const { error } = await supabase.from("match_events").delete().eq("match_id", match.id).eq("source", "auto");
    if (error) toast(errMsg(error));
  }
  async function remove(id: string) {
    setEvents((xs) => xs.filter((x) => x.id !== id));
    if (sel === id) setSel(null);
    const { error } = await supabase.from("match_events").delete().eq("id", id);
    if (error) toast(errMsg(error));
  }
  const jump = (e: MatchEvent) => {
    player.current?.seek(e.t - e.pre);
    player.current?.play();
    setSel(e.id);
  };
  function setRateTo(r: number) {
    setRate(r);
    player.current?.rate(r);
  }
  /** Close any open menu (Match clock, More). */
  const closeMenus = () => document.querySelectorAll<HTMLDetailsElement>(".tg details[open]").forEach((d) => (d.open = false));
  async function markPeriod(idx: 0 | 1 | 2 | 3) {
    closeMenus();
    const defs = [
      { label: "1st half", base: 0 },
      { label: "2nd half", base: 45 },
      { label: "Extra time 1", base: 90 },
      { label: "Extra time 2", base: 105 },
    ];
    const t = Math.round((player.current?.time() ?? 0) * 10) / 10;
    const next = [...periods.filter((p) => p.label !== defs[idx].label), { ...defs[idx], start: t }].sort((a, b) => a.start - b.start);
    setPeriods(next);
    const { error } = await supabase.from("match_analysis").upsert({ match_id: match.id, periods: next }, { onConflict: "match_id" });
    if (error) toast(/match_analysis/.test(error.message) ? "Run update 39 in Supabase first." : errMsg(error));
    else toast(`${defs[idx].label} kicks off at ${clock(t)} in the video`);
  }

  // Keyboard: codes tag; digits give the shirt number; T team; Space play; arrows skip; [ ] speed; , . frame; Z undo.
  useEffect(() => {
    function onKey(ev: KeyboardEvent) {
      if (drawing || presenting) return;
      const el = ev.target as HTMLElement;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
      const key = ev.key.toLowerCase();
      const p = player.current;
      if (key === " ") {
        ev.preventDefault();
        p?.toggle();
      } else if (key === "arrowleft" || key === "arrowright") {
        ev.preventDefault();
        const d = (ev.shiftKey ? 1 : 5) * (key === "arrowleft" ? -1 : 1);
        p?.seek((p?.time() ?? 0) + d);
      } else if (key === "," || key === ".") {
        p?.pause();
        p?.seek((p?.time() ?? 0) + (key === "," ? -FRAME : FRAME));
      } else if (key === "[" || key === "]") {
        const i = RATES.indexOf(rate);
        setRateTo(RATES[Math.max(0, Math.min(RATES.length - 1, (i < 0 ? 2 : i) + (key === "[" ? -1 : 1)))]);
      } else if (key === "\\") setRateTo(1);
      else if (key === "t") setTeam((t) => (t === "us" ? "them" : "us"));
      else if (key === "z") {
        const last = [...events].sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        if (last) {
          remove(last.id);
          toast(`Removed ${label(last.kind)} at ${clock(last.t)}`);
        }
      } else if (/^[0-9]$/.test(key) && selected) {
        const d = digits.current;
        d.buf = Date.now() - d.at < 1500 ? (d.buf + key).slice(-2) : key;
        d.at = Date.now();
        const n = Number(d.buf);
        if (selected.team === "us") update(selected.id, { player_id: roster.find((x) => x.shirt_number === n)?.id ?? null, shirt: n });
        else update(selected.id, { shirt: n });
      } else if (byHot.has(key) && !RESERVED_KEYS.has(key)) {
        ev.preventDefault();
        add(byHot.get(key)!.key);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const shown = events.filter((e) => (!filter.auto || e.source === "auto") && (!filter.kind || e.kind === filter.kind) && (!filter.team || e.team === filter.team) && (!filter.player || e.player_id === filter.player));
  const { team: counts } = useMemo(() => tally(events), [events]);
  const sk = selected ? byKey.get(selected.kind) : undefined;

  function download(name: string, text: string, type: string) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = `${teamName} vs ${match.opponent} ${match.date} ${name}`.replace(/[^\w .-]/g, "");
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function importXml(file: File) {
    let inst;
    try {
      inst = parseSportscode(await file.text());
    } catch (e) {
      return toast(errMsg(e));
    }
    if (!inst.length) return toast("No instances found in that file.");
    if (!window.confirm(`Import ${inst.length} instances from Sportscode? They'll be added to this match's tags.`)) return;
    const findCode = (c: string) => codes.find((k) => k.label.toLowerCase() === c.toLowerCase() || k.key === c.toLowerCase());
    const rows = inst.slice(0, 5000).map((x) => {
      const k = findCode(x.code);
      const pName = x.labels.Player?.toLowerCase();
      const p = pName ? roster.find((r) => r.full_name.toLowerCase() === pName) : undefined;
      const teamLabel = (x.labels.Team ?? "").toLowerCase();
      const them = teamLabel && (teamLabel === match.opponent.toLowerCase() || teamLabel === "them" || teamLabel === "opposition");
      const dur = Math.max(0, x.end - x.start);
      return {
        id: crypto.randomUUID(),
        match_id: match.id,
        t: Math.round(x.start * 10) / 10,
        kind: (k?.key ?? x.code).slice(0, 60),
        team: them ? "them" : "us",
        player_id: p?.id ?? null,
        shirt: x.labels.Shirt && /^\d{1,2}$/.test(x.labels.Shirt) ? Number(x.labels.Shirt) : (p?.shirt_number ?? null),
        outcome: (x.labels.Outcome ?? "").slice(0, 40),
        routine: (x.labels.Routine ?? "").slice(0, 60),
        note: x.note.slice(0, 500),
        pre: 0,
        post: k?.phase ? 0 : Math.min(60, Math.round(dur * 10) / 10),
        ...(pro && k?.phase ? { t_end: Math.round(x.end * 10) / 10 } : {}),
      };
    });
    const { error } = await supabase.from("match_events").insert(rows);
    if (error) return toast(errMsg(error));
    const { rows: fresh } = await loadEvents(supabase, [match.id]);
    setEvents(fresh);
    toast(`Imported ${rows.length} instances`);
  }

  async function copyToPlayerStats() {
    const { players: per } = tally(events);
    if (!per.size) return toast("Tag some events with players first.");
    if (!window.confirm("Fill each player's shots, shots on target, key passes (chances created) and tackles (balls won) on the Review tab from these tags? Numbers you typed there will be replaced.")) return;
    const rows = [...per.entries()].map(([pid, m]) => ({ match_id: match.id, player_id: pid, shots: m.get("shot") ?? 0, on_target: m.get("shot_on") ?? 0, key_passes: m.get("chance") ?? 0, tackles: m.get("turnover_won") ?? 0 }));
    const { error } = await supabase.from("match_reviews").upsert(rows, { onConflict: "match_id,player_id" });
    toast(error ? errMsg(error) : `Player stats filled in for ${rows.length} player${rows.length === 1 ? "" : "s"}`);
  }

  if (presenting) return <Reel clips={presenting} codes={codes} periods={{ [match.id]: periods }} sources={source ? { [match.id]: source } : undefined} onClose={() => setPresenting(null)} title={`${teamName} vs ${match.opponent}`} />;

  return (
    <div className="tg">
      <header className="tg-head">
        <button className="linkbtn" type="button" onClick={onClose}>
          ← Matches
        </button>
        <h2>
          {teamName} vs {match.opponent}
        </h2>
        <span className="tg-tools">
          <button className="btn sm" type="button" onClick={() => fileInput.current?.click()}>
            Open video file…
          </button>
          <button className="btn sm" type="button" disabled={!shown.length} onClick={() => setPresenting(shown)}>
            Present {shown.length !== events.length ? "filtered" : "all"}
          </button>
          <details className="tg-more">
            <summary className="btn sm">More</summary>
            <div className="tg-menu">
              <button type="button" onClick={() => (closeMenus(), download("events.csv", eventsCsv(events, nameOf), "text/csv"))} disabled={!events.length}>
                Export CSV
              </button>
              <button type="button" onClick={() => (closeMenus(), download("sportscode.xml", sportscodeXml(events, label, nameOf, { us: teamName, them: match.opponent }), "application/xml"))} disabled={!events.length}>
                Export Sportscode XML
              </button>
              <button type="button" onClick={() => (closeMenus(), xmlInput.current?.click())}>
                Import Sportscode XML…
              </button>
              <button type="button" onClick={() => (closeMenus(), copyToPlayerStats())} disabled={!events.length}>
                Fill player stats from tags
              </button>
            </div>
          </details>
        </span>
        <input
          ref={fileInput}
          type="file"
          accept="video/*"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setLocal(URL.createObjectURL(f));
          }}
        />
        <input
          ref={xmlInput}
          type="file"
          accept=".xml,application/xml,text/xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) importXml(f);
          }}
        />
      </header>

      <div className="tg-grid">
        <div className="tg-main">
          <div className="tg-stage" ref={stageRef}>
            {source ? <VideoPlayer ref={player} source={source} onTime={setNow} /> : <div className="ap-player ap-none">Finding the video…</div>}
            {drawing && selected && (
              <div className="tg-draw">
                <Telestrator
                  initial={selected.drawing}
                  at={drawing.at}
                  onCancel={() => setDrawing(null)}
                  onSave={(d: Drawing) => {
                    update(selected.id, { drawing: d.shapes.length ? d : null });
                    setDrawing(null);
                    toast(d.shapes.length ? "Drawing saved: it'll show when the clip is played" : "Drawing removed");
                  }}
                />
              </div>
            )}
          </div>
          <div className="tg-bar">
            <span className="tg-now">
              <b className="tnum">{minute(now) ?? clock(now)}</b>
              {minute(now) && <small className="muted tnum">{clock(now)}</small>}
            </span>
            <div className="seg" role="group" aria-label="Which team (T)">
              <button type="button" aria-pressed={team === "us"} onClick={() => setTeam("us")}>
                {teamName}
              </button>
              <button type="button" aria-pressed={team === "them"} onClick={() => setTeam("them")}>
                {match.opponent}
              </button>
            </div>
            <label className="tg-rate">
              Speed
              <select value={rate} onChange={(e) => setRateTo(Number(e.target.value))} aria-label="Playback speed ([ and ])">
                {RATES.map((r) => (
                  <option key={r} value={r}>
                    {r}×
                  </option>
                ))}
              </select>
            </label>
            <details className="tg-more">
              <summary className="btn sm">Match clock</summary>
              <div className="tg-menu">
                <p className="muted">Pause the video on each kick-off, then:</p>
                {(["1st half", "2nd half", "Extra time 1", "Extra time 2"] as const).map((l, i) => (
                  <button key={l} type="button" onClick={() => markPeriod(i as 0 | 1 | 2 | 3)}>
                    {l} kicks off now
                    {periods.find((p) => p.label === l) ? ` (set: ${clock(periods.find((p) => p.label === l)!.start)})` : ""}
                  </button>
                ))}
              </div>
            </details>
            {open.length > 0 && (
              <span className="tg-rec" aria-live="polite">
                ● {open.map((e) => `${label(e.kind)} (${e.team === "us" ? teamName : match.opponent})`).join(", ")}: press the key again to stop
              </span>
            )}
          </div>
          <p className="muted tg-keys">Space play · ←→ 5 s (Shift 1 s) · , . frame · [ ] speed · T team · type shirt no. · Z undo</p>
          <div className="tg-buttons" role="group" aria-label="Tag an event">
            {codes.map((k) => (
              <button key={k.key} type="button" className={`tg-b ${k.group}${open.some((e) => e.kind === k.key && e.team === team) ? " rec" : ""}`} onClick={() => add(k.key)} title={`${k.label} (${k.hotkey.toUpperCase()})${k.phase ? ": press to start, again to stop" : ""}`}>
                <kbd>{k.hotkey.toUpperCase()}</kbd>
                {k.label}
                {k.phase && <small className="tg-ph">phase</small>}
              </button>
            ))}
          </div>

          {selected && (
            <section className="tg-edit" aria-label="The selected event">
              <div className="tg-edit-head">
                <b>
                  {label(selected.kind)} · {minute(selected.t) ?? clock(selected.t)}
                  {selected.t_end != null && ` → ${minute(selected.t_end) ?? clock(selected.t_end)} (${Math.round(selected.t_end - selected.t)} s)`}
                </b>
                <span className={`tg-team ${selected.team}`}>{selected.team === "us" ? teamName : match.opponent}</span>
                {pro && (
                  <button
                    className="btn sm"
                    type="button"
                    onClick={() => {
                      closeMenus();
                      player.current?.pause();
                      setDrawing({ at: Math.round((player.current?.time() ?? selected.t) * 10) / 10 });
                      // The video may be scrolled off screen: bring it into view to draw on.
                      stageRef.current?.scrollIntoView({ block: "start" });
                    }}
                  >
                    {selected.drawing ? "Edit drawing" : "Draw on this frame"}
                  </button>
                )}
                {selected.source === "auto" && (
                  <button className="btn small primary" type="button" onClick={() => update(selected.id, { source: "" })} title="Keep this auto-tag (changing anything also keeps it)">
                    Looks right
                  </button>
                )}
                <button className="linkbtn" type="button" onClick={() => remove(selected.id)}>
                  Delete
                </button>
              </div>
              <div className="tg-edit-grid">
                <div className="field">
                  <span>{selected.team === "us" ? "Player (or type their number)" : "Their shirt number"}</span>
                  {selected.team === "us" ? (
                    <select className="input" value={selected.player_id ?? ""} onChange={(e) => update(selected.id, { player_id: e.target.value || null, shirt: roster.find((p) => p.id === e.target.value)?.shirt_number ?? null })}>
                      <option value="">No one in particular</option>
                      {roster.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.shirt_number !== null ? `${p.shirt_number} · ` : ""}
                          {p.full_name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input className="input" inputMode="numeric" value={selected.shirt ?? ""} onChange={(e) => update(selected.id, { shirt: e.target.value ? Math.min(99, Number(e.target.value.replace(/\D/g, ""))) : null })} placeholder="e.g. 9" />
                  )}
                </div>
                {sk?.outcomes && (
                  <div className="field">
                    <span>Outcome</span>
                    <div className="tg-chips">
                      {sk.outcomes.map((o) => (
                        <button key={o} type="button" aria-pressed={selected.outcome === o} onClick={() => update(selected.id, { outcome: o })}>
                          {o}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {sk?.setPiece && (
                  <label className="field">
                    <span>Routine (for the set-piece library)</span>
                    <input className="input" maxLength={60} list="tg-routines" value={selected.routine} onChange={(e) => update(selected.id, { routine: e.target.value })} placeholder="e.g. Near-post flick" />
                    <datalist id="tg-routines">
                      {[...new Set(events.map((e) => e.routine).filter(Boolean))].map((r) => (
                        <option key={r} value={r} />
                      ))}
                    </datalist>
                  </label>
                )}
                {pro && (
                  <label className="field">
                    <span>Clip title (shown when presenting)</span>
                    <input className="input" maxLength={120} value={selected.title ?? ""} onChange={(e) => update(selected.id, { title: e.target.value })} placeholder="e.g. Our trigger to press their 6" />
                  </label>
                )}
                <label className="field">
                  <span>Note</span>
                  <input className="input" maxLength={500} value={selected.note} onChange={(e) => update(selected.id, { note: e.target.value })} placeholder="What to show the players" />
                </label>
                <div className="field">
                  <span>Clip: seconds before / after</span>
                  <div className="mr-inline">
                    <input className="input" type="number" min={0} max={60} value={selected.pre} onChange={(e) => update(selected.id, { pre: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} aria-label="Seconds before" />
                    <input className="input" type="number" min={0} max={60} value={selected.post} onChange={(e) => update(selected.id, { post: Math.max(0, Math.min(60, Number(e.target.value) || 0)) })} aria-label="Seconds after" />
                  </div>
                </div>
              </div>
              <div className="field">
                <span>Where on the pitch (tap; {teamName} attacking →)</span>
                <MiniPitch x={selected.x} y={selected.y} onPick={(x, y) => update(selected.id, { x, y })} dots={events.filter((e) => e.kind === selected.kind && e.x !== null && e.id !== selected.id).map((e) => ({ x: e.x, y: e.y, team: e.team }))} />
                {xg(selected) !== null && <small className="muted">xG {xg(selected)!.toFixed(2)} (simple location model)</small>}
              </div>
            </section>
          )}
        </div>

        <aside className="tg-side">
          <div className="seg" role="tablist" aria-label="Side panel">
            <button type="button" role="tab" aria-pressed={side === "events"} onClick={() => setSide("events")}>
              Events
            </button>
            <button type="button" role="tab" aria-pressed={side === "report"} onClick={() => setSide("report")}>
              Match report
            </button>
          </div>
          {side === "report" ? (
            <MatchReport events={events} periods={periods} teamName={teamName} opponent={match.opponent} onPlay={(c) => setPresenting(c)} />
          ) : (
            <>
              <div className="tg-stats" aria-label="Tagged so far">
                <div className="tg-stats-h">
                  <span />
                  <b>{teamName}</b>
                  <b>{match.opponent}</b>
                </div>
                {[
                  ["goal", "Goals"],
                  ["shot", "Shots"],
                  ["shot_on", "On target"],
                  ["chance", "Chances"],
                  ["box_entry", "Box entries"],
                  ["turnover_won", "Balls won"],
                  ["turnover_lost", "Balls lost"],
                  ["corner", "Corners"],
                ].map(([k, l]) => (
                  <div key={k} className="tg-stats-r">
                    <span>{l}</span>
                    <b className="tnum">{counts.us.get(k) ?? 0}</b>
                    <b className="tnum">{counts.them.get(k) ?? 0}</b>
                  </div>
                ))}
              </div>
              <div className="tg-filter">
                <select className="input" value={filter.kind} onChange={(e) => setFilter((f) => ({ ...f, kind: e.target.value }))} aria-label="Show event type">
                  <option value="">All events</option>
                  {[...new Set([...codes.map((c) => c.key), ...events.map((e) => e.kind)])].map((k) => (
                    <option key={k} value={k}>
                      {label(k)}
                    </option>
                  ))}
                </select>
                <select className="input" value={filter.team} onChange={(e) => setFilter((f) => ({ ...f, team: e.target.value }))} aria-label="Show team">
                  <option value="">Both teams</option>
                  <option value="us">{teamName}</option>
                  <option value="them">{match.opponent}</option>
                </select>
                <select className="input" value={filter.player} onChange={(e) => setFilter((f) => ({ ...f, player: e.target.value }))} aria-label="Show player">
                  <option value="">Any player</option>
                  {roster.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.full_name}
                    </option>
                  ))}
                </select>
              </div>
              {autoCount > 0 && (
                <div className="tg-auto">
                  <p>
                    <b>{autoCount} auto-tags to check.</b> Overlap tagged these from the tracking. Click one to watch it, then keep it, fix it or delete it.
                  </p>
                  <div className="tg-auto-a">
                    <button className="linkbtn" type="button" aria-pressed={!!filter.auto} onClick={() => setFilter((f) => ({ ...f, auto: !f.auto }))}>
                      {filter.auto ? "Show all tags" : "Show only these"}
                    </button>
                    <button className="linkbtn" type="button" onClick={confirmAll}>
                      Keep all
                    </button>
                    <button className="linkbtn" type="button" onClick={removeAuto}>
                      Delete unchecked
                    </button>
                  </div>
                </div>
              )}
              <ol className="tg-list" aria-label="Tagged events">
                {!loaded && <li className="muted">Loading…</li>}
                {loaded && !shown.length && <li className="muted">{events.length ? "Nothing matches these filters." : "No tags yet. Play the video and press a key."}</li>}
                {shown.map((e) => (
                  <li key={e.id} className={e.id === sel ? "on" : ""}>
                    <button type="button" onClick={() => jump(e)}>
                      <span className="tnum tg-t">{minute(e.t) ?? clock(e.t)}</span>
                      <span className={`tg-dot ${e.team}`} aria-hidden="true" />
                      <span className="tg-what">
                        <b>
                          {e.title || label(e.kind)}
                          {e.drawing ? " ✏️" : ""}
                          {e.source === "auto" && <span className="tg-autob">Auto</span>}
                          {e.t_end != null ? ` · ${Math.round(e.t_end - e.t)} s` : byKey.get(e.kind)?.phase ? " · ● running" : ""}
                        </b>
                        <small className="muted">
                          {[e.team === "us" ? nameOf(e.player_id) || (e.shirt !== null ? `#${e.shirt}` : "") : e.shirt !== null ? `${match.opponent} #${e.shirt}` : match.opponent, e.outcome, e.routine, xg(e) !== null ? `xG ${xg(e)!.toFixed(2)}` : ""].filter(Boolean).join(" · ")}
                        </small>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="muted tg-foot">
                {events.length} tag{events.length === 1 ? "" : "s"}. Coaching staff only.
                {!pro && " Run update 39 for phases, drawings and clip titles."}
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- the match report */

function MatchReport({ events, periods, teamName, opponent, onPlay }: { events: MatchEvent[]; periods: Period[]; teamName: string; opponent: string; onPlay: (c: MatchEvent[]) => void }) {
  const shots = events.filter((e) => xg(e) !== null);
  const sum = (side: "us" | "them") => shots.filter((e) => e.team === side).reduce((a, e) => a + (xg(e) ?? 0), 0);
  const goals = (side: "us" | "them") => events.filter((e) => e.kind === "goal" && e.team === side).length;
  const n = (side: "us" | "them", k: string) => events.filter((e) => e.team === side && e.kind === k).length;
  const ft = n("us", "final_third") + n("them", "final_third");
  const tilt = ft ? Math.round((100 * n("us", "final_third")) / ft) : null;
  const counters = events.filter((e) => e.kind === "counter" && e.team === "us");
  const presses = events.filter((e) => e.kind === "press" && e.team === "us");
  const pct = (xs: MatchEvent[], ok: string[]) => (xs.length ? Math.round((100 * xs.filter((e) => ok.includes(e.outcome)).length) / xs.length) : null);

  // xG flow: cumulative xG against match minute (or video minutes if the clock isn't set).
  const at = (e: MatchEvent) => minuteNumber(e.t, periods) ?? e.t / 60;
  const end = Math.max(90, ...shots.map(at), 1);
  const W = 300,
    H = 120;
  const line = (side: "us" | "them") => {
    let c = 0;
    const pts: [number, number][] = [[0, 0]];
    shots
      .filter((e) => e.team === side)
      .sort((a, b) => at(a) - at(b))
      .forEach((e) => {
        pts.push([at(e), c]);
        c += xg(e) ?? 0;
        pts.push([at(e), c]);
      });
    pts.push([end, c]);
    return pts;
  };
  const maxY = Math.max(1, sum("us"), sum("them"));
  const path = (pts: [number, number][]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${((x / end) * W).toFixed(1)},${(H - (y / maxY) * H).toFixed(1)}`).join(" ");

  return (
    <div className="tg-report">
      <div className="tg-xg">
        <div>
          <small className="muted">{teamName}</small>
          <b className="tnum">{sum("us").toFixed(2)}</b>
          <small>xG · {goals("us")} goals</small>
        </div>
        <div>
          <small className="muted">{opponent}</small>
          <b className="tnum">{sum("them").toFixed(2)}</b>
          <small>xG · {goals("them")} goals</small>
        </div>
      </div>
      <figure className="tg-fig">
        <figcaption className="muted">Shot map (dot size = xG; {teamName} attacking →)</figcaption>
        <MiniPitch x={null} y={null} dots={shots.map((e) => ({ x: e.x, y: e.y, team: e.team, r: 1 + 5 * (xg(e) ?? 0), goal: e.kind === "goal" }))} />
      </figure>
      <figure className="tg-fig">
        <figcaption className="muted">xG flow{periods.length ? " by match minute" : " (set the match clock for minutes)"}</figcaption>
        <svg viewBox={`-4 -4 ${W + 8} ${H + 20}`} className="tg-flow" role="img" aria-label={`xG flow: ${teamName} ${sum("us").toFixed(2)}, ${opponent} ${sum("them").toFixed(2)}`}>
          <line x1={0} y1={H} x2={W} y2={H} className="tg-axis" />
          {periods.length > 0 && <line x1={(45 / end) * W} y1={0} x2={(45 / end) * W} y2={H} className="tg-axis dash" />}
          <path d={path(line("them"))} className="tg-l them" />
          <path d={path(line("us"))} className="tg-l us" />
          <text x={0} y={H + 14} className="tg-ax">0&apos;</text>
          <text x={W} y={H + 14} textAnchor="end" className="tg-ax">
            {Math.round(end)}&apos;
          </text>
        </svg>
      </figure>
      <dl className="pm-facts">
        {tilt !== null && (
          <div>
            <dt>Field tilt</dt>
            <dd>
              <b className="tnum">{tilt}%</b> of final-third entries were ours
            </dd>
          </div>
        )}
        <div>
          <dt>Box entries</dt>
          <dd>
            <b className="tnum">{n("us", "box_entry")}</b> vs {n("them", "box_entry")}
          </dd>
        </div>
        {counters.length > 0 && (
          <div>
            <dt>Counters</dt>
            <dd>
              <b className="tnum">{counters.length}</b>, {pct(counters, ["shot", "box entry"])}% reached a shot or the box{" "}
              <button className="linkbtn" type="button" onClick={() => onPlay(counters)}>
                watch
              </button>
            </dd>
          </div>
        )}
        {presses.length > 0 && (
          <div>
            <dt>High press</dt>
            <dd>
              <b className="tnum">{presses.length}</b>, {pct(presses, ["won it"])}% won the ball{" "}
              <button className="linkbtn" type="button" onClick={() => onPlay(presses)}>
                watch
              </button>
            </dd>
          </div>
        )}
      </dl>
      {shots.length > 0 && (
        <button className="btn sm" type="button" onClick={() => onPlay([...shots].sort((a, b) => (xg(b) ?? 0) - (xg(a) ?? 0)))} style={{ justifySelf: "start" }}>
          Watch the chances, best first
        </button>
      )}
      <p className="muted" style={{ margin: 0, fontSize: 12 }}>
        xG here is a simple location model (distance and angle) tagged by hand: a guide for coaching, not a data-provider figure. Shots need a pitch location for xG.
      </p>
    </div>
  );
}

/* ---------------------------------------------------------------- mini pitch */

/** A small pitch, attacking left to right. Tap to set where an event happened. */
export function MiniPitch({ x, y, onPick, dots = [] }: { x: number | null; y: number | null; onPick?: (x: number, y: number) => void; dots?: { x: number | null; y: number | null; team?: string; r?: number; goal?: boolean }[] }) {
  const W = 105,
    H = 68;
  return (
    <svg
      className="tg-pitch"
      viewBox={`-2 -2 ${W + 4} ${H + 4}`}
      role={onPick ? "button" : "img"}
      aria-label="Pitch"
      onClick={(e) => {
        if (!onPick) return;
        const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
        const px = ((e.clientX - r.left) / r.width) * (W + 4) - 2;
        const py = ((e.clientY - r.top) / r.height) * (H + 4) - 2;
        onPick(Math.round(Math.min(100, Math.max(0, (px / W) * 100))), Math.round(Math.min(100, Math.max(0, (py / H) * 100))));
      }}
    >
      <rect x={0} y={0} width={W} height={H} className="pm-grass" />
      <g className="pm-lines">
        <rect x={0} y={0} width={W} height={H} />
        <line x1={W / 2} y1={0} x2={W / 2} y2={H} />
        <circle cx={W / 2} cy={H / 2} r={9.15} />
        <rect x={0} y={H / 2 - 20.16} width={16.5} height={40.32} />
        <rect x={W - 16.5} y={H / 2 - 20.16} width={16.5} height={40.32} />
        <line x1={W / 3} y1={0} x2={W / 3} y2={H} strokeDasharray="1.5 1.5" />
        <line x1={(2 * W) / 3} y1={0} x2={(2 * W) / 3} y2={H} strokeDasharray="1.5 1.5" />
      </g>
      {dots.map((d, i) =>
        d.x !== null && d.y !== null ? <circle key={i} cx={(d.x / 100) * W} cy={(d.y / 100) * H} r={d.r ?? 1.4} className={`tg-pd ${d.team ?? ""}${d.goal ? " goal" : ""}`} /> : null,
      )}
      {x !== null && y !== null && <circle cx={(x / 100) * W} cy={(y / 100) * H} r={2.4} className="tg-pin" />}
    </svg>
  );
}
