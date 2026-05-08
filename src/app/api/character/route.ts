import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { createCharacter, listCharacters } from "@/lib/db";
import { PersonaSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const characters = await listCharacters(user.id);
    return NextResponse.json({ characters });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const persona = PersonaSchema.parse(body.persona);

    const character = await createCharacter({
      userId: user.id,
      name: String(body.name),
      reference_image_url: String(body.reference_image_url),
      voice_id: String(body.voice_id),
      persona,
      voice_stability: body.voice_stability,
      voice_similarity_boost: body.voice_similarity_boost,
    });

    return NextResponse.json({ character });
  } catch (e) {
    if (e instanceof Response) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 400 },
    );
  }
}
