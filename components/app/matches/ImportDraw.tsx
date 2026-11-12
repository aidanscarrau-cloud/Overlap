"use client";

import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { SheetFrame } from "../sheets/SheetFrame";
import { pingPush } from "@/lib/push-client";
import { COL_LABEL, buildRows, guessColumns, norm, parseTable, teamNames, type ColType, type DrawRow } from "@/lib/draw-import";
import { DEFAULT_LENGTH, FORMAT_LABEL } from "@/lib/formations";
import { HA_LABEL } from "@/lib/matches";
import { errMsg, parseD } from "@/lib/format";
import type { MatchFormat } from "@/lib/types";

const shortDate = (d: string) => (d ? parseD(d).toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" }) : "?");

/** Paste or upload a competition draw, check it, and add (or update) this team's matches. */
export function ImportDraw() {
  const { data, team, matchesOf, supabase, refresh, close, toast } = useApp();
  const [text, setText] = useState("");
  const [types, setTypes] = useState<ColType[] | null>(null);
  const [ours, setOurs] = useState("");
  const [format, setFormat] = useState<MatchFormat>("11");
  const [rows, setRows] = useState<DrawRow[]>([]);
  const [busy, setBusy] = useState(false);

  const grid = useMemo(() => parseTable(text), [text]);
  const guess = useMemo(() => guessColumns(grid), [grid]);
  const cols = types && types.length === (grid[0]?.length ?? 0) ? types : guess.types;
  const names = useMemo(() => teamNames(guess.header ? grid.slice(1) : grid, cols), [grid, cols, guess.header]);
  const needsTeam = cols.includes("home") || cols.includes("away") || cols.includes("teams");
  // Guess our team: a name that looks like the club's, else the most frequent one.
  const clubWords = norm(data.club.name).split(" ").filter((w) => w.length > 3 && !["football", "club", "soccer", "united"].includes(w));
  const autoOurs = names.find((n) => clubWords.some((w) => norm(n).includes(w))) ?? names[0] ?? "";
  const ourName = ours || autoOurs;

  const existing = team ? matchesOf(team.id) : [];
  const byRef = new Map(existing.filter((m) => m.external_ref).map((m) => [m.external_ref!, m]));
  const sameDay = (r: DrawRow) => existing.find((m) => !m.external_ref && m.date === r.date && norm(m.opponent) === norm(r.opponent));

  function preview() {
    const built = buildRows(grid, cols, guess.header, ourName);
    setRows(built.map((r) => ({ ...r, include: r.include && !sameDay(r) })));
    if (!built.length) toast(needsTeam ? `No matches found for "${ourName}". Check the team name and the columns.` : "No matches found. Check the columns.");
  }

  async function importNow() {
    const chosen = rows.filter((r) => r.include && r.date);
    if (!chosen.length || !team) return;
    setBusy(true);
    const { data: res, error } = await supabase.rpc("import_matches", {
      p_team: team.id,
      p_rows: chosen.map((r) => ({ ref: r.ref, date: r.date, kickoff: r.kickoff, opponent: r.opponent, home_away: r.home_away, venue: r.venue, competition: r.competition, round: r.round })),
      p_format: format,
      p_length: DEFAULT_LENGTH[format],
    });
    setBusy(false);
    if (error) return toast(errMsg(error));
    pingPush();
    const r = res as { added: number; changed: number };
    toast(`${r.added} match${r.added === 1 ? "" : "es"} added${r.changed ? `, ${r.changed} updated` : ""}`);
    close();
    refresh();
  }

  async function readFile(f: File) {
    if (/\.xlsx?$/i.test(f.name)) return toast("Save the spreadsheet as CSV first (File, Save as, CSV), or copy the rows and paste them here.");
    setText(await f.text());
    setTypes(null);
    setRows([]);
  }

  return (
    <SheetFrame title={`Import a draw${team ? ` for ${team.name}` : ""}`}>
      <div className="import">
        <section className="import-step">
          <h3>1. Paste the draw</h3>
          <p className="muted">
            Copy the fixtures from your competition&apos;s website or app, or from a spreadsheet (select the rows, copy, paste). It can be the whole competition: only {team?.name ?? "your team"}&apos;s games are kept.
          </p>
          <textarea
            className="input"
            id="draw-text"
            rows={6}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setTypes(null);
              setRows([]);
            }}
            placeholder={"Round  Date  Time  Home  Away  Venue\n1  5/4/2027  9:00am  Harbour City U12  Rovers U12  Harbour Park"}
          />
          <label className="btn sm" style={{ justifySelf: "start" }}>
            Or choose a CSV file
            <input type="file" accept=".csv,.txt,.tsv,text/csv,text/plain" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0])} />
          </label>
        </section>

        {grid.length > 0 && (
          <section className="import-step">
            <h3>2. Check what each column is</h3>
            <div className="import-grid-wrap">
              <table className="import-grid">
                <thead>
                  <tr>
                    {cols.map((t, i) => (
                      <th key={i}>
                        <select
                          className="input"
                          aria-label={`Column ${i + 1}`}
                          value={t}
                          onChange={(e) => {
                            const next = [...cols];
                            next[i] = e.target.value as ColType;
                            setTypes(next);
                            setRows([]);
                          }}
                        >
                          {(Object.keys(COL_LABEL) as ColType[]).map((k) => (
                            <option key={k} value={k}>
                              {COL_LABEL[k]}
                            </option>
                          ))}
                        </select>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {grid.slice(0, 4).map((r, i) => (
                    <tr key={i} className={i === 0 && guess.header ? "is-header" : undefined}>
                      {r.map((c, j) => (
                        <td key={j}>{c}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row2">
              {needsTeam && (
                <label className="field">
                  <span>Your team in this draw</span>
                  <select className="input" id="draw-ours" value={ourName} onChange={(e) => (setOurs(e.target.value), setRows([]))}>
                    {names.map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="field">
                <span>Match size</span>
                <select className="input" id="draw-format" value={format} onChange={(e) => setFormat(e.target.value as MatchFormat)}>
                  {(["11", "9", "7", "5"] as MatchFormat[]).map((f) => (
                    <option key={f} value={f}>
                      {FORMAT_LABEL[f]} ({DEFAULT_LENGTH[f]} min)
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="button" className="btn primary" style={{ justifySelf: "start" }} onClick={preview}>
              Find {team?.name ?? "our"} matches
            </button>
          </section>
        )}

        {rows.length > 0 && (
          <section className="import-step">
            <h3>3. Choose the matches to add</h3>
            <ul className="import-rows">
              {rows.map((r, i) => {
                const update = byRef.get(r.ref);
                const dup = !update && sameDay(r);
                return (
                  <li key={i} data-off={!r.include || undefined}>
                    <label>
                      <input
                        type="checkbox"
                        checked={r.include}
                        disabled={!r.date}
                        onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, include: e.target.checked } : y)))}
                      />
                      <span>
                        <b>
                          {r.round && `R${r.round} · `}
                          {shortDate(r.date)}
                          {r.kickoff && `, ${r.kickoff}`}
                        </b>{" "}
                        vs {r.opponent} <span className="muted">({HA_LABEL[r.home_away].toLowerCase()})</span>
                        {r.venue && <small>{r.venue}</small>}
                        {r.problem && <small className="bad-text">{r.problem}</small>}
                        {update && <small>Already added: will be updated if anything changed</small>}
                        {dup && <small>Looks like a match you already have, so it&apos;s unticked</small>}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <div className="sheet-actions">
              <span className="muted" style={{ marginRight: "auto", fontSize: 13 }}>
                Everyone in the team gets one notification about the draw.
              </span>
              <button type="button" className="btn primary" disabled={busy || !rows.some((r) => r.include)} onClick={importNow}>
                {busy ? "Importing…" : `Add ${rows.filter((r) => r.include).length} matches`}
              </button>
            </div>
          </section>
        )}
      </div>
    </SheetFrame>
  );
}
