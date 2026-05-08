import { NextRequest, NextResponse } from "next/server";
import { runRenderPhase } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * User has reviewed the script + scorecard and is happy with it.
 * Kicks off voice synth + video render. The render is async — finish
 * detection happens via /api/jobs/poll.
 *
 * 4xx if the clip isn't in 'awaiting_approval'. The orchestrator
 * also enforces this guard.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await runRenderPhase({ clipId: id });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    const status = message.startsWith("Cannot render") ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
