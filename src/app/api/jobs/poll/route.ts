import { NextRequest, NextResponse } from "next/server";
import { listInFlightClips } from "@/lib/db";
import { pollClip } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Hit by Railway's cron (or any external cron) every ~30 seconds. Walks
 * every clip whose status is 'rendering' and asks Hedra whether it's
 * done; if so, mirrors the video to our storage and flips the status.
 *
 * Uses a shared secret (CRON_SECRET) for auth so it's not exposed
 * publicly. Set it in env, then have Railway send it as a Bearer token
 * on the cron call.
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
      await pollClip({ id: clip.id, hedra_job_id: clip.hedra_job_id });
      results.push({ id: clip.id, ok: true });
    } catch (e) {
      results.push({
        id: clip.id,
        ok: false,
        error: e instanceof Error ? e.message : "Unknown error",
      });
    }
  }

  return NextResponse.json({
    polled: results.length,
    results,
  });
}
