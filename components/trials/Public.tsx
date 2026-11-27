"use client";

import { useState } from "react";
import { brandVars, DEFAULT_BRAND } from "@/lib/brand";
import { Crest } from "@/components/ui";
import { dateLine, trialDay, type PublicTrial } from "@/lib/trials";

/* Public trial pages: anyone with the link, no account needed. In the club's colours. */

type PubClub = { name: string; logo: string | null; primary: string | null; accent: string | null };
export type PublicOffer = { player: string; status: "offered" | "accepted" | "declined"; invite_code: string | null; team: string; trial: string; club: PubClub };

export function TrialFrame({ club, children }: { club: PubClub | null; children: React.ReactNode }) {
  const vars = brandVars(club?.primary ?? DEFAULT_BRAND.primary, club?.accent ?? DEFAULT_BRAND.accent) as React.CSSProperties;
  return (
    <div className="look-root tp" data-look="club" style={vars}>
      <header className="tp-top">
        {club ? <Crest url={club.logo} size={44} /> : null}
        <b>{club?.name ?? "Overlap"}</b>
      </header>
      <main className="tp-main">{children}</main>
      <footer className="tp-foot">Powered by Overlap, the club hub</footer>
    </div>
  );
}

const EMPTY = { full_name: "", dob: "", current_club: "", positions: "", parent_name: "", parent_phone: "", parent_email: "", player_phone: "", player_email: "" };
const POSITIONS = ["Goalkeeper", "Defender", "Midfielder", "Winger", "Striker"];

