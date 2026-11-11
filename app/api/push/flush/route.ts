import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPending } from "@/lib/push-server";

// Called by the app right after someone saves something that creates notifications.
// Only signed-in people can trigger it, and it only sends what the database already queued.
export async function POST() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  try {
    return NextResponse.json(await sendPending());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
