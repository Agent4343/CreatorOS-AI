import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentCreator, getLatestVoiceProfile } from "@/lib/db";
import { reviewAsset } from "@/lib/prompts/qa";
import { GeneratedAssetSchema, VoiceProfileSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const asset = GeneratedAssetSchema.parse(body.asset);

    const creator = await getCurrentCreator(user.id);
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    const voiceRow = await getLatestVoiceProfile(creator.id);
    if (!voiceRow) {
      return NextResponse.json({ error: "No voice profile" }, { status: 400 });
    }

    const voiceProfile = VoiceProfileSchema.parse(voiceRow.profile);
    const qa = await reviewAsset({ voiceProfile, asset });
    return NextResponse.json({ qa });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
