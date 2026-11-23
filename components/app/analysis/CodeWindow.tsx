"use client";

import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { useCodes } from "./Tagger";
import { EVENT_KINDS, RESERVED_KEYS, type EventKind } from "@/lib/analysis";
import { errMsg } from "@/lib/format";
import type { Team } from "@/lib/types";

/* Each team's own code window: the buttons on the tagging screen, their keyboard keys, outcomes, and
 * whether they're a set piece or a phase (press to start, again to stop). Coaching staff only. */

type Row = EventKind & { outcomesText: string };
const GROUPS: { key: EventKind["group"]; label: string }[] = [
  { key: "attack", label: "Attack" },
  { key: "defend", label: "Defend" },
  { key: "set", label: "Set piece" },
  { key: "phase", label: "Phase" },
  { key: "other", label: "Other" },
];
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "code";

export function CodeWindow({ team }: { team: Team }) {
  const { supabase, toast } = useApp();
  const { codes, custom, reload } = useCodes(team.id);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => setRows(codes.map((c) => ({ ...c, outcomesText: (c.outcomes ?? []).join(", ") }))), [codes]);

  const set = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const n = [...rs];
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });

  const problems: string[] = [];
  const hot = rows.map((r) => r.hotkey.toLowerCase());
  rows.forEach((r, i) => {
    if (!r.label.trim()) problems.push(`Button ${i + 1} needs a name.`);
    if (!/^[a-z]$/.test(r.hotkey.toLowerCase())) problems.push(`"${r.label || `Button ${i + 1}`}" needs a single letter key.`);
    else if (RESERVED_KEYS.has(r.hotkey.toLowerCase())) problems.push(`"${r.label}": ${r.hotkey.toUpperCase()} is kept for the tagging screen (T team, Z undo).`);
    else if (hot.indexOf(r.hotkey.toLowerCase()) !== i) problems.push(`"${r.label}": ${r.hotkey.toUpperCase()} is already used.`);
  });

  async function save() {
    if (problems.length) return toast(problems[0]);
    setBusy(true);
    const used = new Set<string>();
    const buttons: EventKind[] = rows.map((r) => {
      // Keep the standard keys (so existing tags and stats still line up); new buttons get one from their name.
      let key = r.key || slug(r.label);
      while (used.has(key)) key = `${key}_2`;
      used.add(key);
      const outcomes = r.outcomesText
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 8)
        .map((x) => x.slice(0, 40));
      return { key, label: r.label.trim().slice(0, 40), hotkey: r.hotkey.toLowerCase(), group: r.group, ...(outcomes.length ? { outcomes } : {}), ...(r.setPiece ? { setPiece: true } : {}), ...(r.phase ? { phase: true } : {}) };
    });
    const { error } = await supabase.from("code_windows").upsert({ team_id: team.id, buttons }, { onConflict: "team_id" });
    setBusy(false);
    if (error) return toast(/code_windows/.test(error.message) ? "Run update 39 in Supabase first." : errMsg(error));
    toast("Code window saved");
    reload();
  }
  async function reset() {
    if (!window.confirm("Go back to Overlap's standard code window? Your tags stay.")) return;
    await supabase.from("code_windows").delete().eq("team_id", team.id);
    reload();
    toast("Back to the standard code window");
  }
  const free = "abcdefghijklmnopqrsuvwxy".split("").find((c) => !hot.includes(c)) ?? "";

  return (
    <section className="in-card cw">
      <div className="in-h">
        <h2>Code window for {team.name}</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {custom ? "Your own buttons" : "Overlap's standard buttons"}
        </span>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13.5 }}>
        Set up the buttons your analysts tag with. Each needs its own letter key (T, Z and the number keys are kept for the tagging screen). A <b>phase</b> has a start and an end: press its key once to start it and again to stop.
      </p>
      <div className="cw-table-wrap">
        <table className="cw-table">
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Button</th>
              <th scope="col">Group</th>
              <th scope="col">Outcomes (comma separated)</th>
              <th scope="col">Set piece</th>
              <th scope="col">Phase</th>
              <th scope="col" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i}>
                <td>
                  <input className="input cw-key" maxLength={1} value={r.hotkey.toUpperCase()} onChange={(e) => set(i, { hotkey: e.target.value.toLowerCase() })} aria-label={`Key for ${r.label}`} />
                </td>
                <td>
                  <input className="input" maxLength={40} value={r.label} onChange={(e) => set(i, { label: e.target.value })} aria-label="Button name" />
                </td>
                <td>
                  <select className="input" value={r.group} onChange={(e) => set(i, { group: e.target.value as EventKind["group"], ...(e.target.value === "phase" ? { phase: true } : {}) })} aria-label="Group">
                    {GROUPS.map((g) => (
                      <option key={g.key} value={g.key}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <input className="input" maxLength={300} value={r.outcomesText} onChange={(e) => set(i, { outcomesText: e.target.value })} placeholder="e.g. won, lost" aria-label="Outcomes" />
                </td>
                <td>
                  <input type="checkbox" checked={!!r.setPiece} onChange={(e) => set(i, { setPiece: e.target.checked })} aria-label="Set piece" />
                </td>
                <td>
                  <input type="checkbox" checked={!!r.phase} onChange={(e) => set(i, { phase: e.target.checked })} aria-label="Phase" />
                </td>
                <td className="cw-acts">
                  <button className="icon-btn" type="button" onClick={() => move(i, -1)} aria-label="Move up" disabled={i === 0}>
                    ↑
                  </button>
                  <button className="icon-btn" type="button" onClick={() => move(i, 1)} aria-label="Move down" disabled={i === rows.length - 1}>
                    ↓
                  </button>
                  <button className="icon-btn" type="button" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))} aria-label={`Remove ${r.label}`}>
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {problems.length > 0 && <p className="notice bad">{problems[0]}</p>}
      <div className="sheet-actions">
        <button className="linkbtn" type="button" disabled={rows.length >= 40} onClick={() => setRows((rs) => [...rs, { key: "", label: "", hotkey: free, group: "attack", outcomesText: "" }])}>
          + Add a button
        </button>
        {custom && (
          <button className="linkbtn" type="button" onClick={reset}>
            Back to standard
          </button>
        )}
        <span className="spacer" />
        <button className="btn primary" type="button" disabled={busy || problems.length > 0} onClick={save}>
          {busy ? "Saving…" : "Save code window"}
        </button>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 12.5 }}>
        Overlap&apos;s match report and player stats read the standard buttons ({EVENT_KINDS.slice(0, 6).map((k) => k.label).join(", ")}…). Renaming them is fine; your own extra buttons appear in the event list, playlists, CSV and Sportscode exports.
      </p>
    </section>
  );
}
