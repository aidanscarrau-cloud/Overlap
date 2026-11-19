"use client";

import { useState } from "react";
import { useApp } from "../AppProvider";
import { Modal } from "../fitness/Fitness";
import { errMsg, fmtDay, fmtMon, fmtNum, todayIso } from "@/lib/format";
import type { Injury, Player } from "@/lib/types";

/* Injuries and return to play: log or report an injury, move through six steps back to matches. */

export const BODY: Record<string, string> = {
  head: "Head",
  neck: "Neck",
  shoulder: "Shoulder",
  arm: "Arm",
  wrist_hand: "Wrist / hand",
  back: "Back",
  hip_groin: "Hip / groin",
  hamstring: "Hamstring",
  quad: "Thigh (quad)",
  knee: "Knee",
  calf: "Calf / shin",
  ankle: "Ankle",
  foot: "Foot",
  other: "Other",
};
export const KIND: Record<Injury["kind"], string> = {
  sprain: "Sprain",
  strain: "Strain",
  knock: "Knock / bruise",
  fracture: "Fracture",
  concussion: "Concussion",
  illness: "Illness",
  overuse: "Overuse / soreness",
  other: "Other",
};
const SEVERITY: Record<Injury["severity"], string> = {
  minor: "Minor",
  moderate: "Moderate",
  serious: "Serious",
};
const CAUSE: Record<Injury["cause"], string> = {
  training: "Training",
  match: "Match",
  outside: "Outside football",
  unknown: "Not sure",
};
export const STAGES = [
  {
    t: "Rest & treatment",
    d: "Rest, ice and compression as advised. See a physio or doctor if it's not improving.",
  },
  {
    t: "Light activity",
    d: "Walking, cycling and gentle stretching, all pain-free.",
  },
  {
    t: "Running",
    d: "Jogging, then running in straight lines and building up speed.",
  },
  {
    t: "Football, no contact",
    d: "Ball work, passing and changes of direction. Trains with the team, no tackles.",
  },
  { t: "Full training", d: "Full training including contact." },
  { t: "Match ready", d: "Cleared to play matches." },
];
const CONCUSSION_NOTE =
  "Concussion: follow the doctor's advice. Under Australian community sport guidelines, players need a doctor's clearance before full-contact training and shouldn't play games for at least 21 days after the concussion.";

export const injuryLabel = (i: Pick<Injury, "body_part" | "side" | "kind">) =>
  `${i.side === "left" ? "Left " : i.side === "right" ? "Right " : ""}${(BODY[i.body_part] ?? i.body_part).toLowerCase()} ${KIND[i.kind].toLowerCase()}`.replace(
    /^./,
    (c) => c.toUpperCase(),
  );
const day = (d: string) => `${fmtDay(d)} ${fmtNum(d)} ${fmtMon(d)}`;
const daysOut = (i: Injury) =>
  Math.max(
    0,
    Math.round(
      (+new Date(i.recovered_on ?? todayIso()) - +new Date(i.occurred_on)) /
        864e5,
    ),
  );

/* ------------------------------------------------------------------ log or report */

