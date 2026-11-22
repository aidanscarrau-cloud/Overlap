"use client";

import { useEffect, useState } from "react";

const TOPICS = ["Help using Overlap", "Something isn't working", "Privacy request", "Billing or my club's account", "Something else"];

/** "Book a demo" on the front page, or kind="support" for the help page. Goes to Overlap by email; no address is shown. */
export function ContactForm({ kind = "demo" }: { kind?: "demo" | "support" }) {
  const support = kind === "support";
  const [f, setF] = useState({ name: "", club: "", email: "", phone: "", teams: "", message: "", website: "", topic: TOPICS[0] });
  useEffect(() => {
    if (support && /privacy/i.test(window.location.hash + window.location.search)) setF((x) => ({ ...x, topic: "Privacy request" }));
  }, [support]);
  const [state, setState] = useState<{ busy?: boolean; ok?: boolean; err?: string }>({});
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setState({ busy: true });
    try {
      const r = await fetch("/api/contact", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...f, kind }) });
      const j = (await r.json()) as { ok: boolean; error?: string };
      setState(j.ok ? { ok: true } : { err: j.error ?? "Something went wrong. Please try again." });
    } catch {
      setState({ err: "Couldn't send. Check your connection and try again." });
    }
  }
  if (state.ok)
    return (
      <div className="lp-form lp-sent" role="status">
        <b>{support ? "Thanks, we've got your message." : "Thanks, your founding spot request is in."}</b>
        <p>{support ? "We usually reply by email within a day." : "Aidan will be in touch personally, usually within a day."}</p>
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
          <span>Club{support ? " (optional)" : ""}</span>
          <input className="input" required={!support} maxLength={100} autoComplete="organization" value={f.club} onChange={set("club")} />
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
      {support ? (
        <label className="field">
          <span>What&apos;s it about?</span>
          <select className="input" value={f.topic} onChange={(e) => setF((x) => ({ ...x, topic: e.target.value }))}>
            {TOPICS.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </select>
        </label>
      ) : (
        <label className="field">
          <span>Roughly how many teams? (optional)</span>
          <input className="input" maxLength={40} value={f.teams} onChange={set("teams")} placeholder="e.g. 12 junior, 3 senior" />
        </label>
      )}
      <label className="field">
        <span>{support ? "Your message" : "Anything you'd like to know? (optional)"}</span>
        <textarea className="input" rows={support ? 5 : 3} required={support} maxLength={2000} value={f.message} onChange={set("message")} />
      </label>
      {/* Left empty by people; filled in by spam bots. */}
      <input className="lp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website} onChange={set("website")} />
      {state.err && (
        <p className="tp-err" role="alert">
          {state.err}
        </p>
      )}
      <button className="btn primary lp-big" disabled={state.busy}>
        {state.busy ? "Sending…" : support ? "Send message" : "Claim my founding spot"}
      </button>
    </form>
  );
}
