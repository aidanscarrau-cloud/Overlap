"use client";

import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { ConfirmButton, SheetFrame } from "../sheets/SheetFrame";
import { pingPush } from "@/lib/push-client";
import { AREAS, overall, type Area, type Ratings } from "@/lib/idp";
import { errMsg, parseD, todayIso } from "@/lib/format";
import type { SelfReview } from "@/lib/types";

const shortDate = (d: string) => parseD(d.slice(0, 10)).toLocaleDateString("en-AU", { day: "numeric", month: "short" });
const DEFAULT_MSG = "Have an honest think about how you're going. Rate yourself in each area and tell me what's going well and what you want to work on.";

/** Open a self-review straight from a notification link (?self=<id>). */
export function useOpenSelfFromUrl() {
  const { open, data } = useApp();
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("self");
    if (id && data.selfReviews.some((s) => s.id === id)) {
      open({ kind: "self-review", id });
      window.history.replaceState(null, "", window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

const status = (s: SelfReview) => (s.coach_reply ? "Coach replied" : s.submitted_at ? "Sent to coach" : "Waiting for the player");

/* ------------------------------------------------------------ coaches: asking */

export function RequestSelfReviewSheet({ playerIds }: { playerIds: string[] }) {
  const { data, supabase, refresh, close, toast } = useApp();
  const players = data.players.filter((p) => playerIds.includes(p.id)).sort((a, b) => a.full_name.localeCompare(b.full_name));
  const pending = new Set(data.selfReviews.filter((s) => !s.submitted_at).map((s) => s.player_id));
  const [chosen, setChosen] = useState(() => new Set(players.filter((p) => !pending.has(p.id)).map((p) => p.id)));
  const [message, setMessage] = useState(DEFAULT_MSG);
  const [due, setDue] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);
  const linked = new Set(data.members.flatMap((m) => m.player_ids));

  async function send() {
    if (!chosen.size) return toast("Choose at least one player.");
    setBusy(true);
    const rows = [...chosen].map((player_id) => ({ player_id, message: message.trim(), due_date: due || null }));
    const { error } = await supabase.from("self_reviews").insert(rows);
    setBusy(false);
    if (error) return toast(errMsg(error));
    pingPush();
    toast(rows.length === 1 ? "Self-review request sent" : `Sent to ${rows.length} players`);
    close();
    refresh();
  }

  return (
    <SheetFrame
      title={players.length === 1 ? `Ask ${players[0].full_name.split(" ")[0]} for a self-review` : "Ask for self-reviews"}
      foot={
        <>
          <span className="spacer" />
          <button className="btn" onClick={close}>
            Cancel
          </button>
          <button className="btn primary" disabled={busy || !chosen.size} onClick={send}>
            {busy ? "Sending…" : chosen.size > 1 ? `Send to ${chosen.size} players` : "Send"}
          </button>
        </>
      }
    >
      <div style={{ display: "grid", gap: 14 }}>
        <p className="muted" style={{ margin: 0 }}>
          The player (or their parent) gets a notification and rates themselves 1 to 10 in each area, then says what&apos;s going well, what they want to improve and a goal. You&apos;ll see their answers next to your own evaluation.
        </p>
        <label className="field">
          <span>Message to the player</span>
          <textarea className="input" id="sr-msg" rows={3} maxLength={500} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <label className="field" style={{ maxWidth: 220 }}>
          <span>Fill in by (optional)</span>
          <input className="input" type="date" id="sr-due" min={todayIso()} value={due} onChange={(e) => setDue(e.target.value)} />
        </label>
        {players.length > 1 && (
          <fieldset className="plain sr-pick">
            <legend>Players</legend>
            <div className="sr-pick-actions">
              <button type="button" className="linklike" onClick={() => setChosen(new Set(players.map((p) => p.id)))}>
                Select all
              </button>
              <button type="button" className="linklike" onClick={() => setChosen(new Set())}>
                Clear
              </button>
            </div>
            {players.map((p) => (
              <label key={p.id} className="sr-pick-row">
                <input
                  type="checkbox"
                  checked={chosen.has(p.id)}
                  onChange={(e) =>
                    setChosen((s) => {
                      const n = new Set(s);
                      if (e.target.checked) n.add(p.id);
                      else n.delete(p.id);
                      return n;
                    })
                  }
                />
                <span>{p.full_name}</span>
                {pending.has(p.id) && <small className="muted">already has one waiting</small>}
                {!linked.has(p.id) && <small className="muted">no account linked yet, so they can&apos;t answer</small>}
              </label>
            ))}
          </fieldset>
        )}
      </div>
    </SheetFrame>
  );
}

/* ------------------------------------------------------------ one self-review */

export function SelfReviewSheet({ id }: { id: string }) {
  const { data, myPlayers, can } = useApp();
  const s = data.selfReviews.find((x) => x.id === id);
  if (!s) return <SheetFrame title="Self-review not found">This self-review has been removed.</SheetFrame>;
  const mine = myPlayers.some((p) => p.id === s.player_id);
  const player = data.players.find((p) => p.id === s.player_id);
  if (mine && !s.coach_reply) return <SelfReviewForm s={s} />;
  return <SelfReviewView s={s} staff={!mine && can("idp.view")} name={player?.full_name ?? "Player"} />;
}

function RatingPicker({ value, onChange, label }: { value?: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="rate-row" role="radiogroup" aria-label={label}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className="rate-btn" onClick={() => onChange(v)}>
          {v}
        </button>
      ))}
    </div>
  );
}

