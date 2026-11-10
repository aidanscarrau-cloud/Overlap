"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { errMsg } from "@/lib/format";

/** "Are you coming?" Yes / No for one player and one session, with an optional reason for No. */
export function ReplyButtons({ sessionId, playerId, label, who }: { sessionId: string; playerId: string; label?: string; who?: string }) {
  const { repliesFor, supabase, refresh, toast } = useApp();
  const current = repliesFor(sessionId).get(playerId);
  const [askNote, setAskNote] = useState(false);
  const [note, setNote] = useState(current?.note ?? "");
  const [busy, setBusy] = useState(false);

  async function send(going: boolean, n = "") {
    setBusy(true);
    const { error } = await supabase.rpc("reply_to_session", { p_session: sessionId, p_player: playerId, p_going: going, p_note: n.trim() });
    setBusy(false);
    if (error) return toast(errMsg(error));
    setAskNote(false);
    toast(going ? `Thanks, ${who ?? "you're"} down as coming` : `Thanks, your coach knows ${who ?? "you"} can't make it`);
    refresh();
  }

  return (
    <div className="reply">
      {label && <span className="reply-q">{label}</span>}
      <div className="reply-btns" role="group" aria-label="Are you coming?">
        <button type="button" className="rbtn yes" aria-pressed={current?.going === true} disabled={busy} onClick={() => send(true)}>
          ✓ Yes
        </button>
        <button type="button" className="rbtn no" aria-pressed={current?.going === false} disabled={busy} onClick={() => setAskNote(true)}>
          ✕ No
        </button>
      </div>
      {current && !askNote && (
        <span className="reply-state">
          {current.going ? (who ? "Going" : "You're going") : `Not going${current.note ? `: ${current.note}` : ""}`}
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
