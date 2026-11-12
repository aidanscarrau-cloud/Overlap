"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { errMsg } from "@/lib/format";

/** "Are you coming?" Yes / No for one player and one session, with an optional reason for No. */
export function ReplyButtons({ sessionId, matchId, playerId, label, who }: { sessionId?: string; matchId?: string; playerId: string; label?: string; who?: string }) {
  const { repliesFor, matchRepliesFor, supabase, refresh, toast, patch } = useApp();
  const current = matchId ? matchRepliesFor(matchId).get(playerId) : repliesFor(sessionId!).get(playerId);
  const [askNote, setAskNote] = useState(false);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);

  async function send(going: boolean, n = "") {
    // Show the answer straight away, then save it.
    setAskNote(false);
    const at = new Date().toISOString();
    if (matchId) {
      const reply = { match_id: matchId, player_id: playerId, going, note: n.trim(), updated_at: at };
      patch((d) => ({ ...d, matchReplies: [...d.matchReplies.filter((r) => !(r.match_id === matchId && r.player_id === playerId)), reply] }));
    } else {
      const reply = { session_id: sessionId!, player_id: playerId, going, note: n.trim(), updated_at: at };
      patch((d) => ({ ...d, replies: [...d.replies.filter((r) => !(r.session_id === sessionId && r.player_id === playerId)), reply] }));
    }
    setBusy(true);
    const { error } = matchId
      ? await supabase.rpc("reply_to_match", { p_match: matchId, p_player: playerId, p_going: going, p_note: n.trim() })
      : await supabase.rpc("reply_to_session", { p_session: sessionId, p_player: playerId, p_going: going, p_note: n.trim() });
    setBusy(false);
    if (error) {
      refresh();
      return toast(errMsg(error));
    }
    toast(
      going
        ? `Thanks, ${who ?? "you're"} down as ${matchId ? "available" : "coming"}`
        : `Thanks, your coach knows ${who ?? "you"} can't ${matchId ? "play" : "make it"}`,
    );
    refresh();
  }

  return (
    <div className="reply">
      {label && <span className="reply-q">{label}</span>}
      <div className="reply-btns" role="group" aria-label={matchId ? "Can you play?" : "Are you coming?"}>
        <button type="button" className="rbtn yes" aria-pressed={current?.going === true} disabled={busy} onClick={() => send(true)}>
          ✓ Yes
        </button>
        <button type="button" className="rbtn no" aria-pressed={current?.going === false} disabled={busy} onClick={() => setAskNote(true)}>
          ✕ No
        </button>
      </div>
      {current && !askNote && (
        <span className="reply-state">
          {matchId
            ? current.going
              ? who ? "Available" : "You're available"
              : `Can't play${current.note ? `: ${current.note}` : ""}`
            : current.going
              ? who ? "Going" : "You're going"
              : `Not going${current.note ? `: ${current.note}` : ""}`}
        </span>
      )}
      {askNote && (
        <form
          className="reply-note"
          onSubmit={(e) => {
            e.preventDefault();
            send(false, note);
          }}
        >
          <input className="input" autoFocus maxLength={120} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Reason (optional), e.g. sick, away" aria-label="Reason" />
          <button className="btn sm primary" type="submit" disabled={busy}>
            Send
          </button>
          <button className="btn sm" type="button" onClick={() => setAskNote(false)}>
            Cancel
          </button>
        </form>
      )}
    </div>
  );
}

/** Small badge used on session cards. */
export function ReplyBadge({ sessionId, playerId, name }: { sessionId: string; playerId: string; name?: string }) {
  const { repliesFor } = useApp();
  const r = repliesFor(sessionId).get(playerId);
  const who = name ? `${name}: ` : "";
  if (!r) return <span className="rbadge wait">{who}Reply needed</span>;
  return r.going ? <span className="rbadge yes">✓ {who}Going</span> : <span className="rbadge no">✕ {who}Not going</span>;
}

/** Going / not going / no reply counts for a team session. */
export function ReplyCounts({ sessionId, playerIds }: { sessionId: string; playerIds: string[] }) {
  const { repliesFor } = useApp();
  const r = repliesFor(sessionId);
  let yes = 0,
    no = 0;
  playerIds.forEach((id) => {
    const x = r.get(id);
    if (x) x.going ? yes++ : no++;
  });
  return (
    <span className="rcounts" title={`${yes} going, ${no} not going, ${playerIds.length - yes - no} no reply`}>
      <b className="y">✓ {yes}</b> <b className="n">✕ {no}</b> <span>? {playerIds.length - yes - no}</span>
    </span>
  );
}
