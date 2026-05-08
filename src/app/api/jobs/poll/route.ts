import { NextRequest, NextResponse } from "next/server";
import { listInFlightClips } from "@/lib/db";
import { pollClip } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Cron-driven poll. Hit by Railway cron every 30-60 seconds. Walks every
 * clip with status='rendering' and asks the video provider whether it's
 * done; if so, mirrors the video to our storage and flips status='done'.
 *
 * Uses CRON_SECRET as a bearer token so this isn't accessible publicly.
 */
export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const inFlight = await listInFlightClips(20);
  const results: Array<{ id: string; ok: boolean; error?: string }> = [];

  for (const clip of inFlight) {
    try {
      await pollClip({ id: clip.id, provider_job_id: clip.provider_job_id });
      results.push({ id: clip.id, ok: true });
    } catch (e) {
      results.push({
        id: clip.id,
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({ polled: results.length, results });
}
