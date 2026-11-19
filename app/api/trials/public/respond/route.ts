import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendClubMessage } from "@/lib/email-server";
import { welcomeEmail } from "@/lib/trial-emails";

type Result = { status: "accepted" | "declined"; invite_code?: string; parent_email?: string; parent_name?: string; player?: string; player_email?: string; team?: string; already?: boolean };
type Offer = { club: { name: string; logo: string | null; primary: string | null; accent: string | null } };

// A family accepts or declines a trial offer. Accepting adds the player to the team (in the
// database) and we email the family their invite to join the club on Overlap.
export async function POST(request: NextRequest) {
  let body: { token?: string; accept?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong." }, { status: 400 });
  }
  const token = String(body.token ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(token)) return NextResponse.json({ ok: false, error: "This offer link is not valid." });
  const supabase = await createClient();
  const { data: offer } = await supabase.rpc("trial_offer_public", { p_token: token });
  const { data, error } = await supabase.rpc("respond_trial_offer", { p_token: token, p_accept: !!body.accept });
  if (error) return NextResponse.json({ ok: false, error: error.message.replace(/^.*?: /, "") });
  const r = data as Result;
  if (r.status === "accepted" && !r.already && r.invite_code && r.parent_email && offer) {
    const siteUrl = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const club = (offer as Offer).club;
    try {
      await sendClubMessage(welcomeEmail({ to: r.parent_email, club, siteUrl, player: r.player ?? "", parentName: r.parent_name ?? "", team: r.team ?? "", code: r.invite_code }));
    } catch {
      // The invite still shows on the page.
    }
  }
  return NextResponse.json({ ok: true, status: r.status, invite_code: r.invite_code ?? null });
}