function SelfReviewForm({ s }: { s: SelfReview }) {
  const { data, supabase, refresh, close, toast, kidName } = useApp();
  const player = data.players.find((p) => p.id === s.player_id)!;
  const parent = data.role === "parent";
  const name = parent ? kidName(player) : "you";
  const [ratings, setRatings] = useState<Ratings>(s.ratings ?? {});
  const [well, setWell] = useState(s.going_well);
  const [improve, setImprove] = useState(s.improve);
  const [goal, setGoal] = useState(s.goal_idea);
  const [busy, setBusy] = useState(false);
  const done = AREAS.filter((a) => typeof ratings[a.key] === "number").length;

  async function send() {
    if (done < AREAS.length) return toast("Give a rating in all five areas first.");
    setBusy(true);
    const { error } = await supabase.rpc("submit_self_review", { p_id: s.id, p_ratings: ratings, p_going_well: well.trim(), p_improve: improve.trim(), p_goal: goal.trim() });
    setBusy(false);
    if (error) return toast(errMsg(error));
    pingPush();
    toast(s.submitted_at ? "Changes sent to your coach" : "Sent to your coach. Nice work!");
    close();
    refresh();
  }

  return (
    <SheetFrame
      title={parent ? `${kidName(player)}'s self-review` : "Your self-review"}
      foot={
        <>
          <span className="spacer" />
          <span className="muted" style={{ fontSize: 13 }}>
            {done}/5 rated
          </span>
          <button className="btn primary" disabled={busy} onClick={send}>
            {busy ? "Sending…" : s.submitted_at ? "Send changes" : "Send to coach"}
          </button>
        </>
      }
    >
      <div className="sr-form">
        <p className="sr-msg">
          <b>{s.author_name || "Your coach"}</b>: {s.message || DEFAULT_MSG}
          {s.due_date && <span className="muted"> · by {shortDate(s.due_date)}</span>}
        </p>
        {parent && <p className="muted" style={{ margin: 0 }}>Fill this in together with {kidName(player)}: it should be their own view.</p>}
        <p className="muted" style={{ margin: 0 }}>
          1 means it&apos;s a big work-on, 5 is OK, 10 is a real strength. Be honest: there are no wrong answers.
        </p>
        {AREAS.map((a) => (
          <div key={a.key} className="sr-area">
            <div>
              <b>{a.label}</b>
              <small>{a.help}</small>
            </div>
            <RatingPicker label={a.label} value={ratings[a.key as Area]} onChange={(v) => setRatings((r) => ({ ...r, [a.key]: v }))} />
          </div>
        ))}
        <label className="field">
          <span>What&apos;s going well for {name}?</span>
          <textarea className="input" id="sr-well" rows={3} maxLength={1000} value={well} onChange={(e) => setWell(e.target.value)} />
        </label>
        <label className="field">
          <span>What do{parent ? "es" : ""} {name} want to get better at?</span>
          <textarea className="input" id="sr-improve" rows={3} maxLength={1000} value={improve} onChange={(e) => setImprove(e.target.value)} />
        </label>
        <label className="field">
          <span>A goal {name === "you" ? "you'd" : `${name} would`} like to set</span>
          <input className="input" id="sr-goal" maxLength={500} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="e.g. Use my left foot more in games" />
        </label>
      </div>
    </SheetFrame>
  );
}