export function InjurySheet({
  player,
  injury,
  onClose,
}: {
  player: Player;
  injury?: Injury | null;
  onClose: () => void;
}) {
  const { supabase, toast, patch, canDo, refresh } = useApp();
  const staff = canDo("squad.edit", player.team_id);
  const [d, setD] = useState(() => ({
    body_part: injury?.body_part ?? "ankle",
    side: injury?.side ?? "na",
    kind: injury?.kind ?? "sprain",
    severity: injury?.severity ?? "minor",
    occurred_on: injury?.occurred_on ?? todayIso(),
    cause: injury?.cause ?? (staff ? "training" : "unknown"),
    notes: injury?.notes ?? "",
    expected_return: injury?.expected_return ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<typeof d>) => setD((x) => ({ ...x, ...p }));
  const sided = !["head", "neck", "back", "other"].includes(d.body_part);
  async function save() {
    setBusy(true);
    const row = {
      player_id: player.id,
      ...d,
      side: sided ? d.side : "na",
      expected_return: d.expected_return || null,
    };
    const q = injury
      ? supabase
          .from("player_injuries")
          .update(row)
          .eq("id", injury.id)
          .select("*")
          .single()
      : supabase.from("player_injuries").insert(row).select("*").single();
    const { data: saved, error } = await q;
    setBusy(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({
      ...x,
      injuries: [
        saved as Injury,
        ...x.injuries.filter((i) => i.id !== (saved as Injury).id),
      ],
      players: x.players.map((p) =>
        p.id === player.id ? { ...p, status: "injured" } : p,
      ),
    }));
    toast(
      injury
        ? "Injury updated"
        : staff
          ? `${player.full_name.split(" ")[0]} marked injured`
          : "Thanks. The coaches have been told.",
    );
    refresh();
    onClose();
  }
  async function remove() {
    if (!injury) return;
    const { error } = await supabase
      .from("player_injuries")
      .delete()
      .eq("id", injury.id);
    if (error) return toast(errMsg(error));
    patch((x) => ({
      ...x,
      injuries: x.injuries.filter((i) => i.id !== injury.id),
    }));
    toast("Injury removed");
    refresh();
    onClose();
  }
  return (
    <Modal
      title={
        injury
          ? "Edit injury"
          : staff
            ? `Log an injury: ${player.full_name}`
            : `Report an injury: ${player.full_name.split(" ")[0]}`
      }
      onClose={onClose}
      foot={
        <>
          {injury && staff ? (
            <button className="btn danger" onClick={remove}>
              Delete
            </button>
          ) : (
            <span className="spacer" />
          )}
          <button className="btn primary" disabled={busy} onClick={save}>
            {busy
              ? "Saving…"
              : injury
                ? "Save"
                : staff
                  ? "Log injury"
                  : "Send to coaches"}
          </button>
        </>
      }
    >
      <div className="inj-form">
        <section>
          <h3>Where?</h3>
          <div className="inj-chips">
            {Object.entries(BODY).map(([k, l]) => (
              <button
                key={k}
                type="button"
                className="chip"
                aria-pressed={d.body_part === k}
                onClick={() => set({ body_part: k })}
              >
                {l}
              </button>
            ))}
          </div>
          {sided && (
            <div className="seg inj-side" role="group" aria-label="Side">
              {(["left", "right", "both", "na"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-selected={d.side === s}
                  onClick={() => set({ side: s })}
                >
                  {s === "na" ? "Not sure" : s[0].toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          )}
        </section>
        <section>
          <h3>What kind?</h3>
          <div className="inj-chips">
            {(Object.keys(KIND) as Injury["kind"][]).map((k) => (
              <button
                key={k}
                type="button"
                className="chip"
                aria-pressed={d.kind === k}
                onClick={() => set({ kind: k })}
              >
                {KIND[k]}
              </button>
            ))}
          </div>
          {d.kind === "concussion" && (
            <p className="inj-warn">{CONCUSSION_NOTE}</p>
          )}
        </section>
        <div className="inj-grid">
          <label className="field">
            <span>How bad?</span>
            <select
              className="input"
              value={d.severity}
              onChange={(e) =>
                set({ severity: e.target.value as Injury["severity"] })
              }
            >
              {Object.entries(SEVERITY).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Happened at</span>
            <select
              className="input"
              value={d.cause}
              onChange={(e) =>
                set({ cause: e.target.value as Injury["cause"] })
              }
            >
              {Object.entries(CAUSE).map(([k, l]) => (
                <option key={k} value={k}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>When</span>
            <input
              className="input"
              type="date"
              value={d.occurred_on}
              max={todayIso()}
              onChange={(e) => set({ occurred_on: e.target.value })}
            />
          </label>
          <label className="field">
            <span>Expected back (optional)</span>
            <input
              className="input"
              type="date"
              value={d.expected_return}
              min={d.occurred_on}
              onChange={(e) => set({ expected_return: e.target.value })}
            />
          </label>
        </div>
        <label className="field">
          <span>Notes (optional)</span>
          <textarea
            className="input"
            rows={3}
            maxLength={1000}
            value={d.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder={
              staff
                ? "What happened, physio advice, what to avoid…"
                : "What happened and anything the coaches should know"
            }
          />
        </label>
        <p className="fg-small">
          {staff
            ? "The player shows as injured until you mark them recovered. Their family and the team's coaches are notified."
            : "The coaches will be told straight away and will set the steps back to playing."}
        </p>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------------ return-to-play tracker */

export function InjuryCard({
  injury,
  player,
}: {
  injury: Injury;
  player: Player;
}) {
  const { supabase, toast, patch, canDo, refresh } = useApp();
  const staff = canDo("squad.edit", player.team_id);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const conc = injury.kind === "concussion";
  async function update(p: Partial<Injury>, msg: string) {
    setBusy(true);
    const { data: saved, error } = await supabase
      .from("player_injuries")
      .update(p)
      .eq("id", injury.id)
      .select("*")
      .single();
    setBusy(false);
    if (error) return toast(errMsg(error));
    patch((x) => ({
      ...x,
      injuries: x.injuries.map((i) =>
        i.id === injury.id ? (saved as Injury) : i,
      ),
      players:
        p.status === "recovered" &&
        !x.injuries.some(
          (i) =>
            i.player_id === player.id &&
            i.status === "active" &&
            i.id !== injury.id,
        )
          ? x.players.map((pl) =>
              pl.id === player.id
                ? { ...pl, status: "available", status_note: "" }
                : pl,
            )
          : x.players,
    }));
    toast(msg);
    refresh();
  }
  const blocked = conc && injury.stage >= 4 && !injury.cleared_by_doctor;
  return (
    <div className={`inj-card${injury.status === "recovered" ? " done" : ""}`}>
      <div className="inj-h">
        <span className={`inj-sev ${injury.severity}`}>
          {SEVERITY[injury.severity]}
        </span>
        <b>{injuryLabel(injury)}</b>
        <small>
          {day(injury.occurred_on)} · {CAUSE[injury.cause]}
          {injury.status === "recovered"
            ? ` · back ${day(injury.recovered_on!)} (${daysOut(injury)} days)`
            : ` · ${daysOut(injury)} days out`}
          {injury.expected_return && injury.status === "active"
            ? ` · expected back ${day(injury.expected_return)}`
            : ""}
        </small>
        {injury.reported_by_family && (
          <small className="inj-by">Reported by {injury.created_by_name}</small>
        )}
      </div>
      {injury.status === "active" && (
        <>
          <ol className="inj-steps" aria-label="Return to play">
            {STAGES.map((s, i) => (
              <li
                key={i}
                className={
                  i + 1 < injury.stage
                    ? "past"
                    : i + 1 === injury.stage
                      ? "now"
                      : ""
                }
              >
                <span className="inj-dot">
                  {i + 1 < injury.stage ? "✓" : i + 1}
                </span>
                <span>
                  <b>{s.t}</b>
                  {i + 1 === injury.stage && <small>{s.d}</small>}
                </span>
              </li>
            ))}
          </ol>
          {conc && <p className="inj-warn">{CONCUSSION_NOTE}</p>}
          {injury.notes && <p className="inj-notes">{injury.notes}</p>}
          {staff && (
            <div className="inj-acts">
              {conc && (
                <label className="inj-clear">
                  <input
                    type="checkbox"
                    checked={injury.cleared_by_doctor}
                    disabled={busy}
                    onChange={(e) =>
                      update(
                        { cleared_by_doctor: e.target.checked },
                        e.target.checked
                          ? "Doctor's clearance recorded"
                          : "Clearance removed",
                      )
                    }
                  />
                  Doctor&apos;s clearance received
                </label>
              )}
              {injury.stage > 1 && (
                <button
                  className="btn sm"
                  disabled={busy}
                  onClick={() =>
                    update({ stage: injury.stage - 1 }, "Moved back a step")
                  }
                >
                  ← Back a step
                </button>
              )}
              {injury.stage < 6 ? (
                <button
                  className="btn sm primary"
                  disabled={busy || blocked}
                  title={
                    blocked ? "Needs a doctor's clearance first" : undefined
                  }
                  onClick={() =>
                    update(
                      { stage: injury.stage + 1 },
                      `Now: ${STAGES[injury.stage].t}`,
                    )
                  }
                >
                  Next step: {STAGES[injury.stage].t} →
                </button>
              ) : null}
              <button
                className="btn sm"
                disabled={busy || (conc && !injury.cleared_by_doctor)}
                onClick={() =>
                  update(
                    { status: "recovered", stage: 6 },
                    `${player.full_name.split(" ")[0]} is back`,
                  )
                }
              >
                ✓ Recovered
              </button>
              <button className="btn sm" onClick={() => setEditing(true)}>
                Edit
              </button>
            </div>
          )}
        </>
      )}
      {editing && (
        <InjurySheet
          player={player}
          injury={injury}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

/** All of a player's injuries, open first, with a button to log/report one. */
export function PlayerInjuries({
  player,
  showHistory = true,
}: {
  player: Player;
  showHistory?: boolean;
}) {
  const { data, canDo, myPlayers } = useApp();
  const [logging, setLogging] = useState(false);
  const list = data.injuries.filter((i) => i.player_id === player.id);
  const open = list.filter((i) => i.status === "active");
  const past = list.filter((i) => i.status === "recovered");
  const can =
    canDo("squad.edit", player.team_id) ||
    myPlayers.some((p) => p.id === player.id);
  return (
    <div className="inj-list">
      {open.map((i) => (
        <InjuryCard key={i.id} injury={i} player={player} />
      ))}
      {showHistory && past.length > 0 && (
        <details className="inj-past">
          <summary>Past injuries ({past.length})</summary>
          {past.map((i) => (
            <InjuryCard key={i.id} injury={i} player={player} />
          ))}
        </details>
      )}
      {can && (
        <button
          type="button"
          className="inj-add"
          onClick={() => setLogging(true)}
        >
          {canDo("squad.edit", player.team_id)
            ? "+ Log an injury"
            : `+ Report an injury for ${player.full_name.split(" ")[0]}`}
        </button>
      )}
      {logging && (
        <InjurySheet player={player} onClose={() => setLogging(false)} />
      )}
    </div>
  );
}

/** Squad page: who's injured right now and where they're up to. */
export function InjuryBoard({ players }: { players: Player[] }) {
  const { data, open } = useApp();
  const ids = new Set(players.map((p) => p.id));
  const list = data.injuries.filter(
    (i) => i.status === "active" && ids.has(i.player_id),
  );
  if (!list.length) return null;
  return (
    <section className="inj-board" aria-label="Injured players">
      <div className="md-sec-h">
        <h2>Injured</h2>
        <span className="fl-note">{list.length} out</span>
      </div>
      <ul>
        {list.map((i) => {
          const p = players.find((x) => x.id === i.player_id)!;
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => open({ kind: "player", id: p.id })}
              >
                <span className={`inj-sev ${i.severity}`} aria-hidden="true" />
                <span className="inj-who">
                  <b>{p.full_name}</b>
                  <small>
                    {injuryLabel(i)} · {daysOut(i)} days
                    {i.expected_return
                      ? ` · back ~${day(i.expected_return)}`
                      : ""}
                  </small>
                </span>
                <span className="inj-stage" title={STAGES[i.stage - 1].t}>
                  <i style={{ width: `${(i.stage / 6) * 100}%` }} />
                  <em>
                    {i.stage}/6 · {STAGES[i.stage - 1].t}
                  </em>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Family home: where an injured child is up to, and a way to tell the coaches about a new one. */
export function FamilyInjuries() {
  const { data, myPlayers, kidName } = useApp();
  const [who, setWho] = useState<Player | null>(null);
  const parent = data.role === "parent";
  const open = data.injuries.filter(
    (i) => i.status === "active" && myPlayers.some((p) => p.id === i.player_id),
  );
  return (
    <section className="inj-fam" aria-label="Injuries">
      {open.length > 0 && (
        <>
          <div className="md-sec-h">
            <h2>Getting back to playing</h2>
          </div>
          {open.map((i) => {
            const p = myPlayers.find((x) => x.id === i.player_id)!;
            return (
              <div key={i.id}>
                {(parent || myPlayers.length > 1) && (
                  <p className="inj-kid">{kidName(p)}</p>
                )}
                <InjuryCard injury={i} player={p} />
              </div>
            );
          })}
        </>
      )}
      <div className="inj-report">
        {myPlayers.map((p) => (
          <button
            key={p.id}
            type="button"
            className="inj-add"
            onClick={() => setWho(p)}
          >
            🩹{" "}
            {parent
              ? `${kidName(p)} hurt? Tell the coaches`
              : "Hurt? Tell your coaches"}
          </button>
        ))}
      </div>
      {who && <InjurySheet player={who} onClose={() => setWho(null)} />}
    </section>
  );
}
