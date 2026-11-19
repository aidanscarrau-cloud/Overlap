import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { TrialSignup, TrialFrame } from "@/components/trials/Public";
import type { PublicTrial } from "@/lib/trials";

async function load(slug: string) {
  const supabase = await createClient();
  const { data } = await supabase.rpc("trial_public", { p_slug: slug.slice(0, 40) });
  return (data as PublicTrial | null) ?? null;
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const t = await load((await params).slug);
  return { title: t ? `${t.title} · ${t.club.name}` : "Trials", robots: { index: false } };
}

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const trial = await load(slug);
  if (!trial)
    return (
      <TrialFrame club={null}>
        <div className="tp-card">
          <h1>Link not found</h1>
          <p>This trial sign-up link isn&apos;t valid. Please check it with the club.</p>
        </div>
      </TrialFrame>
    );
  return (
    <TrialFrame club={trial.club}>
      <TrialSignup slug={slug} trial={trial} />
    </TrialFrame>
  );
}
