import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mailer, sendNotificationEmail } from "@/lib/email-server";

// Sends the signed-in person a sample notification email from their club, so they can check email works.
// Only ever to their own address, and at most a few times (Brevo and Supabase limits still apply).
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user?.email) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  if (!mailer()) return NextResponse.json({ ok: false, error: "Email isn't set up on the server yet (SMTP_HOST, SMTP_USER and SMTP_PASS in Vercel, then redeploy)." });

  // The club they're looking at (members can read their own clubs).
  const wanted = request.cookies.get("overlap-club")?.value;
  const { data: mems } = await supabase.from("memberships").select("club_id,clubs(id,name,logo_url)").eq("user_id", user.id);
  type Row = { club_id: string; clubs: { id: string; name: string; logo_url: string | null } | { id: string; name: string; logo_url: string | null }[] | null };
  const rows = (mems ?? []) as Row[];
  const row = rows.find((m) => m.club_id === wanted) ?? rows[0];
  const c = Array.isArray(row?.clubs) ? row?.clubs[0] : row?.clubs;
  let brand: { brand_primary?: string; brand_accent?: string } = {};
  if (c) {
    const { data } = await supabase.from("clubs").select("brand_primary,brand_accent").eq("id", c.id).maybeSingle();
    brand = (data ?? {}) as typeof brand;
  }
  const siteUrl = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  const name = (user.user_metadata?.full_name as string | undefined) ?? "";
  try {
    await sendNotificationEmail({
      to: user.email,
      name,
      club: { name: c?.name ?? "Your club", logo: c?.logo_url, primary: brand.brand_primary, accent: brand.brand_accent },
      items: [{ title: "Test email from Overlap", body: "If you can read this, club emails are working. Nothing else to do.", url: "/notifications" }],
      siteUrl,
    });
    return NextResponse.json({ ok: true, to: user.email });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
