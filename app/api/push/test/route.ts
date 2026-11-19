import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendTestPush } from "@/lib/push-server";

// Sends the signed-in person a test notification on their own devices, so they can check it works.
export async function POST() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const { data: m } = await supabase.from("memberships").select("clubs(name)").eq("user_id", auth.user.id).limit(1).maybeSingle();
  const c = m?.clubs as { name: string } | { name: string }[] | null | undefined;
  const clubName = (Array.isArray(c) ? c[0]?.name : c?.name) ?? "Overlap";
  try {
    return NextResponse.json(await sendTestPush(auth.user.id, clubName));
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message });
  }
}
