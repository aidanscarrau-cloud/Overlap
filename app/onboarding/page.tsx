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
  const [{ data: profile }, { count }] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("user_id", user.id),
  ]);
  return (
    <AuthShell>
      <OnboardingForm code={sp.code?.toUpperCase() ?? ""} name={profile?.full_name ?? ""} email={user.email ?? ""} hasClub={(count ?? 0) > 0} />
    </AuthShell>
  );
}
