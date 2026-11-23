import { NextResponse, type NextRequest } from "next/server";
import { serviceClient } from "@/lib/push-server";
import { verifyWorker } from "@/lib/video-server";

// The worker reports training-clip collection here (signed with the shared secret).
export async function POST(request: NextRequest) {
  const raw = await request.text();
  if (!verifyWorker(raw, request.headers.get("x-overlap-timestamp"), request.headers.get("x-overlap-signature"))) return NextResponse.json({ ok: false }, { status: 401 });
  let body: { kind?: string; match_id?: string; status?: string; clips?: number; message?: string };
  try {
    body = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const db = serviceClient();
  if (!db) return NextResponse.json({ ok: false }, { status: 500 });
  if (body.kind === "dataset" && body.match_id) {
    await db
      .from("training_exports")
      .update({ status: body.status === "done" ? "done" : "failed", clips: Math.max(0, Math.min(10000, Number(body.clips) || 0)), message: String(body.message ?? "").slice(0, 300) })
      .eq("match_id", body.match_id);
  }
  return NextResponse.json({ ok: true });
}
