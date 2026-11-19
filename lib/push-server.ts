import "server-only";
import webpush from "web-push";
import { createClient as createSupabase } from "@supabase/supabase-js";
import { mailer, sendNotificationEmail, type EmailItem } from "./email-server";

/**
 * Sends waiting notifications to people's phones and computers, and by email.
 * Runs on the server only, with the service key (never sent to browsers).
 */
export function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabase(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

let vapidReady = false;
function setupVapid() {
  if (vapidReady) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  // Apple rejects notifications whose sender ("subject") is a made-up address, so fall back to the site's own https address.
  const site = (process.env.SITE_URL || "").replace(/\/$/, "");
  const given = (process.env.VAPID_SUBJECT || "").trim();
  const subject = /^mailto:[^@\s]+@[^@\s]+\.[a-z]{2,}$/i.test(given) && !/\.(example|test|local|invalid)$/i.test(given) ? given : /^https:\/\//.test(given) ? given : /^https:\/\//.test(site) ? site : "https://overlap-three-pi.vercel.app";
  webpush.setVapidDetails(subject, pub, priv);
  vapidReady = true;
  return true;
}

const PREF_FOR_KIND: Record<string, "sessions" | "announcements" | "reminders" | "development" | "messages"> = {
  session_new: "sessions",
  injury: "sessions",
  trial: "sessions",
  session_changed: "sessions",
  session_cancelled: "sessions",
  announcement: "announcements",
  reply_reminder: "reminders",
  evaluation: "development",
  goal: "development",
  match_new: "sessions",
  match_changed: "sessions",
  match_cancelled: "sessions",
  squad: "sessions",
  result: "announcements",
  self_review: "development",
  self_review_done: "development",
  message: "messages",
};

type Pending = { id: string; user_id: string; club_id: string; kind: string; title: string; body: string; url: string };
type Sub = { endpoint: string; user_id: string; p256dh: string; auth: string };
type Prefs = { user_id: string; sessions: boolean; announcements: boolean; reminders: boolean; development: boolean; messages?: boolean; email?: "always" | "no_phone" | "never" };
type Result = { sent: number; emailed: number; skipped: number; removed: number; configured: boolean };

/** siteUrl is the address links in emails point to, e.g. https://overlap.vercel.app */
export async function sendPending(siteUrl: string): Promise<Result> {
  const db = serviceClient();
  const push = setupVapid();
  const mail = !!mailer();
  const none: Result = { sent: 0, emailed: 0, skipped: 0, removed: 0, configured: !!db && (push || mail) };
  if (!db || !none.configured) return none;
  siteUrl = (process.env.SITE_URL || siteUrl).replace(/\/$/, "");

  // Only recent ones: an old message arriving days late is worse than none.
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { data: pending, error } = await db
    .from("notifications")
    .select("id,user_id,club_id,kind,title,body,url")
    .is("pushed_at", null)
    .gte("created_at", since)
    .order("created_at")
    .limit(500);
  if (error) throw error;
  if (!pending?.length) return none;

  const users = [...new Set(pending.map((p) => p.user_id))];
  const [{ data: subs }, { data: prefs }] = await Promise.all([
    db.from("push_subscriptions").select("endpoint,user_id,p256dh,auth").in("user_id", users),
    db.from("notification_prefs").select("user_id,sessions,announcements,reminders,development,messages,email").in("user_id", users),
  ]);
  const subsBy = new Map<string, Sub[]>();
  (subs as Sub[] | null)?.forEach((s) => subsBy.set(s.user_id, [...(subsBy.get(s.user_id) ?? []), s]));
  const prefsBy = new Map((prefs as Prefs[] | null)?.map((p) => [p.user_id, p]) ?? []);

  let sent = 0,
    skipped = 0;
  const dead = new Set<string>();
  for (const n of pending as Pending[]) {
    const pref = prefsBy.get(n.user_id);
    const wanted = !pref || pref[PREF_FOR_KIND[n.kind] ?? "announcements"] !== false;
    const targets = wanted && push ? (subsBy.get(n.user_id) ?? []) : [];
    if (!targets.length) skipped++;
    const payload = JSON.stringify({ title: n.title, body: n.body, url: n.url, tag: n.kind + ":" + n.id });
    await Promise.all(
      targets.map(async (s) => {
        try {
          await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 12 * 3600 });
          sent++;
        } catch (e) {
          const code = (e as { statusCode?: number }).statusCode;
          if (code === 404 || code === 410) dead.add(s.endpoint); // the device unsubscribed or the app was removed
        }
      }),
    );
  }
  // Email: one message per person with everything new for them.
  let emailed = 0;
  if (mail) {
    const inbox = new Map<string, Pending[]>();
    for (const n of pending as Pending[]) {
      const pref = prefsBy.get(n.user_id);
      const how = pref?.email ?? "always";
      if (how === "never" || n.kind === "message" || (pref && pref[PREF_FOR_KIND[n.kind] ?? "announcements"] === false)) continue; // chat never goes by email
      if (how === "no_phone" && (subsBy.get(n.user_id) ?? []).some((s) => !dead.has(s.endpoint))) continue;
      inbox.set(n.user_id, [...(inbox.get(n.user_id) ?? []), n]);
    }
    if (inbox.size) {
      const clubIds = [...new Set((pending as Pending[]).map((p) => p.club_id))];
      const [{ data: contacts }, { data: clubs }] = await Promise.all([
        db.rpc("notification_contacts", { ids: [...inbox.keys()] }),
        db.from("clubs").select("id,name,logo_url,brand_primary,brand_accent").in("id", clubIds),
      ]);
      // Before the club-colours update the brand columns don't exist: fall back to name and badge.
      const clubRows = clubs ?? (await db.from("clubs").select("id,name,logo_url").in("id", clubIds)).data ?? [];
      type ClubRow = { id: string; name: string; logo_url: string | null; brand_primary?: string; brand_accent?: string };
      const clubOf = new Map((clubRows as ClubRow[]).map((c) => [c.id, c]));
      await Promise.all(
        ((contacts ?? []) as { user_id: string; email: string; full_name: string }[]).map(async (c) => {
          const items = inbox.get(c.user_id) ?? [];
          const clubsHere = [...new Set(items.map((i) => i.club_id))];
          try {
            await sendNotificationEmail({
              to: c.email,
              name: c.full_name,
              club: (() => {
                const c = clubsHere.length === 1 ? clubOf.get(clubsHere[0]) : undefined;
                return c ? { name: c.name, logo: c.logo_url, primary: c.brand_primary, accent: c.brand_accent } : { name: clubsHere.length > 1 ? "Your clubs" : "Your club" };
              })(),
              items: items.map((i): EmailItem => ({ title: i.title, body: i.body, url: i.url })),
              siteUrl,
            });
            emailed++;
          } catch (e) {
            console.error("email failed", (e as Error).message);
          }
        }),
      );
    }
  }

  // Mark everything we looked at, sent or not, so nothing is sent twice.
  await db.from("notifications").update({ pushed_at: new Date().toISOString() }).in("id", pending.map((p) => p.id));
  if (dead.size) await db.from("push_subscriptions").delete().in("endpoint", [...dead]);
  return { sent, emailed, skipped, removed: dead.size, configured: true };
}

