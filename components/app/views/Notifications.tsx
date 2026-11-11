"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "../AppProvider";
import { timeAgo } from "./Announcements";
import { errMsg } from "@/lib/format";
import { isIos, isStandalone, pushState, subscribeDevice, unsubscribeDevice, type PushState } from "@/lib/push-client";
import type { AppNotification, NotificationKind, NotificationPrefs } from "@/lib/types";

const ICON: Record<NotificationKind, string> = {
  session_new: "i-cal",
  session_changed: "i-cal",
  session_cancelled: "i-cal",
  reply_reminder: "i-clock",
  announcement: "i-megaphone",
  evaluation: "i-target",
  goal: "i-target",
};

export function Notifications() {
  const { data, supabase, patch } = useApp();
  const router = useRouter();
  const list = data.notifications;
  // Remember which were new when the page opened, so they stay highlighted while you read.
  const [fresh] = useState(() => new Set(list.filter((n) => !n.read_at).map((n) => n.id)));

  // Opening the inbox counts as reading it.
  useEffect(() => {
    const ids = list.filter((n) => !n.read_at).map((n) => n.id);
    if (!ids.length) return;
    const now = new Date().toISOString();
    patch((d) => ({ ...d, notifications: d.notifications.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)) }));
    supabase.from("notifications").update({ read_at: now }).in("id", ids).then(() => {});
  }, [list, patch, supabase]);

  const clubName = (id: string) => data.clubs.find((c) => c.id === id)?.name;
  const multiClub = data.clubs.length > 1;

  function openItem(n: AppNotification) {
    if (n.club_id !== data.club.id) {
      document.cookie = `overlap-club=${n.club_id}; path=/; max-age=31536000; samesite=lax`;
      document.cookie = "overlap-team=; path=/; max-age=0";
    }
    router.push(n.url);
    if (n.club_id !== data.club.id) router.refresh();
  }

  return (
    <>
      <div className="phead">
        <div>
          <div className="eyebrow">{data.club.name}</div>
          <h1>Notifications</h1>
        </div>
      </div>
      <div className="notif-page">
        <PushCard />
        <section aria-label="Inbox">
          {list.length === 0 ? (
            <p className="notif-empty">Nothing yet. You&apos;ll see new sessions, changes, club news and reminders here.</p>
          ) : (
            <ul className="notif-list">
              {list.map((n) => (
                <li key={n.id}>
                  <button type="button" className="notif-item" data-new={fresh.has(n.id) || undefined} onClick={() => openItem(n)}>
                    <svg className="i" aria-hidden="true">
                      <use href={`#${ICON[n.kind] ?? "i-bell"}`} />
                    </svg>
                    <span className="notif-text">
                      <b>{n.title}</b>
                      {n.body && <span>{n.body}</span>}
                      <small>
                        {timeAgo(n.created_at)}
                        {multiClub && clubName(n.club_id) ? ` · ${clubName(n.club_id)}` : ""}
                      </small>
                    </span>
                    {fresh.has(n.id) && <span className="notif-dot" aria-label="New" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
        <PrefsCard />
      </div>
    </>
  );
}

/** Turn phone notifications on for this device, with help for iPhones that need the app installed first. */
export function PushCard() {
  const { supabase, toast } = useApp();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    pushState().then(setState);
  }, []);

  async function turnOn() {
    setBusy(true);
    try {
      const sub = await subscribeDevice();
      const { error } = await supabase.rpc("save_push_subscription", { p_endpoint: sub.endpoint, p_p256dh: sub.p256dh, p_auth: sub.auth, p_user_agent: navigator.userAgent });
      if (error) throw error;
      setState("on");
      toast("Notifications are on for this device");
    } catch (e) {
      toast(e instanceof Error ? e.message : errMsg(e));
      setState(await pushState());
    }
    setBusy(false);
  }
  async function turnOff() {
    setBusy(true);
    const endpoint = await unsubscribeDevice().catch(() => null);
    if (endpoint) await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    setState("off");
    setBusy(false);
    toast("Notifications are off for this device");
  }

  if (state === null || state === "unsupported") return null;
  return (
    <section className="notif-card">
      {state === "needs-install" && (
        <>
          <b>Get notifications on your iPhone</b>
          <p>
            First add Overlap to your home screen: tap the Share button <ShareGlyph /> at the bottom of Safari, then <b>Add to Home Screen</b>. Open Overlap from the new icon and
            come back here to turn notifications on.
          </p>
        </>
      )}
      {state === "denied" && (
        <>
          <b>Notifications are blocked</b>
          <p>Your phone or browser is blocking them for Overlap. Allow notifications for this site in its settings, then reload this page.</p>
        </>
      )}
      {state === "off" && (
        <>
          <b>Get a notification when something changes</b>
          <p>New and cancelled sessions, club news, and a reminder the evening before if you haven&apos;t replied.</p>
          <div>
            <button className="btn primary" type="button" disabled={busy} onClick={turnOn}>
              Turn on notifications
            </button>
          </div>
        </>
      )}
      {state === "on" && (
        <div className="notif-on">
          <span>Notifications are on for this device.</span>
          <button className="btn" type="button" disabled={busy} onClick={turnOff}>
            Turn off
          </button>
        </div>
      )}
    </section>
  );
}

const PREF_ROWS: { key: keyof NotificationPrefs; label: string; hint: string; staff?: boolean; family?: boolean }[] = [
  { key: "sessions", label: "Sessions", hint: "New, moved or cancelled sessions" },
  { key: "announcements", label: "Club news", hint: "New announcements" },
  { key: "reminders", label: "Reply reminders", hint: "The evening before, if you haven't said if you're coming", family: true },
  { key: "development", label: "Development", hint: "New reviews and goals", family: true },
];

function PrefsCard() {
  const { data, supabase, patch, toast } = useApp();
  const family = data.role === "player" || data.role === "parent";
  const prefs = data.notificationPrefs;
  const rows = PREF_ROWS.filter((r) => !r.family || family);

  async function flip(key: keyof NotificationPrefs) {
    const next = { ...prefs, [key]: !prefs[key] };
    patch((d) => ({ ...d, notificationPrefs: next }));
    const { error } = await supabase.from("notification_prefs").upsert({ user_id: data.userId, ...next, updated_at: new Date().toISOString() });
    if (error) {
      patch((d) => ({ ...d, notificationPrefs: prefs }));
      toast(errMsg(error));
    }
  }

  return (
    <section className="notif-prefs" aria-labelledby="notif-prefs-h">
      <h2 id="notif-prefs-h">Send to my phone</h2>
      <p className="notif-muted">Everything still shows up in this list; these only choose what buzzes your phone.</p>
      <ul>
        {rows.map((r) => (
          <li key={r.key}>
            <span>
              <b id={`pref-${r.key}`}>{r.label}</b>
              <small>{r.hint}</small>
            </span>
            <button type="button" className="switch" role="switch" aria-checked={prefs[r.key]} aria-labelledby={`pref-${r.key}`} onClick={() => flip(r.key)}>
              <i />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function ShareGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-label="Share" style={{ verticalAlign: "-3px", fill: "none", stroke: "currentColor", strokeWidth: 1.8 }}>
      <path d="M12 3v12M8 7l4-4 4 4M6 11v9h12v-9" />
    </svg>
  );
}

/** A small, dismissible nudge on the home page for phones that haven't installed the app. */
export function InstallHint() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem("overlap-install-hint") === "no";
    } catch {}
    const phone = window.matchMedia("(max-width: 860px)").matches;
    setShow(phone && !isStandalone() && !dismissed);
  }, []);
  if (!show) return null;
  function dismiss() {
    try {
      localStorage.setItem("overlap-install-hint", "no");
    } catch {}
    setShow(false);
  }
  return (
    <aside className="notif-card install-hint" aria-label="Install Overlap">
      <b>Add Overlap to your home screen</b>
      <p>
        {isIos() ? (
          <>
            Tap Share <ShareGlyph /> in Safari, then <b>Add to Home Screen</b>. It opens like an app and can send you notifications.
          </>
        ) : (
          <>Open your browser menu (⋮) and choose <b>Install app</b> or <b>Add to Home screen</b>. It opens like an app and can send you notifications.</>
        )}
      </p>
      <div>
        <button className="btn" type="button" onClick={dismiss}>
          Not now
        </button>
      </div>
    </aside>
  );
}
