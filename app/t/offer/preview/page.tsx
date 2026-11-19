import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { OfferResponse, TrialFrame } from "@/components/trials/Public";
import type { PublicTrial } from "@/lib/trials";

export const metadata: Metadata = { title: "Trial offer (preview)", robots: { index: false } };

// What a family sees when they open an offer, for coaches testing the emails. Changes nothing.
export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.rpc("trial_public", { p_slug: String(sp.t ?? "").slice(0, 40) });
  const t = data as PublicTrial | null;
  return (
    <TrialFrame club={t?.club ?? null}>
      {t ? (
        <OfferResponse token="" preview askDecline={sp.decline === "1"} offer={{ player: "Sam", status: "offered", invite_code: null, team: t.team, trial: t.title, club: t.club }} />
      ) : (
        <div className="tp-card">
          <h1>Preview not found</h1>
        </div>
      )}
    </TrialFrame>
  );
}
