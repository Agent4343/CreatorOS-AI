import { NextRequest, NextResponse } from "next/server";
import { getClip, updateClip } from "@/lib/db";
import { runScriptPhase } from "@/lib/orchestrator";
import { ScriptSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * Re-run the script + review phase with optional creator feedback.
 *
 * The orchestrator combines:
 *   1. Agent feedback synthesized from the previous review scorecard
 *      (which it reads off the clip via the previousScript handoff)
 *   2. The creator's free-text feedback passed in here
 *
 * Audio / video / provider state is cleared since the script will change.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const clip = await getClip(id);
    if (!clip) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      feedback?: string;
    };
    const humanFeedback =
      typeof body.feedback === "string" ? body.feedback : undefined;

    // Reset render-stage state on regenerate.
    await updateClip(id, {
      status: "queued",
      audio_url: null,
      video_url: null,
      provider_job_id: null,
      error: null,
    });

    const previousScript = clip.script
      ? ScriptSchema.parse(clip.script)
      : undefined;

    await runScriptPhase({
      clipId: id,
      humanFeedback,
      previousScript,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
