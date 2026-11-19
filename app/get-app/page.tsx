import type { Metadata } from "next";
import { cookies } from "next/headers";
import { TrialFrame } from "@/components/trials/Public";
import { GetApp } from "@/components/install/GetApp";
import { LAST_CLUB_COOKIE, parseLastClub } from "@/lib/last-club";

export const metadata: Metadata = { title: "Get the app" };

// Step-by-step guide to putting Overlap on a phone's home screen. Works signed in or out.
export default async function Page() {
  const c = parseLastClub((await cookies()).get(LAST_CLUB_COOKIE)?.value);
  return (
    <TrialFrame club={c ? { name: c.name, logo: c.logo ?? null, primary: c.primary ?? null, accent: c.accent ?? null } : null}>
      <GetApp clubName={c?.name} />
    </TrialFrame>
  );
}
