import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendClubMessage } from "@/lib/email-server";
import { dateLine, tidyName, type PublicTrial } from "@/lib/trials";

// Public trial sign-up. The database checks everything (open, agreements, required details);
// this route then emails the family a confirmation with the trial dates.
export async function POST(request: NextRequest) {
  let body: { slug?: string; form?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Something went wrong. Please try again." }, { status: 400 });
  }
  const slug = String(body.slug ?? "").slice(0, 40);
  const f = body.form ?? {};
  const name = tidyName(String(f.full_name ?? ""));
  const form: Record<string, unknown> = { ...f, full_name: name, parent_name: tidyName(String(f.parent_name ?? "")) };
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_trial_eoi", { p_slug: slug, p: form });
  if (error) return NextResponse.json({ ok: false, error: error.message.replace(/^.*?: /, "") });

  const { data: t } = await supabase.rpc("trial_public", { p_slug: slug });
  const trial = t as PublicTrial | null;
  const to = String(form.parent_email ?? "").trim();
  if (trial && to) {
    const siteUrl = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const first = name.split(" ")[0];
    try {
      await sendClubMessage({
        to,
        club: trial.club,
        siteUrl,
        kicker: "Trial sign-up received",
        subject: `${first} is signed up for ${trial.title}`,
        greeting: `Hi ${String(form.parent_name).split(" ")[0] || "there"},`,
        paragraphs: [
          `Thanks for signing ${first} up for ${trial.title} with ${trial.club.name}.`,
          trial.dates.length ? "Here are the trial dates. Please arrive 10 minutes early with boots, shin pads and a water bottle." : "We'll be in touch with the trial dates soon.",
        ],
        rows: trial.dates.map((x, i) => ({ label: `Trial ${i + 1}`, value: dateLine(x) })),
        footer: `You're getting this because you signed up for trials with ${trial.club.name}.`,
      });
    } catch {
      // The sign-up is saved either way; the email is a nicety.
    }
  }
  return NextResponse.json({ ok: true });
}
