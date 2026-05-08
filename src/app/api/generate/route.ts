import { NextRequest, NextResponse } from "next/server";
import { createClip, getCharacter } from "@/lib/db";
import { startClipPipeline } from "@/lib/orchestrator";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      character_id?: string;
      topic?: string;
    };

    const topic = (body.topic ?? "").trim();
    if (topic.length < 3) {
      return NextResponse.json({ error: "Topic too short" }, { status: 400 });
    }
    if (!body.character_id) {
      return NextResponse.json(
        { error: "character_id required" },
        { status: 400 },
      );
    }

    const character = await getCharacter(body.character_id);
    if (!character) {
      return NextResponse.json(
        { error: "Character not found" },
        { status: 404 },
      );
    }

    const clip = await createClip({
      characterId: character.id,
      topic,
    });

    // Run script + voice + provider-kickoff inline. ~30 seconds.
    await startClipPipeline({ clipId: clip.id });

    return NextResponse.json({ clip_id: clip.id });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
