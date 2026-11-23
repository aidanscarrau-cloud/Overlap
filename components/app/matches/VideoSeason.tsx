"use client";

import { useApp } from "../AppProvider";
import { usePro } from "../Pro";
import { parseD } from "@/lib/format";
import { resultOf } from "@/lib/matches";
import type { Team } from "@/lib/types";

/* Season view of the automatic video stats (coaching staff only): one row per analysed match,
 * with the averages, so coaches can see trends (are we keeping the ball more? is the back line higher?). */

type Row = { id: string; date: string; opponent: string; score: string; res: string | null; poss: number; att: number | null; km: number | null; line: number | null };

export function VideoSeason({ team, from }: { team: Team; from: string }) {
  const { data, open } = useApp();
  const pro = usePro();
  const staff = ["admin", "coach", "assistant"].includes(data.role);
  if (!pro || !staff || !team.match_ai) return null;
  const matches = new Map(data.matches.filter((m) => m.team_id === team.id && m.date >= from).map((m) => [m.id, m]));
  const seen = new Set<string>();
  const rows: Row[] = [];
  for (const j of data.videoJobs) {
    const m = matches.get(j.match_id);
    if (!m || seen.has(m.id) || j.status !== "done" || j.our_team === null || !j.results?.teams?.length) continue;
    seen.add(m.id);
    const r = j.results;
    const t = r.mapping?.teams?.[j.our_team] ?? null;
    rows.push({
      id: m.id,
      date: m.date,
      opponent: m.opponent,
      score: m.our_score !== null && m.their_score !== null ? `${m.our_score}–${m.their_score}` : "",
      res: resultOf(m),
      poss: Math.round(r.possession.pct[j.our_team]),
      att: t?.ball_thirds ? Math.round(t.ball_thirds[2]) : null,
      km: t?.metres_per_min ? Math.round((t.metres_per_min * 90) / 100) / 10 : null,
      line: t?.defensive_line_m ? Math.round(t.defensive_line_m) : null,
    });
  }
  rows.sort((a, b) => a.date.localeCompare(b.date));
  const avg = (k: "poss" | "att" | "km" | "line", dp = 0) => {
    const v = rows.map((r) => r[k]).filter((x): x is number => x !== null);
    return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(dp) : "–";
  };
  const day = (d: string) => parseD(d).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

  return (
    <section className="in-card in-wide vsn">
      <div className="in-h">
        <h2>Match video trends 🔒</h2>
        <span className="muted" style={{ fontSize: 13 }}>
          {rows.length ? `${rows.length} match${rows.length === 1 ? "" : "es"} analysed` : "Coaching staff only"}
        </span>
      </div>
      {rows.length === 0 ? (
        <p className="md-muted">No analysed matches in this range yet. Open a played match, go to Review and add the video.</p>
      ) : (
        <>
          <div className="vsn-bars" role="img" aria-label={`Possession by match: ${rows.map((r) => `${r.opponent} ${r.poss}%`).join(", ")}`}>
            {rows.map((r) => (
              <button key={r.id} type="button" className="vsn-bar" onClick={() => open({ kind: "match", id: r.id })} title={`${r.opponent}: ${r.poss}% possession`}>
                <span className="vsn-fill" style={{ height: `${r.poss}px` }} />
                <b className="tnum">{r.poss}%</b>
                <small>{r.opponent.split(" ")[0]}</small>
              </button>
            ))}
          </div>
          <div className="vsn-table-wrap">
            <table className="vsn-table">
              <thead>
                <tr>
                  <th scope="col">Match</th>
                  <th scope="col">Possession</th>
                  <th scope="col" title="Share of the time the ball was in their third">Ball in their third</th>
                  <th scope="col" title="Estimated running per player over 90 minutes">Running</th>
                  <th scope="col" title="How far our back line usually was from our goal">Back line</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => open({ kind: "match", id: r.id })}>
                    <th scope="row">
                      <span className="muted tnum">{day(r.date)}</span> vs {r.opponent} {r.score && <span className={`res-badge ${r.res ?? ""}`}>{r.score}</span>}
                    </th>
                    <td className="tnum">{r.poss}%</td>
                    <td className="tnum">{r.att !== null ? `${r.att}%` : "–"}</td>
                    <td className="tnum">{r.km !== null ? `${r.km} km` : "–"}</td>
                    <td className="tnum">{r.line !== null ? `${r.line} m` : "–"}</td>
                  </tr>
                ))}
              </tbody>
              {rows.length > 1 && (
                <tfoot>
                  <tr>
                    <th scope="row">Average</th>
                    <td className="tnum">{avg("poss")}%</td>
                    <td className="tnum">{avg("att") === "–" ? "–" : `${avg("att")}%`}</td>
                    <td className="tnum">{avg("km", 1) === "–" ? "–" : `${avg("km", 1)} km`}</td>
                    <td className="tnum">{avg("line") === "–" ? "–" : `${avg("line")} m`}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
          <p className="in-foot">Estimates from match video. Running, thirds and back line appear once the pitch has been mapped for that match.</p>
        </>
      )}
    </section>
  );
}
