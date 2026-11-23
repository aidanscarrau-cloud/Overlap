import "server-only";

/* Veo match links. Public Veo matches expose their video through the same web API the Veo site uses.
 * This isn't an official, documented API: Veo can change or block it, so it's an optional shortcut.
 * Coaches can always download the video from Veo and upload it instead. */

const SLUG = /^https:\/\/app\.veo\.co\/matches\/([a-z0-9-]{8,200})\/?(?:[?#].*)?$/i;

export function veoSlug(url: string) {
  return url.trim().match(SLUG)?.[1] ?? null;
}

type VeoVideo = { availability?: string; mime_type?: string; render_type?: string; url?: string; width?: number };

/** The match video's address, or why it can't be used. */
export async function veoVideo(slug: string): Promise<{ ok: true; url: string; title: string; size: number } | { ok: false; error: string }> {
  const base = `https://app.veo.co/api/app/matches/${encodeURIComponent(slug)}/`;
  const opts = { headers: { accept: "application/json", "user-agent": "Overlap match review" }, cache: "no-store" as const, signal: AbortSignal.timeout(15000) };
  let meta: Response, vids: Response;
  try {
    [meta, vids] = await Promise.all([fetch(base, opts), fetch(`${base}videos/`, opts)]);
  } catch {
    return { ok: false, error: "Couldn't reach Veo. Try again, or download the video from Veo and upload it." };
  }
  if (vids.status === 401 || vids.status === 403 || vids.status === 404)
    return { ok: false, error: "This match isn't shared publicly on Veo, so Overlap can't open it. Download it from Veo (Library → ⋯ → Download) and upload the file instead." };
  if (!vids.ok) return { ok: false, error: "Veo didn't return the video. Download it from Veo and upload it instead." };
  const list = ((await vids.json().catch(() => [])) as VeoVideo[]).filter((v) => v.availability === "available" && v.mime_type === "video/mp4" && typeof v.url === "string");
  const pick = list.find((v) => v.render_type === "standard") ?? list.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0];
  // Only ever hand the worker a Veo video address.
  if (!pick?.url || !/^https:\/\/c\.veocdn\.com\/[^\s]+\.mp4$/.test(pick.url)) return { ok: false, error: "Couldn't find a full-match video for this Veo link." };
  const title = meta.ok ? String(((await meta.json().catch(() => ({}))) as { title?: string }).title ?? "") : "";
  let size = 0;
  try {
    const h = await fetch(pick.url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
    size = Number(h.headers.get("content-length") ?? 0);
  } catch {
    /* size is only for display */
  }
  return { ok: true, url: pick.url, title, size };
}
