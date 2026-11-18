/*
 * The club someone last used on this device, so the sign-in page can greet them in their club's colours.
 * Only public, non-personal details: the club's name, badge address and two colours.
 */
export const LAST_CLUB_COOKIE = "overlap-last-club";
export type LastClub = { name: string; logo: string | null; primary: string; accent: string };

const hex = (s: unknown) => (typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s) ? s : null);

export function parseLastClub(raw: string | undefined | null): LastClub | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(decodeURIComponent(raw));
    const name = typeof v?.name === "string" ? v.name.trim().slice(0, 80) : "";
    const primary = hex(v?.primary);
    const accent = hex(v?.accent);
    // Badges are only ever https images (Supabase storage); anything else is ignored.
    const logo = typeof v?.logo === "string" && /^https:\/\/[^\s"'<>]+$/.test(v.logo) && v.logo.length < 600 ? v.logo : null;
    if (!name || !primary || !accent) return null;
    return { name, logo, primary, accent };
  } catch {
    return null;
  }
}

export function lastClubCookie(c: LastClub) {
  return `${LAST_CLUB_COOKIE}=${encodeURIComponent(JSON.stringify(c))}; path=/; max-age=31536000; samesite=lax`;
}
