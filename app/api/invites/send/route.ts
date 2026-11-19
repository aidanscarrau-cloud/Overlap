import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mailer, sendClubMessage } from "@/lib/email-server";
import { welcomeEmail } from "@/lib/trial-emails";

// Emails parent invites made by the player import. Runs as the signed-in staff member: they can only send
// invites the database lets them see (their own club and teams). Small batches keep each request quick.
type Item = { code: string; email: string; parent_name?: string };

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!mailer()) return NextResponse.json({ ok: false, error: "Email isn't set up on the server yet." });
  let body: { items?: Item[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const items = (body.items ?? []).filter((i) => typeof i?.code === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(i.email ?? "").trim())).slice(0, 25);
  if (!items.length) return NextResponse.json({ ok: true, sent: 0, failed: [] });
  const { data: rows } = await supabase
    .from("invites")
    .select("code,club_id,players(full_name),teams(name),clubs(name,logo_url,brand_primary,brand_accent)")
    .in("code", items.map((i) => i.code.toUpperCase()));
  type One<T> = T | T[] | null;
  const one = <T,>(x: One<T>) => (Array.isArray(x) ? x[0] : x);
  const byCode = new Map((rows ?? []).map((r) => [r.code as string, r]));
  const siteUrl = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  let sent = 0;
  const failed: string[] = [];
  for (const it of items) {
    const r = byCode.get(it.code.toUpperCase());
    if (!r) {
      failed.push(it.email);
      continue;
    }
    const c = one(r.clubs as One<{ name: string; logo_url: string | null; brand_primary: string | null; brand_accent: string | null }>);
    try {
      await sendClubMessage(
        welcomeEmail({
          to: it.email.trim(),
          club: { name: c?.name ?? "Your club", logo: c?.logo_url, primary: c?.brand_primary, accent: c?.brand_accent },
          siteUrl,
          player: one(r.players as One<{ full_name: string }>)?.full_name ?? "your player",
          parentName: String(it.parent_name ?? ""),
          team: one(r.teams as One<{ name: string }>)?.name ?? "the team",
          code: r.code as string,
          mode: "invite",
        }),
      );
      sent++;
    } catch {
      failed.push(it.email);
    }
  }
  return NextResponse.json({ ok: true, sent, failed });
}