/** A test notification to every device this person has turned notifications on for. Nothing is saved. */
export async function sendTestPush(userId: string, clubName: string) {
  const db = serviceClient();
  if (!db) return { ok: false as const, error: "Notifications aren't set up on the server yet (SUPABASE_SERVICE_ROLE_KEY in Vercel)." };
  if (!setupVapid()) return { ok: false as const, error: "Notifications aren't set up on the server yet (the VAPID keys in Vercel)." };
  const { data: subs } = await db.from("push_subscriptions").select("endpoint,p256dh,auth").eq("user_id", userId);
  if (!subs?.length) return { ok: false as const, error: "Notifications aren't turned on for any of your devices yet. Turn them on first." };
  const payload = JSON.stringify({ title: `Test from ${clubName}`, body: "Notifications are working on this device. 🎉", url: "/notifications", tag: "test" });
  let sent = 0;
  const dead: string[] = [];
  const problems: string[] = [];
  await Promise.all(
    (subs as { endpoint: string; p256dh: string; auth: string }[]).map(async (s) => {
      const where = /apple/.test(s.endpoint) ? "iPhone/iPad/Mac" : /fcm|google/.test(s.endpoint) ? "Android/Chrome" : /mozilla/.test(s.endpoint) ? "Firefox" : /windows|notify\.windows/.test(s.endpoint) ? "Edge" : "device";
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 600, urgency: "high" });
        sent++;
      } catch (e) {
        const err = e as { statusCode?: number; body?: string };
        if (err.statusCode === 404 || err.statusCode === 410) {
          dead.push(s.endpoint);
          problems.push(`${where}: that device's notification sign-up had expired, so it was removed. Turn notifications on again there.`);
        } else problems.push(`${where}: rejected (${err.statusCode ?? "no response"}${err.body ? ` ${String(err.body).slice(0, 80)}` : ""})`);
      }
    }),
  );
  if (dead.length) await db.from("push_subscriptions").delete().in("endpoint", dead);
  return { ok: true as const, sent, devices: subs.length, removed: dead.length, problems };
}
