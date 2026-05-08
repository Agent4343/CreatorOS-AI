import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import {
  getCurrentCreator,
  getLatestVoiceProfile,
  saveGeneration,
  saveSourceContent,
} from "@/lib/db";
import { generateBundle } from "@/lib/prompts/generate";
import { reviewAsset } from "@/lib/prompts/qa";
import { VoiceProfileSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { source, topic, kind } = (await req.json()) as {
      source: string;
      topic?: string;
      kind?: string;
    };

    if (!source || source.trim().length < 100) {
      return NextResponse.json(
        { error: "Source content too short (minimum 100 chars)" },
        { status: 400 },
      );
    }

    const creator = await getCurrentCreator(user.id);
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    const voiceRow = await getLatestVoiceProfile(creator.id);
    if (!voiceRow) {
      return NextResponse.json(
        { error: "No style profile — complete onboarding first" },
        { status: 400 },
      );
    }
    const voiceProfile = VoiceProfileSchema.parse(voiceRow.profile);

    const sourceRow = await saveSourceContent(
      creator.id,
      source,
      kind ?? "transcript",
    );

    const bundle = await generateBundle({
      voiceProfile,
      source,
      topic,
    });

    // QA every asset in parallel — they share the cached Voice Profile prefix.
    const scored = await Promise.all(
      bundle.assets.map(async (asset) => ({
        ...asset,
        qa: await reviewAsset({ voiceProfile, asset }),
      })),
    );

    const generation = await saveGeneration({
      creatorId: creator.id,
      sourceId: sourceRow.id,
      voiceProfileId: voiceRow.id,
      assets: scored,
    });

    return NextResponse.json({
      generation_id: generation.id,
      assets: scored,
    });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
