"use client";

// Phone push, browser side: register the worker, turn push on or off for this device,
// and nudge the server to send anything new straight away.

export type PushState = "unsupported" | "needs-install" | "denied" | "off" | "on";

const VAPID = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

export function isStandalone() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}
export function isIos() {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

export async function registerWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return null;
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    return null;
  }
}

export async function pushState(): Promise<PushState> {
  if (typeof window === "undefined") return "unsupported";
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  // iPhones only allow push once the app is added to the home screen.
  if (!supported) return isIos() && !isStandalone() ? "needs-install" : "unsupported";
  if (!VAPID) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  return sub && Notification.permission === "granted" ? "on" : "off";
}

function keyBytes(base64: string) {
  const pad = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

/** Ask permission and subscribe this device. Returns the subscription for the database to store. */
export async function subscribeDevice() {
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error(permission === "denied" ? "Notifications are blocked for this site. Allow them in your phone or browser settings." : "Notifications weren't allowed.");
  const reg = (await navigator.serviceWorker.getRegistration("/")) ?? (await registerWorker());
  if (!reg) throw new Error("This browser can't receive notifications.");
  await navigator.serviceWorker.ready;
  const existing = await reg.pushManager.getSubscription();
  const sub = existing ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID) }));
  const json = sub.toJSON();
  return { endpoint: sub.endpoint, p256dh: json.keys?.p256dh ?? "", auth: json.keys?.auth ?? "" };
}

export async function unsubscribeDevice() {
  const reg = await navigator.serviceWorker.getRegistration("/");
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

/** Fire and forget: the server sends whatever notifications the last change created. */
export function pingPush() {
  fetch("/api/push/flush", { method: "POST", keepalive: true }).catch(() => {});
}
