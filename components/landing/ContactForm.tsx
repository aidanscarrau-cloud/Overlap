"use client";

import { useState } from "react";

export function ContactForm() {
  const [f, setF] = useState({ name: "", club: "", email: "", phone: "", teams: "", message: "", website: "" });
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; err?: string }>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    try {
      const r = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(f) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      setState(j.ok ? { ok: true } : { err: j.error ?? "Something went wrong. Please try again." });
    } catch {
      setState({ err: "Couldn't send. Check your connection and try again." });
    }
  }
  if (state.ok)
    return (
      <div className="lp-form lp-sent" role="status">
        <b>Thanks, we&apos;ll be in touch soon.</b>
        <p>We usually reply within a day.</p>
      </div>
    );
  return (
    <form className="lp-form" onSubmit={send}>
      <div className="lp-2">
        <label className="field">
          <span>Your name</span>
          <input className="input" required maxLength={80} autoComplete="name" value={f.name} onChange={set("name")} />
        </label>
        <label className="field">
          <span>Club</span>
          <input className="input" required maxLength={100} autoComplete="organization" value={f.club} onChange={set("club")} />
        </label>
      </div>
      <div className="lp-2">
        <label className="field">
          <span>Email</span>
          <input className="input" type="email" required maxLength={120} autoComplete="email" value={f.email} onChange={set("email")} />
        </label>
        <label className="field">
          <span>Phone (optional)</span>
          <input className="input" type="tel" maxLength={30} autoComplete="tel" value={f.phone} onChange={set("phone")} />
        </label>
      </div>
      <label className="field">
        <span>Roughly how many teams? (optional)</span>
        <input className="input" maxLength={40} value={f.teams} onChange={set("teams")} placeholder="e.g. 12 junior, 3 senior" />
      </label>
      <label className="field">
        <span>Anything you&apos;d like to know? (optional)</span>
        <textarea className="input" rows={3} maxLength={2000} value={f.message} onChange={set("message")} />
      </label>
      {/* Left empty by people; filled in by spam bots. */}
      <input className="lp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} />
      {state.err && (
        <p className="tp-err" role="alert">
          {state.err}
        </p>
      )}
      <button className="btn primary lp-big" disabled={state.busy}>
        {state.busy ? "Sending…" : "Book a demo"}
      </button>
    </form>
  );
}
