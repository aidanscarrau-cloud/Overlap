"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useApp } from "../AppProvider";
import { SheetFrame } from "../sheets/SheetFrame";
import { LoadCard } from "../Load";
import { STATUS } from "@/lib/constants";
import { errMsg, fmtDay, fmtNum, fmtMon, hhmm, todayIso } from "@/lib/format";
import { overall } from "@/lib/idp";
import type { Player, Position, Status } from "@/lib/types";
import { badgeOf } from "../views/Squad";

const POS_WORD: Record<Position, string> = { GK: "Goalkeeper", DEF: "Defender", MID: "Midfielder", FWD: "Forward" };
const STATUS_CLASS: Record<Status, string> = { available: "ok", injured: "bad", unavailable: "warn" };

/** A player's profile: who they are, how they're going, and quick things a coach does. */
export function PlayerProfile({ p, onEdit, canEdit }: { p: Player; onEdit: () => void; canEdit: boolean }) {
  const { data, can, sessionsOf, attendedSet, repliesFor, playerRate, evaluationsOf, goalsOf, myPlayers, supabase, toast, refresh, patch, close } = useApp();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const mine = myPlayers.some((x) => x.id === p.id);
  const seeAtt = can("attendance.view") || mine;
  const seeIdp = can("idp.view") || mine;
  const team = data.teams.find((t) => t.id === p.team_id);
  const today = todayIso();
  const sessions = sessionsOf(p.team_id);
  const next = sessions.find((s) => s.date >= today);
  const reply = next ? repliesFor(next.id).get(p.id) : undefined;
  const last = sessions.filter((s) => s.date < today).slice(-8);
  const rate = seeAtt ? playerRate(p) : null;
  const rating = seeIdp ? overall(evaluationsOf(p.id)[0]?.ratings) : null;
  const stats = data.matchPlayers.filter((m) => m.player_id === p.id);
  const goals = stats.reduce((n, m) => n + (m.goals || 0), 0);
  const assists = stats.reduce((n, m) => n + (m.assists || 0), 0);
  const devGoals = seeIdp ? goalsOf(p.id).filter((g) => g.status === "active").slice(0, 3) : [];
  const parents = data.members.filter((m) => m.player_ids.includes(p.id) && m.role === "parent" && m.user_id !== data.userId);
  const canMessage = data.chatAllowed && data.role !== "player" && parents.length > 0;

  async function setStatus(status: Status) {
    setBusy(true);
    const row: Record<string, unknown> = { status };
    if (status === "available") row.status_note = "";
    const { error } = await supabase.from("players").update(row).eq("id", p.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({ ...x, players: x.players.map((y) => (y.id === p.id ? { ...y, status, ...(status === "available" ? { status_note: "" } : {}) } : y)) }));
    toast(`${p.full_name.split(" ")[0]} marked ${STATUS[status].toLowerCase()}`);
    refresh();
  }
  async function message() {
    setBusy(true);
    const { data: id, error } = await supabase.rpc("open_direct_chat", { p_club: data.club.id, p_user: parents[0].user_id });
    setBusy(false);
    if (error) return toast(errMsg(error));
    close();
    router.push(`/chat?c=${id}`);
  }

  return (
    <SheetFrame title={p.full_name}>
      <div className="pp">
        <header className="pp-hero">
          <span className={`pp-num${p.shirt_number == null ? " ini" : ""}`}>{badgeOf(p)}</span>
          <h2>{p.full_name}</h2>
          <div className="pp-tags">
            <span>{POS_WORD[p.position]}</span>
            {team && <span>{team.name}</span>}
            {p.birth_year && <span>Born {p.birth_year}</span>}
            <span className={`pp-st ${STATUS_CLASS[p.status]}`}>{STATUS[p.status]}</span>
          </div>
          {p.status !== "available" && p.status_note && <p className="pp-note">{p.status_note}</p>}
        </header>

        <div className="pp-tiles">
          {rate !== null && (
            <div>
              <b>{rate}%</b>
              <small>Attendance</small>
            </div>
          )}
          {rating !== null && (
            <div>
              <b>{rating}</b>
              <small>Rating</small>
            </div>
          )}
          <div>
            <b>{goals}</b>
            <small>Goals</small>
          </div>
          <div>
            <b>{assists}</b>
            <small>Assists</small>
          </div>
        </div>

        {next && (
          <section className="pp-sec">
            <h3>Next up</h3>
            <div className="pp-next">
              <span>
                <b>
                  {fmtDay(next.date)} {fmtNum(next.date)} {fmtMon(next.date)} · {hhmm(next.start_time)}
                </b>{" "}
                · {next.title || "Training"}
              </span>
              <span className={`pp-reply ${reply ? (reply.going ? "y" : "n") : "q"}`}>{reply ? (reply.going ? "✓ Coming" : "✕ Can't come") : "? No reply"}</span>
            </div>
            {reply && !reply.going && reply.note && <p className="pp-sub">&ldquo;{reply.note}&rdquo;</p>}
          </section>
        )}

        {seeAtt && last.length > 0 && (
          <section className="pp-sec">
            <h3>
              Last {last.length} session{last.length === 1 ? "" : "s"}
            </h3>
            <div className="pp-dots">
              {last.map((s) => {
                const was = attendedSet(s.id).has(p.id);
                return (
                  <i key={s.id} className={was ? "y" : "n"} title={`${fmtDay(s.date)} ${fmtNum(s.date)} ${fmtMon(s.date)}: ${was ? "there" : "missed"}`}>
                    {was ? "✓" : "✕"}
                  </i>
                );
              })}
            </div>
          </section>
        )}

        {seeIdp && (
          <section className="pp-sec">
            <h3>
              Development
              <Link href={`/development/${p.id}`} onClick={close}>
                Open plan
              </Link>
            </h3>
            {devGoals.length ? (
              devGoals.map((g) => (
                <div key={g.id} className="pp-goal">
                  <b>{g.title}</b>
                  <span className="pp-bar">
                    <i style={{ width: `${Math.max(4, g.progress)}%` }} />
                  </span>
                </div>
              ))
            ) : (
              <p className="pp-sub">No active goals yet.</p>
            )}
            {(can("attendance.view") || can("idp.view") || mine) && (
              <Link href={`/players/${p.id}`} onClick={close} className="pp-link">
                Progress report →
              </Link>
            )}
          </section>
        )}

        <LoadCard playerId={p.id} />

        {(canEdit || canMessage) && (
          <div className="pp-acts">
            {canEdit &&
              (p.status === "available" ? (
                <button type="button" disabled={busy} onClick={() => setStatus("injured")}>
                  <span aria-hidden="true">🩹</span>Mark injured
                </button>
              ) : (
                <button type="button" disabled={busy} onClick={() => setStatus("available")}>
                  <span aria-hidden="true">✅</span>Mark available
                </button>
              ))}
            {canMessage && (
              <button type="button" disabled={busy} onClick={message}>
                <span aria-hidden="true">💬</span>Message {parents.length === 1 ? parents[0].full_name.split(" ")[0] : "parent"}
              </button>
            )}
            {canEdit && (
              <button type="button" onClick={onEdit}>
                <span aria-hidden="true">✎</span>Edit details
              </button>
            )}
          </div>
        )}
      </div>
    </SheetFrame>
  );
}
