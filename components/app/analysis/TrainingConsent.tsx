"use client";

import { useEffect, useState } from "react";
import { useApp } from "../AppProvider";
import { errMsg } from "@/lib/format";
import type { Team } from "@/lib/types";

/* "Help improve Overlap's automatic analysis": a club admin can let this team's tagged match clips be used to
 * train Overlap's own event-spotting model. Off by default; withdrawing deletes the team's clips. */

export function TrainingConsent({ team }: { team: Team }) {
  const { isAdmin, supabase, patch, toast } = useApp();
  const [open, setOpen] = useState(false);
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clips, setClips] = useState<number | null>(null);
  const on = !!team.training_opt_in;

  useEffect(() => {
    if (!on || !isAdmin) return;
    supabase
      .from("training_exports")
      .select("clips,match_id,matches!inner(team_id)")
      .eq("matches.team_id", team.id)
      .then(({ data }) => setClips(((data ?? []) as { clips: number }[]).reduce((a, r) => a + (r.clips || 0), 0)));
  }, [on, isAdmin, supabase, team.id]);

  async function turnOn() {
    setBusy(true);
    const { error } = await supabase.from("teams").update({ training_opt_in: true }).eq("id", team.id);
    setBusy(false);
    if (error) return toast(/training_opt_in/.test(error.message) ? "Run update 41 in Supabase first." : errMsg(error));
    patch((d) => ({ ...d, teams: d.teams.map((t) => (t.id === team.id ? { ...t, training_opt_in: true } : t)) }));
    setOpen(false);
    toast(`Thanks: ${team.name}'s tagged clips will help improve Overlap`);
  }
  async function withdraw() {
    if (!window.confirm(`Stop sharing ${team.name}'s clips and delete the ones already collected?`)) return;
    setBusy(true);
    const res = await fetch("/api/training/withdraw", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ team_id: team.id }) });
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    setBusy(false);
    if (!j.ok) return toast(j.error || "Couldn't withdraw.");
    patch((d) => ({ ...d, teams: d.teams.map((t) => (t.id === team.id ? { ...t, training_opt_in: false } : t)) }));
    toast("Withdrawn. The clips are being deleted.");
  }

  if (on)
    return (
      <p className="tc-status">
        <b>Helping improve Overlap:</b> {team.name}&apos;s tagged clips are shared to train Overlap&apos;s automatic analysis
        {clips !== null ? ` (${clips} clips so far)` : ""}.{" "}
        {isAdmin && (
          <button className="linkbtn" type="button" disabled={busy} onClick={withdraw}>
            Stop and delete them
          </button>
        )}
      </p>
    );
  if (!isAdmin) return null;
  if (!open)
    return (
      <p className="tc-status">
        Help make Overlap&apos;s automatic analysis better for clubs like yours.{" "}
        <button className="linkbtn" type="button" onClick={() => setOpen(true)}>
          Find out more
        </button>
      </p>
    );
  return (
    <section className="in-card tc">
      <div className="in-h">
        <h2>Help improve Overlap&apos;s automatic analysis</h2>
      </div>
      <p>
        Today&apos;s football AI is trained on TV broadcasts of professional games, so it struggles with club footage like Veo&apos;s. Your analysts&apos; tags are exactly what&apos;s needed to teach Overlap&apos;s own model to spot shots, tackles,
        set pieces and more on club cameras.
      </p>
      <ul className="tc-list">
        <li>
          <b>What&apos;s collected:</b> for each event tagged on {team.name}&apos;s match videos, a 4-second low-resolution clip (no sound) and its label (e.g. &ldquo;shot, on target&rdquo;), plus a few clips where nothing happens. No names, shirt numbers,
          notes or contact details.
        </li>
        <li>
          <b>What it&apos;s used for:</b> only to train and test Overlap&apos;s own analysis models. Never sold, shared or used for advertising. Kept in Overlap&apos;s private storage.
        </li>
        <li>
          <b>Your control:</b> you can stop at any time here, and the team&apos;s clips are deleted.
        </li>
        <li>
          <b>Children:</b> we recommend this for adult teams. For junior teams, only switch it on if your club&apos;s filming consent covers it and families have been told.
        </li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
        <span>
          I&apos;m a club admin and I agree, on behalf of the club, to share {team.name}&apos;s tagged clips as described above. The players are covered by our filming consent.
        </span>
      </label>
      <div className="sheet-actions">
        <button className="linkbtn" type="button" onClick={() => setOpen(false)}>
          Not now
        </button>
        <span className="spacer" />
        <button className="btn primary" type="button" disabled={!agree || busy} onClick={turnOn}>
          Share {team.name}&apos;s tagged clips
        </button>
      </div>
    </section>
  );
}
