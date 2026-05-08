import { NextRequest, NextResponse } from "next/server";
import { createCharacter, listCharacters } from "@/lib/db";
import { ASPECT_RATIOS, PersonaSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const characters = await listCharacters();
    return NextResponse.json({ characters });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const persona = PersonaSchema.parse(body.persona);

    const aspect = String(body.aspect_ratio ?? "16:9");
    if (!ASPECT_RATIOS.includes(aspect as (typeof ASPECT_RATIOS)[number])) {
      return NextResponse.json({ error: "bad aspect_ratio" }, { status: 400 });
    }
    const targetSec = Number(body.target_duration_sec ?? 600);

    const character = await createCharacter({
      name: String(body.name),
      reference_image_url: String(body.reference_image_url),
      voice_id: String(body.voice_id),
      persona,
      voice_stability: body.voice_stability,
      voice_similarity_boost: body.voice_similarity_boost,
      aspect_ratio: aspect as (typeof ASPECT_RATIOS)[number],
      target_duration_sec: targetSec,
    });

    return NextResponse.json({ character });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 },
    );
  }
}
