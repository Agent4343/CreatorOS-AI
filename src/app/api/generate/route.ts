import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createClip, getCharacter } from "@/lib/db";
import { startClipPipeline } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      character_id?: string;
      topic?: string;
    };

    const topic = (body.topic ?? "").trim();
    if (topic.length < 3) {
      return NextResponse.json(
        { error: "Topic too short" },
        { status: 400 },
      );
    }
    if (!body.character_id) {
      return NextResponse.json(
        { error: "character_id required" },
        { status: 400 },
      );
    }

    const character = await getCharacter(body.character_id, user.id);
    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    // Create the clip row first so the user can poll it immediately
    // even if the sync portion of the pipeline takes ~30 seconds.
    const clip = await createClip({
      userId: user.id,
      characterId: character.id,
      topic,
    });

    // Run script + voice + Hedra-kickoff inline. Total ~30 seconds.
    // (We could push this to a background queue, but Railway runs Next
    // as a long-lived Node process — it's fine to await.)
    await startClipPipeline({ clipId: clip.id, userId: user.id });

    return NextResponse.json({ clip_id: clip.id });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
