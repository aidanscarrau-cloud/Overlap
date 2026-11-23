"use client";

import { useMemo, useState } from "react";
import { useApp } from "../AppProvider";
import { errMsg } from "@/lib/format";
import type { Match, Player, VideoJob } from "@/lib/types";

/* Player-by-player stats from match video (coaching staff only). The worker reads shirt numbers;
 * here the coach confirms which squad player wore each number. Overlap suggests the match from the
 * shirt numbers already saved in the squad. */

const mins = (s: number) => (s >= 60 ? `${Math.round(s / 60)} min` : `${Math.round(s)} s`);
const clock = (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

/** Which squad player wore this number in this match: the coach's choice, else the squad's shirt number. */
export function playerForNumber(job: VideoJob, number: number, candidates: Player[]): Player | undefined {
  const saved = job.numbers?.[String(number)];
  if (saved === "") return undefined;
  if (saved) return candidates.find((p) => p.id === saved);
  return candidates.find((p) => p.shirt_number === number);
}

/** A short line of video stats for one player (used on their review card and for the AI). */
export function videoLineFor(job: VideoJob | undefined, player: Player, candidates: Player[]): string | null {
  if (!job?.results?.players || job.our_team === null) return null;
  const me = job.results.players.find((x) => x.team === job.our_team && playerForNumber(job, x.number, candidates)?.id === player.id);
  if (!me) return null;
  const pm = job.results.mapping?.players?.find((x) => x.team === me.team && x.number === me.number);
  return [
    `seen ${mins(me.seen_s)}`,
    `${clock(me.on_ball_s)} on the ball`,
    pm?.metres_per_min ? `≈ ${((pm.metres_per_min * 90) / 1000).toFixed(1)} km per 90 min` : "",
    pm ? `usually ${Math.round(pm.avg_from_own_goal_m)} m from our goal` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function VideoPlayers({ job, match }: { job: VideoJob; match: Match }) {
  const { data, squadOf, squad, supabase, patch, toast } = useApp();
  const ours = job.our_team;
  const found = (job.results?.players ?? []).filter((p) => p.team === ours);
  const theirs = (job.results?.players ?? []).filter((p) => p.team !== ours).length;
  const candidates = useMemo(() => {
    const inSquad = squadOf(match.id).map((r) => data.players.find((p) => p.id === r.player_id)).filter((p): p is Player => !!p);
    const rest = squad(match.team_id).filter((p) => !inSquad.some((q) => q.id === p.id));
    return [...inSquad, ...rest];
  }, [data.players, squadOf, squad, match.id, match.team_id]);
  const [busy, setBusy] = useState(false);
  if (ours === null || !job.results?.players) return null;

  async function choose(number: number, playerId: string) {
    const numbers = { ...(job.numbers ?? {}), [String(number)]: playerId };
    setBusy(true);
    const { error } = await supabase.from("match_video_jobs").update({ numbers }).eq("id", job.id);
    setBusy(false);
    if (error) return toast(/numbers/.test(error.message) ? "Run update 37 in Supabase first." : errMsg(error));
    patch((d) => ({ ...d, videoJobs: d.videoJobs.map((x) => (x.id === job.id ? { ...x, numbers } : x)) }));
  }

  return (
    <div className="vp">
      <h4 className="vs-h">Players (from shirt numbers)</h4>
      {found.length === 0 ? (
        <p className="muted" style={{ margin: 0, fontSize: 14 }}>
          No shirt numbers could be read for your team in this video. Numbers are read when players are near the camera with their back to it.
        </p>
      ) : (
        <>
          <ul className="vp-list">
            {found.map((x) => {
              const p = playerForNumber(job, x.number, candidates);
              const pm = job.results?.mapping?.players?.find((y) => y.team === x.team && y.number === x.number);
              return (
                <li key={x.number}>
                  <span className="vp-num tnum">{x.number}</span>
                  <span className="vp-main">
                    <select
                      className="input"
                      value={job.numbers?.[String(x.number)] ?? p?.id ?? ""}
                      disabled={busy}
                      aria-label={`Who wore number ${x.number}?`}
                      onChange={(e) => choose(x.number, e.target.value)}
                    >
                      <option value="">Who wore #{x.number}?</option>
                      {candidates.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.full_name}
                          {c.shirt_number !== null ? ` (#${c.shirt_number})` : ""}
                        </option>
                      ))}
                    </select>
                    <small className="muted">
                      Seen {mins(x.seen_s)} · {clock(x.on_ball_s)} on the ball
                      {pm?.metres_per_min ? ` · ≈ ${((pm.metres_per_min * 90) / 1000).toFixed(1)} km per 90 min` : ""}
                      {pm ? ` · usually ${Math.round(pm.avg_from_own_goal_m)} m from our goal` : ""}
                    </small>
                  </span>
                </li>
              );
            })}
          </ul>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Matched from your squad&apos;s shirt numbers; change any that are wrong. Players are only counted while their number can be read, so these are partial: use them as a guide.
            {theirs > 0 && ` ${theirs} opposition numbers were also read (used for their team only).`}
          </p>
        </>
      )}
    </div>
  );
}
