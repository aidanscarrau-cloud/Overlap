import { NextResponse, type NextRequest } from "next/server";
import { mailer } from "@/lib/email-server";

// "Book a demo" from the public front page. Emails the enquiry to CONTACT_EMAIL (set in Vercel), or failing that
// to the address emails are sent from. Never shown on the page.
const recent = new Map<string, number[]>();

export async function POST(request: NextRequest) {
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "?";
  const now = Date.now();
  const hits = (recent.get(ip) ?? []).filter((t) => now - t < 3600_000);
  if (hits.length >= 5) return NextResponse.json({ ok: false, error: "Too many messages. Please try again later." }, { status: 429 });
  recent.set(ip, [...hits, now]);

  let b: Record<string, unknown>;
  try {
    b = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const s = (k: string, n: number) => String(b[k] ?? "").replace(/[\r\n]+/g, k === "message" ? "\n" : " ").trim().slice(0, n);
  if (s("website", 200)) return NextResponse.json({ ok: true }); // a bot filled in the hidden field
  const support = b.kind === "support";
  const topic = s("topic", 60);
  const name = s("name", 80), club = s("club", 100), email = s("email", 120), phone = s("phone", 30), teams = s("teams", 40), message = s("message", 2000);
  if (name.length < 2 || (!support && club.length < 2)) return NextResponse.json({ ok: false, error: support ? "Please add your name." : "Please add your name and club." });
  if (support && message.length < 5) return NextResponse.json({ ok: false, error: "Please tell us what you need help with." });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ ok: false, error: "Please check your email address." });

  const t = mailer();
  const from = (process.env.EMAIL_FROM || process.env.SMTP_USER || "").trim();
  const fromAddr = from.match(/<([^>]+)>/)?.[1] ?? from;
  const to = (process.env.CONTACT_EMAIL || fromAddr).trim();
  if (!t || !to) return NextResponse.json({ ok: false, error: "Sorry, the contact form isn't set up yet." });
  try {
    await t.sendMail({
      from: `"Overlap website" <${fromAddr}>`,
      to,
      replyTo: `"${name.replace(/["<>]/g, "")}" <${email}>`,
      subject: (support ? `Support: ${topic || "Help"}${club ? ` (${club})` : ""}` : `Demo request: ${club}`).slice(0, 150),
      text: [support ? `Topic: ${topic}` : "", `Name: ${name}`, club && `Club: ${club}`, `Email: ${email}`, phone && `Phone: ${phone}`, teams && `Teams: ${teams}`, "", message || "(no message)", "", "Reply to this email to answer them directly."].filter((x) => x !== "").join("\n"),
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Couldn't send right now. Please try again in a minute." });
  }
  return NextResponse.json({ ok: true });
}