function SelfReviewView({ s, staff, name }: { s: SelfReview; staff: boolean; name: string }) {
  const { evaluationsOf, canDo, data, supabase, refresh, toast, close } = useApp();
  const player = data.players.find((p) => p.id === s.player_id);
  const coachEval = evaluationsOf(s.player_id)[0];
  const canReply = staff && !!player && player.team_ids.some((t) => canDo("idp.edit", t));
  const [reply, setReply] = useState(s.coach_reply);
  const [busy, setBusy] = useState(false);

  async function sendReply() {
    if (!reply.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("self_reviews").update({ coach_reply: reply.trim(), replied_at: new Date().toISOString() }).eq("id", s.id);
    setBusy(false);
    if (error) return toast(errMsg(error));
    pingPush();
    toast("Reply sent");
    refresh();
  }
  async function remove() {
    const { error } = await supabase.from("self_reviews").delete().eq("id", s.id);
    if (error) return toast(errMsg(error));
    toast("Self-review removed");
    close();
    refresh();
  }

  return (
    <SheetFrame title={`${name}: self-review`}>
      <div className="sr-view">
        <p className="muted" style={{ margin: 0 }}>
          Asked by {s.author_name || "a coach"} on {shortDate(s.created_at)}
          {s.submitted_at ? ` · answered ${shortDate(s.submitted_at)}${s.submitted_by_name ? ` by ${s.submitted_by_name}` : ""}` : ""}
        </p>
        {!s.submitted_at ? (
          <p className="notice">
            Waiting for {name.split(" ")[0]} to fill it in{s.due_date ? ` (asked for by ${shortDate(s.due_date)})` : ""}.
          </p>
        ) : (
          <>
            <table className="sr-compare">
              <thead>
                <tr>
                  <th scope="col">Area</th>
                  <th scope="col">{staff ? "Player" : "You"}</th>
                  {coachEval && <th scope="col">Coach ({shortDate(coachEval.evaluated_on)})</th>}
                </tr>
              </thead>
              <tbody>
                {AREAS.map((a) => {
                  const mine = s.ratings[a.key];
                  const coach = coachEval?.ratings[a.key];
                  const gap = typeof mine === "number" && typeof coach === "number" ? mine - coach : null;
                  return (
                    <tr key={a.key}>
                      <th scope="row">{a.label}</th>
                      <td>
                        <span className="sr-bar" aria-hidden="true">
                          <i style={{ width: `${(mine ?? 0) * 10}%` }} />
                        </span>
                        <b className="tnum">{mine ?? "–"}</b>
                      </td>
                      {coachEval && (
                        <td>
                          <b className="tnum">{coach ?? "–"}</b>
                          {staff && gap !== null && Math.abs(gap) >= 2 && <small className="sr-gap">{gap > 0 ? `rates themselves ${gap} higher` : `rates themselves ${-gap} lower`}</small>}
                        </td>
                      )}
                    </tr>
                  );
                })}
                <tr className="sr-total">
                  <th scope="row">Overall</th>
                  <td>
                    <b className="tnum">{overall(s.ratings) ?? "–"}</b>
                  </td>
                  {coachEval && (
                    <td>
                      <b className="tnum">{overall(coachEval.ratings) ?? "–"}</b>
                    </td>
                  )}
                </tr>
              </tbody>
            </table>
            {s.going_well && (
              <div className="sr-answer">
                <h3>Going well</h3>
                <p>{s.going_well}</p>
              </div>
            )}
            {s.improve && (
              <div className="sr-answer">
                <h3>Wants to get better at</h3>
                <p>{s.improve}</p>
              </div>
            )}
            {s.goal_idea && (
              <div className="sr-answer">
                <h3>Goal idea</h3>
                <p>{s.goal_idea}</p>
              </div>
            )}
          </>
        )}
        {s.coach_reply && !canReply && (
          <div className="sr-answer sr-reply">
            <h3>{s.author_name || "Coach"} replied</h3>
            <p>{s.coach_reply}</p>
          </div>
        )}
        {canReply && s.submitted_at && (
          <label className="field">
            <span>{s.coach_reply ? "Your reply (you can edit it)" : "Reply to the player"}</span>
            <textarea className="input" id="sr-reply" rows={3} maxLength={1000} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Thank them, agree on a goal, tell them what you'll work on together…" />
          </label>
        )}
        {canReply && (
          <div className="sheet-actions">
            <ConfirmButton className="btn sm danger" label={s.submitted_at ? "Delete" : "Cancel request"} onConfirm={remove} />
            <span className="spacer" />
            {s.submitted_at && (
              <button className="btn primary" disabled={busy || !reply.trim() || reply.trim() === s.coach_reply} onClick={sendReply}>
                {s.coach_reply ? "Update reply" : "Send reply"}
              </button>
            )}
          </div>
        )}
      </div>
    </SheetFrame>
  );
}

/* ------------------------------------------------------------ lists and prompts */

/** On a player's development plan: their self-reviews, newest first. */
export function SelfReviewSection({ playerId, canAsk }: { playerId: string; canAsk: boolean }) {
  const { data, open, myPlayers } = useApp();
  const list = data.selfReviews.filter((s) => s.player_id === playerId);
  const mine = myPlayers.some((p) => p.id === playerId);
  if (!list.length && !canAsk) return null;
  return (
    <section className="card" style={{ marginTop: 20 }}>
      <div className="card-h">
        <h2>Self-reviews</h2>
        {canAsk && (
          <button className="btn sm" onClick={() => open({ kind: "self-review-request", playerIds: [playerId] })}>
            Ask for a self-review
          </button>
        )}
      </div>
      <div className="card-b">
        {list.length ? (
          <ul className="sr-list">
            {list.map((s) => (
              <li key={s.id}>
                <button type="button" onClick={() => open({ kind: "self-review", id: s.id })}>
                  <span>
                    <b>{shortDate(s.created_at)}</b> · asked by {s.author_name || "coach"}
                  </span>
                  <span className={`rbadge ${s.coach_reply ? "yes" : s.submitted_at ? "yes" : "wait"}`}>
                    {mine && !s.submitted_at ? "Fill it in" : status(s)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted" style={{ margin: 0 }}>
            Ask the player to rate themselves. Comparing their view with yours is a great start to a development chat.
          </p>
        )}
      </div>
    </section>
  );
}

/** For players and parents: any self-reviews waiting to be filled in. */
export function SelfReviewPrompts() {
  const { data, myPlayers, open, kidName } = useApp();
  const parent = data.role === "parent";
  const waiting = data.selfReviews.filter((s) => !s.submitted_at && myPlayers.some((p) => p.id === s.player_id));
  if (!waiting.length) return null;
  return (
    <>
      {waiting.map((s) => {
        const p = myPlayers.find((x) => x.id === s.player_id)!;
        return (
          <section key={s.id} className="calm-callout sr-prompt">
            <span className="calm-meta">
              Self-review{s.due_date ? ` · by ${shortDate(s.due_date)}` : ""}
            </span>
            <h2>{parent ? `${s.author_name || "The coach"} wants ${kidName(p)}'s self-review` : `${s.author_name || "Your coach"} wants your self-review`}</h2>
            <p>{s.message || DEFAULT_MSG}</p>
            <div>
              <button className="btn primary" onClick={() => open({ kind: "self-review", id: s.id })}>
                {parent ? "Fill it in together" : "Start"}
              </button>
            </div>
          </section>
        );
      })}
    </>
  );
}
