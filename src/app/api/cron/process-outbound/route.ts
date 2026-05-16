import { NextRequest, NextResponse } from "next/server";
import { processOutboundBatch } from "@/lib/outbound";

export const runtime = "nodejs";

/**
 * Cron entry point — picks up to 25 queued outbound messages and
 * attempts each. Called every minute by Vercel Cron (or an external
 * scheduler). Idempotent: claims rows via a status transition so
 * two parallel runs don't double-send.
 *
 * Auth: CRON_SECRET env var. Caller must include
 *   Authorization: Bearer <CRON_SECRET>
 * to invoke. When CRON_SECRET is unset (local / preview), the
 * endpoint refuses — there's no legitimate "anonymous cron" path.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const result = await processOutboundBatch();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "cron failed" },
      { status: 500 },
    );
  }
}

// GET for the same path: Vercel Cron sometimes invokes via GET on
// some plans. Same auth, same behavior. Keep POST as the canonical
// callable for manual redrive from a curl one-liner.
export async function GET(req: NextRequest) {
  return POST(req);
}
