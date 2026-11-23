import { NextResponse, type NextRequest } from "next/server";
import { sendPending, serviceClient } from "@/lib/push-server";
import { queueTraining } from "@/lib/training-server";

// Runs once a day on Vercel (see vercel.json): queues "are you coming tomorrow?" reminders, then sends.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Not allowed" }, { status: 401 });
  }
  const db = serviceClient();
  if (!db) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY is not set" }, { status: 500 });
  const { data: queued, error } = await db.rpc("queue_reply_reminders");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  try {
    const pushed = await sendPending(request.nextUrl.origin);
    // Training clips from teams that have agreed to help improve Overlap's analysis.
    const site = (process.env.SITE_URL || request.nextUrl.origin).replace(/\/$/, "");
    const training = await queueTraining(db, site).catch((e) => ({ training: `error: ${(e as Error).message}` }));
    return NextResponse.json({ queued, ...pushed, ...training });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
