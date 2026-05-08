import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentCreator, getLatestVoiceProfile } from "@/lib/db";
import { regenerateAsset } from "@/lib/prompts/generate";
import { reviewAsset } from "@/lib/prompts/qa";
import {
  AssetKinds,
  GeneratedAssetSchema,
  PLATFORMS,
  QAScorecardSchema,
  VoiceProfileSchema,
} from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();

    const source = String(body.source ?? "");
    const kind = String(body.kind ?? "");
    const platform = String(body.platform ?? "");
    if (!source || source.length < 50) {
      return NextResponse.json({ error: "source required" }, { status: 400 });
    }
    if (!AssetKinds.includes(kind as (typeof AssetKinds)[number])) {
      return NextResponse.json({ error: `unknown kind: ${kind}` }, { status: 400 });
    }
    if (!PLATFORMS.includes(platform as (typeof PLATFORMS)[number])) {
      return NextResponse.json({ error: `unknown platform: ${platform}` }, { status: 400 });
    }

    const previous = body.previous
      ? GeneratedAssetSchema.parse(body.previous)
      : undefined;
    const previousQa = body.qa ? QAScorecardSchema.parse(body.qa) : undefined;
    const feedback = typeof body.feedback === "string" ? body.feedback : undefined;

    const creator = await getCurrentCreator(user.id);
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }
    const voiceRow = await getLatestVoiceProfile(creator.id);
    if (!voiceRow) {
      return NextResponse.json({ error: "No style profile" }, { status: 400 });
    }
    const voiceProfile = VoiceProfileSchema.parse(voiceRow.profile);

    const asset = await regenerateAsset({
      voiceProfile,
      source,
      kind: kind as (typeof AssetKinds)[number],
      platform: platform as (typeof PLATFORMS)[number],
      previous,
      qa: previousQa,
      feedback,
    });

    const qa = await reviewAsset({ voiceProfile, asset });

    return NextResponse.json({ asset: { ...asset, qa } });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