export function TrialSignup({ slug, trial }: { slug: string; trial: PublicTrial }) {
  const [f, setF] = useState(EMPTY);
  const [pos, setPos] = useState<string[]>([]);
  const [agreed, setAgreed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const all = trial.agreements.every((a) => agreed[a]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (!all) return setErr("Please tick every box at the end of the form.");
    setBusy(true);
    try {
      const r = await fetch("/api/trials/public/submit", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ slug, form: { ...f, positions: [...pos, f.positions].filter(Boolean).join(", "), agreed } }),
      });
      const j = (await r.json()) as { ok: boolean; error?: string };
      if (!j.ok) setErr(j.error ?? "Something went wrong. Please try again.");
      else {
        setDone(true);
        window.scrollTo({ top: 0 });
      }
    } catch {
      setErr("Couldn't send. Check your connection and try again.");
    }
    setBusy(false);
  }

  const dates = trial.dates.length > 0 && (
    <ul className="tp-dates">
      {trial.dates.map((d, i) => (
        <li key={i}>
          <b>{trialDay(d.date)}</b>
          <span>{dateLine(d).replace(`${trialDay(d.date)}, `, "")}</span>
        </li>
      ))}
    </ul>
  );

  if (done)
    return (
      <div className="tp-card tp-done">
        <div className="tp-tick" aria-hidden="true">
          ✓
        </div>
        <h1>You&apos;re signed up</h1>
        <p>
          Thanks! {f.full_name.split(" ")[0] || "Your player"} is registered for {trial.title}. We&apos;ve emailed a confirmation to {f.parent_email}.
        </p>
        {dates}
        <p className="tp-muted">Please arrive 10 minutes early with boots, shin pads and a water bottle.</p>
      </div>
    );

  return (
    <form className="tp-card" onSubmit={submit} noValidate>
      <span className="tp-kicker">{trial.team} · Trials</span>
      <h1>{trial.title}</h1>
      {trial.intro && <p className="tp-intro">{trial.intro}</p>}
      {dates}
      {!trial.open ? (
        <p className="tp-closed">Sign-ups for these trials have closed. Please contact the club if you&apos;d still like to come.</p>
      ) : (
        <>
          {trial.closes_on && <p className="tp-muted">Sign-ups close {trialDay(trial.closes_on)}.</p>}
          <fieldset>
            <legend>The player</legend>
            <label className="field">
              <span>Full name</span>
              <input className="input" required autoComplete="off" value={f.full_name} onChange={set("full_name")} maxLength={80} />
            </label>
            <div className="tp-2">
              <label className="field">
                <span>Date of birth</span>
                <input className="input" type="date" required value={f.dob} onChange={set("dob")} max={new Date().toISOString().slice(0, 10)} />
              </label>
              <label className="field">
                <span>Current club (if any)</span>
                <input className="input" value={f.current_club} onChange={set("current_club")} maxLength={80} />
              </label>
            </div>
            <div className="field">
              <span>Preferred position(s)</span>
              <div className="tp-chips">
                {POSITIONS.map((p) => (
                  <button key={p} type="button" className="chip" aria-pressed={pos.includes(p)} onClick={() => setPos((x) => (x.includes(p) ? x.filter((y) => y !== p) : [...x, p]))}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            {trial.ask_player_contact && (
              <div className="tp-2">
                <label className="field">
                  <span>Player&apos;s mobile (optional)</span>
                  <input className="input" type="tel" autoComplete="off" value={f.player_phone} onChange={set("player_phone")} maxLength={30} />
                </label>
                <label className="field">
                  <span>Player&apos;s email (optional)</span>
                  <input className="input" type="email" autoComplete="off" value={f.player_email} onChange={set("player_email")} maxLength={120} />
                </label>
              </div>
            )}
          </fieldset>
          <fieldset>
            <legend>Parent or guardian</legend>
            <label className="field">
              <span>Full name</span>
              <input className="input" required autoComplete="name" value={f.parent_name} onChange={set("parent_name")} maxLength={80} />
            </label>
            <div className="tp-2">
              <label className="field">
                <span>Mobile</span>
                <input className="input" type="tel" required autoComplete="tel" value={f.parent_phone} onChange={set("parent_phone")} maxLength={30} />
              </label>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" required autoComplete="email" value={f.parent_email} onChange={set("parent_email")} maxLength={120} />
              </label>
            </div>
          </fieldset>
          {trial.agreements.length > 0 && (
            <fieldset>
              <legend>Please confirm</legend>
              {trial.agreements.map((a) => (
                <label key={a} className="tp-agree">
                  <input type="checkbox" checked={!!agreed[a]} onChange={(e) => setAgreed((x) => ({ ...x, [a]: e.target.checked }))} />
                  <span>{a}</span>
                </label>
              ))}
            </fieldset>
          )}
          {err && (
            <p className="tp-err" role="alert">
              {err}
            </p>
          )}
          <button className="btn primary tp-send" disabled={busy}>
            {busy ? "Sending…" : "Sign up for trials"}
          </button>
          <p className="tp-muted tp-privacy">Your details are only shared with {trial.club.name}&apos;s coaches for these trials.</p>
        </>
      )}
    </form>
  );
}

export function OfferResponse({ token, offer, askDecline, preview }: { token: string; offer: PublicOffer; askDecline: boolean; preview?: boolean }) {
  const [status, setStatus] = useState(offer.status);
  const [code, setCode] = useState(offer.invite_code);
  const [confirmDecline, setConfirmDecline] = useState(askDecline);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function answer(accept: boolean) {
    if (preview) {
      setStatus(accept ? "accepted" : "declined");
      setCode(accept ? "SAMPLE12" : null);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      const r = await fetch("/api/trials/public/respond", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token, accept }) });
      const j = (await r.json()) as { ok: boolean; error?: string; status?: PublicOffer["status"]; invite_code?: string | null };
      if (!j.ok) setErr(j.error ?? "Something went wrong.");
      else {
        setStatus(j.status ?? status);
        setCode(j.invite_code ?? null);
      }
    } catch {
      setErr("Couldn't send. Check your connection and try again.");
    }
    setBusy(false);
  }

  const banner = preview ? <p className="tp-preview">Preview: this is what families see. Nothing is saved and no one is added to the squad.</p> : null;
  if (status === "accepted")
    return (
      <div className="tp-card tp-done">
        {banner}
        <div className="tp-tick" aria-hidden="true">
          ✓
        </div>
        <h1>Welcome to {offer.team}!</h1>
        <p>
          {offer.player} is now part of the team. {offer.club.name} is trialling Overlap for training times, matches and team chat. Set up your account to get started; you&apos;ll be linked to {offer.player} straight away.
        </p>
        {code && (
          <>
            <a className="btn primary tp-send" href={preview ? undefined : `/join/${code}`} aria-disabled={preview || undefined}>
              Set up my account
            </a>
            <p className="tp-muted">
              We&apos;ve also emailed you this link. A second parent can use it too. Invite code: <b>{code}</b>
            </p>
          </>
        )}
      </div>
    );
  if (status === "declined")
    return (
      <div className="tp-card">
        {banner}
        <h1>Thanks for letting us know</h1>
        <p>We&apos;ve told the coaches {offer.player} won&apos;t be taking the place. All the best, and we hope to see you again.</p>
      </div>
    );
  return (
    <div className="tp-card">
      {banner}
      <span className="tp-kicker">{offer.trial}</span>
      <h1>{offer.player} has been offered a place in {offer.team}</h1>
      <p>Congratulations! Please let {offer.club.name} know if you&apos;d like to take the place.</p>
      {err && (
        <p className="tp-err" role="alert">
          {err}
        </p>
      )}
      {confirmDecline ? (
        <div className="tp-acts">
          <p>Are you sure you want to decline the place?</p>
          <button className="btn danger" disabled={busy} onClick={() => answer(false)}>
            Yes, decline
          </button>
          <button className="btn" disabled={busy} onClick={() => setConfirmDecline(false)}>
            Go back
          </button>
        </div>
      ) : (
        <div className="tp-acts">
          <button className="btn primary tp-send" disabled={busy} onClick={() => answer(true)}>
            {busy ? "Saving…" : "Accept the place"}
          </button>
          <button className="btn" disabled={busy} onClick={() => setConfirmDecline(true)}>
            Decline
          </button>
        </div>
      )}
    </div>
  );
}
