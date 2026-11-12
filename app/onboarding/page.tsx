import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/AuthShell";
import { OnboardingForm } from "@/components/auth/OnboardingForm";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Get started" };

export default async function OnboardingPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const [{ data: profile }, { count }, { data: canCreate }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", user.id),
    supabase.rpc("new_clubs_allowed"),
  ]);
  return (
    <AuthShell>
      <OnboardingForm code={(sp.code ?? (!count ? savedInvite(user.user_metadata) : "") ?? "").toUpperCase()} name={profile?.full_name ?? ""} email={user.email ?? ""} hasClub={(count ?? 0) > 0} canCreate={canCreate !== false} />
    </AuthShell>
  );
}

/** The invite code saved on the account at sign-up (see LoginForm), so people don't have to find it again. */
function savedInvite(meta: Record<string, unknown> | undefined) {
  const c = meta?.invite_code;
  return typeof c === "string" && /^[A-Za-z0-9]{4,20}$/.test(c) ? c : "";
}
