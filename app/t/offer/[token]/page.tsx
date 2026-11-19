import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { OfferResponse, TrialFrame, type PublicOffer } from "@/components/trials/Public";

export const metadata: Metadata = { title: "Trial offer", robots: { index: false } };

export default async function Page({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { token } = await params;
  const sp = await searchParams;
  const ok = /^[0-9a-f-]{36}$/i.test(token);
  const supabase = await createClient();
  const { data } = ok ? await supabase.rpc("trial_offer_public", { p_token: token }) : { data: null };
  const offer = data as PublicOffer | null;
  return (
    <TrialFrame club={offer?.club ?? null}>
      {offer ? (
        <OfferResponse token={token} offer={offer} askDecline={sp.decline === "1"} />
      ) : (
        <div className="tp-card">
          <h1>Link not found</h1>
          <p>This offer link isn&apos;t valid any more. Please contact the club.</p>
        </div>
      )}
    </TrialFrame>
  );
}
