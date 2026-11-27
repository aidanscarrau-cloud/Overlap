import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { mailer, sendClubMessage } from "@/lib/email-server";
import { dateLine } from "@/lib/trials";
import { notSelectedEmail, offerEmail, welcomeEmail } from "@/lib/trial-emails";

type Kind = "offer" | "not_selected" | "details" | "test";
type Row = { id: string; trial_id: string; full_name: string; parent_name: string; parent_email: string; player_email: string; offer_token: string; status: string };

// Coaches email triallists' families: trial details, an offer (with accept/decline buttons), or
// "not this time". Runs as the signed-in coach, so the database decides what they may see and change.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  let body: { ids?: string[]; kind?: Kind; message?: string; trial?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request." }, { status: 400 });
  }
  const kind = body.kind;
  const ids = (body.ids ?? []).filter((x) => typeof x === "string").slice(0, 200);
  const message = String(body.message ?? "").trim().slice(0, 1500);
  if (!mailer()) return NextResponse.json({ ok: false, error: "Email isn't set up on the server yet." });
  if (kind === "test") return sendTest(request, supabase, auth.user, String(body.trial ?? ""), message);
  if (!kind || !["offer", "not_selected", "details"].includes(kind) || !ids.length) return NextResponse.json({ ok: false, error: "Nothing to send." });

  const { data: rows } = await supabase.from("trial_applicants").select("id,trial_id,full_name,parent_name,parent_email,player_email,offer_token,status").in("id", ids);
  const list = (rows ?? []) as Row[];
  if (!list.length) return NextResponse.json({ ok: false, error: "Couldn't find those triallists." });
  const trialId = list[0].trial_id;
  if (list.some((r) => r.trial_id !== trialId)) return NextResponse.json({ ok: false, error: "Send to one trial at a time." });
  const t = await loadTrial(supabase, trialId);
  if (!t) return NextResponse.json({ ok: false, error: "Trial not found." });
  const { trial, team, club } = t;
  const { data: dates } = await supabase.from("trial_dates").select("date,start_time,end_time,location").eq("trial_id", trialId).order("date");
  const siteUrl = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  const coach = (auth.user.user_metadata?.full_name as string | undefined) ?? "";

  // Offers and "not this time" change where each triallist is up to. Only coaches who run the team's trials can.
  const now = new Date().toISOString();
  const send = list.filter((r) => r.parent_email && !(kind !== "details" && ["accepted", "declined"].includes(r.status)));
  if (kind !== "details" && send.length) {
    const patch = kind === "offer" ? { status: "offered", offered_at: now } : { status: "not_selected" };
    const { data: changed, error } = await supabase.from("trial_applicants").update(patch).in("id", send.map((r) => r.id)).select("id");
    if (error || (changed ?? []).length !== send.length) return NextResponse.json({ ok: false, error: error?.message ?? "Only coaches who run this team's trials can send offers." });
  }

  let sent = 0;
  const failed: string[] = [];
  for (const r of send) {
    const first = r.full_name.split(" ")[0];
    const hi = `Hi ${r.parent_name.split(" ")[0] || "there"},`;
    const extra = message ? [message] : [];
    const sign = coach ? `${coach}, ${club.name}` : club.name;
    try {
      if (kind === "offer") {
        await sendClubMessage(
          offerEmail({ to: r.parent_email, cc: r.player_email || undefined, replyTo: auth.user.email ?? undefined, club, siteUrl, player: r.full_name, parentName: r.parent_name, team, trialTitle: trial.title, url: `${siteUrl}/t/offer/${r.offer_token}`, message, coach }),
        );
      } else if (kind === "not_selected") {
        await sendClubMessage(
          notSelectedEmail({ to: r.parent_email, cc: r.player_email || undefined, replyTo: auth.user.email ?? undefined, club, siteUrl, player: r.full_name, parentName: r.parent_name, team, trialTitle: trial.title, message, coach }),
        );
      } else {
        await sendClubMessage({
          to: r.parent_email,
          cc: r.player_email || undefined,
          replyTo: auth.user.email ?? undefined,
          club,
          siteUrl,
          kicker: "Trial details",
          subject: `${trial.title}: trial details for ${first}`,
          greeting: hi,
          paragraphs: [`${first} is registered for ${trial.title}.`, ...extra, (dates ?? []).length ? "Here are the dates. Please arrive 10 minutes early with boots, shin pads and a water bottle." : "We'll send the dates soon.", `– ${sign}`],
          rows: (dates ?? []).map((x, i) => ({ label: `Trial ${i + 1}`, value: dateLine({ date: x.date, start: x.start_time, end: x.end_time, location: x.location }) })),
          footer: `You're getting this because you registered for trials with ${club.name}.`,
        });
      }
      sent++;
      await supabase.from("trial_applicants").update({ last_emailed: kind, last_emailed_at: new Date().toISOString() }).eq("id", r.id);
    } catch {
      failed.push(r.full_name);
    }
  }
  return NextResponse.json({ ok: true, sent, skipped: list.length - send.length, failed });
}

type Supa = Awaited<ReturnType<typeof createClient>>;
async function loadTrial(supabase: Supa, id: string) {
  const { data: trial } = await supabase.from("trials").select("id,title,slug,team_id,club_id,teams(name),clubs(name,logo_url,brand_primary,brand_accent)").eq("id", id).maybeSingle();
  if (!trial) return null;
  type One<T> = T | T[] | null;
  const one = <T,>(x: One<T>) => (Array.isArray(x) ? x[0] : x);
  const team = one(trial.teams as One<{ name: string }>)?.name ?? "";
  const c = one(trial.clubs as One<{ name: string; logo_url: string | null; brand_primary: string | null; brand_accent: string | null }>);
  return { trial, team, club: { name: c?.name ?? "Your club", logo: c?.logo_url, primary: c?.brand_primary, accent: c?.brand_accent } };
}

// Sends the coach (only ever their own address) the offer, welcome and "not this time" emails exactly as a family
// would get them, with links to a preview page that doesn't change anything.
async function sendTest(request: NextRequest, supabase: Supa, user: { email?: string; user_metadata?: Record<string, unknown> }, trialId: string, message: string) {
  if (!user.email) return NextResponse.json({ ok: false, error: "Your account has no email address." });
  const t = await loadTrial(supabase, trialId);
  if (!t) return NextResponse.json({ ok: false, error: "Trial not found." });
  const siteUrl = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
  const coach = (user.user_metadata?.full_name as string | undefined) ?? "";
  const me = coach.split(" ")[0] || "Coach";
  const common = { to: user.email, club: t.club, siteUrl, player: "Sam Example", parentName: me, team: t.team, test: true };
  try {
    await sendClubMessage(offerEmail({ ...common, trialTitle: t.trial.title, url: `${siteUrl}/t/offer/preview?t=${t.trial.slug}`, message, coach }));
    await sendClubMessage(welcomeEmail({ ...common, code: "SAMPLE12" }));
    await sendClubMessage(notSelectedEmail({ ...common, trialTitle: t.trial.title, coach }));
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
  return NextResponse.json({ ok: true, sent: 3, to: user.email });
}
