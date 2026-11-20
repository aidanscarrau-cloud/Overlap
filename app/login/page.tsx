import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/AuthShell";
import { LoginForm } from "@/components/auth/LoginForm";
import { cookies } from "next/headers";
import { LAST_CLUB_COOKIE, parseLastClub } from "@/lib/last-club";

export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next && sp.next.startsWith("/") && !sp.next.startsWith("//") ? sp.next : "/home";
  const club = parseLastClub((await cookies()).get(LAST_CLUB_COOKIE)?.value);
  return (
    <AuthShell club={club}>
      <LoginForm key={next} next={next} initialError={sp.error} startMode={sp.mode === "signup" ? "signup" : "signin"} clubName={club?.name} />
    </AuthShell>
  );
}
