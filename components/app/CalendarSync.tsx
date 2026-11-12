"use client";

import { useState } from "react";
import { useApp } from "./AppProvider";
import { ConfirmButton } from "./sheets/SheetFrame";
import { errMsg } from "@/lib/format";
import { isIos } from "@/lib/push-client";

/** "Add to my phone calendar": a private link that calendar apps check for new and changed sessions. */
export function CalendarSync() {
  const { data, supabase, toast } = useApp();
  const [openPanel, setOpenPanel] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setErr("");
    const got = await supabase.from("calendar_feeds").select("token").eq("user_id", data.userId).maybeSingle();
    if (got.error) return setErr(errMsg(got.error));
    if (got.data) return setToken(got.data.token as string);
    const made = await supabase.from("calendar_feeds").insert({ user_id: data.userId }).select("token").single();
    if (made.error) return setErr(errMsg(made.error));
    setToken(made.data.token as string);
  }
  async function reset() {
    setBusy(true);
    await supabase.from("calendar_feeds").delete().eq("user_id", data.userId);
    setToken(null);
    await load();
    setBusy(false);
    toast("New link made. The old one has stopped working.");
  }

  const host = typeof window === "undefined" ? "" : window.location.host;
  const https = token ? `https://${host}/api/calendar/${token}.ics` : "";
  const webcal = token ? `webcal://${host}/api/calendar/${token}.ics` : "";
  async function copy() {
    try {
      await navigator.clipboard.writeText(https);
      toast("Calendar link copied");
    } catch {
      toast("Copy didn't work. Press and hold the link to copy it.");
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn"
        aria-expanded={openPanel}
        onClick={() => {
          setOpenPanel(!openPanel);
          if (!token) load();
        }}
      >
        Add to phone calendar
      </button>
      {openPanel && (
        <div className="calsync" role="region" aria-label="Add sessions to your calendar">
          <b>Put {data.role === "parent" ? "your child's" : data.role === "player" ? "your" : "your teams'"} sessions in your phone&apos;s calendar</b>
          <p>New, moved and cancelled sessions update by themselves (calendar apps check every few hours).</p>
          {err ? (
            <p className="notice bad">Couldn&apos;t make your calendar link: {err}</p>
          ) : !token ? (
            <p className="muted">Making your link…</p>
          ) : (
            <>
              <div className="calsync-actions">
                <a className="btn primary" href={webcal}>
                  {isIos() ? "Add to iPhone Calendar" : "Add to Apple Calendar"}
                </a>
                <button type="button" className="btn" onClick={copy}>
                  Copy link for Google Calendar
                </button>
              </div>
              <details className="calsync-help">
                <summary>Using Google Calendar or Android?</summary>
                <ol>
                  <li>Tap <b>Copy link for Google Calendar</b>.</li>
                  <li>On a computer, open calendar.google.com. Next to <b>Other calendars</b>, click <b>+</b>, then <b>From URL</b>.</li>
                  <li>Paste the link and click <b>Add calendar</b>. It then shows on your Android phone too.</li>
                </ol>
              </details>
              <input className="input calsync-url" readOnly value={https} aria-label="Your calendar link" onFocus={(e) => e.currentTarget.select()} />
              <p className="calsync-note">
                This link is private to you: anyone who has it can see your session times and places, so don&apos;t share it.{" "}
                <ConfirmButton className="btn sm" label="Make a new link" onConfirm={reset} disabled={busy} />
              </p>
            </>
          )}
        </div>
      )}
    </>
  );
}
