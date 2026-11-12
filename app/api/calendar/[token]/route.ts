import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/push-server";

// A private calendar feed (iCalendar) for phone and Google calendars. The long random token in the
// address is the only key, so it's checked on the server; session notes are never included.
type Row = { id: string; club: string; team: string; title: string; location: string; focus: string; starts: string; mins: number; updated: string };

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/([,;])/g, "\\$1");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
/** Lines longer than 75 bytes are folded, as the format requires. */
function fold(line: string) {
  const out: string[] = [];
  let cur = "";
  for (const ch of line) {
    if (Buffer.byteLength(cur + ch) > 74) {
      out.push(cur);
      cur = " " + ch;
    } else cur += ch;
  }
  out.push(cur);
  return out.join("\r\n");
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const token = raw.replace(/\.ics$/i, "");
  if (!/^[a-f0-9]{32,80}$/.test(token)) return new NextResponse("Not found", { status: 404 });
  const db = serviceClient();
  if (!db) return new NextResponse("Calendar links aren't set up on this site yet.", { status: 503 });
  const { data, error } = await db.rpc("calendar_feed", { p_token: token });
  if (error) return new NextResponse("Something went wrong.", { status: 500 });
  const rows = (data ?? []) as Row[];

  const clubs = [...new Set(rows.map((r) => r.club))];
  const site = request.nextUrl.origin;
  const now = stamp(new Date());
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Overlap//Sessions//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(clubs.length === 1 ? `${clubs[0]} sessions` : "Football sessions")}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT2H",
    "X-PUBLISHED-TTL:PT2H",
  ];
  for (const r of rows) {
    const start = new Date(r.starts);
    const end = new Date(start.getTime() + (r.mins > 0 ? r.mins : 90) * 60000);
    lines.push(
      "BEGIN:VEVENT",
      `UID:${r.id}@overlap`,
      `DTSTAMP:${now}`,
      `LAST-MODIFIED:${stamp(new Date(r.updated))}`,
      `DTSTART:${stamp(start)}`,
      `DTEND:${stamp(end)}`,
      fold(`SUMMARY:${esc(`${r.team}: ${r.title}`)}`),
      ...(r.location ? [fold(`LOCATION:${esc(r.location)}`)] : []),
      fold(`DESCRIPTION:${esc([r.focus && `Focus: ${r.focus}`, `Reply and see the plan: ${site}/sessions`].filter(Boolean).join("\n"))}`),
      `URL:${site}/sessions`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n") + "\r\n", {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="sessions.ics"',
      "cache-control": "private, max-age=900",
    },
  });
}
