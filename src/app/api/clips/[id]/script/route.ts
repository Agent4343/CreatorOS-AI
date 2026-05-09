import { NextRequest, NextResponse } from "next/server";
import { getClip } from "@/lib/db";
import { rereviewScript } from "@/lib/orchestrator";
import { ScriptSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * Save a hand-edited script and re-run the 6 review agents against it.
 * Cheaper than full regenerate — no script-gen call, just the agent
 * fan-out (~$0.60, ~10s).
 *
 * Estimated_seconds is recomputed from the edited word count at 150 wpm,
 * so the user can't fake a longer runtime by lying in the field.
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
    if (clip.status !== "awaiting_approval" && clip.status !== "failed") {
      return NextResponse.json(
        { error: `Cannot edit script while status is ${clip.status}` },
        { status: 409 },
      );
    }

    const body = await req.json();
    const incoming = ScriptSchema.parse(body.script);

    // Recompute estimated_seconds from actual word count at 150 wpm so
    // the pacing agent and the chapter timestamp math both stay honest.
    const totalWords = countWords(
      [
        incoming.hook,
        ...incoming.segments.map((s) => s.body),
        incoming.outro,
      ].join(" "),
    );
    const correctedSeconds = Math.max(1, Math.round((totalWords / 150) * 60));

    const editedScript = ScriptSchema.parse({
      ...incoming,
      estimated_seconds: correctedSeconds,
    });

    await rereviewScript({ clipId: id, editedScript });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
