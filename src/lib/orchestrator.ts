import { reviewScript, feedbackFromScorecard, ReviewScorecard } from "./agents";
import { generateScript, scriptToVoiceText } from "./prompts/script";
import { synthesizeSpeech } from "./providers/elevenlabs";
import { videoProvider } from "./providers/video";
import { getCharacter, getClip, updateClip } from "./db";
import { supabaseService } from "./supabase/server";
import { CharacterSchema, Script, ScriptSchema } from "./types";

const STORAGE_BUCKET = "clip-assets";
const MAX_AUTO_REGEN_ATTEMPTS = 1;

/**
 * Phase 1: script → 6-agent review → wait for approval.
 *
 * If the first script fails the monetization hard gate, we auto-
 * regenerate ONCE with the failed-agent feedback baked in. If that
 * still fails, we surface to the user (status='awaiting_approval')
 * with the scorecard — they can read why and choose to regenerate
 * by hand or edit the topic and start over.
 *
 * If everything passes on the first or second try, we still pause
 * for human approval. This is intentional: BIBLE §1 says creator
 * does taste, system does production. The agents are an assist,
 * not a substitute for the editor.
 */
export async function runScriptPhase(args: {
  clipId: string;
  humanFeedback?: string;
  previousScript?: Script;
}): Promise<void> {
  const clip = await getClip(args.clipId);
  if (!clip) throw new Error("Clip not found");

  const character = await getCharacter(clip.character_id);
  if (!character) throw new Error("Character not found");
  const c = CharacterSchema.parse(character);

  try {
    let script: Script | null = args.previousScript ?? null;
    let scorecard: ReviewScorecard | null = null;
    let attempt = 0;

    while (attempt <= MAX_AUTO_REGEN_ATTEMPTS) {
      await updateClip(clip.id, { status: "scripting" });
      const agentFeedback =
        attempt > 0 && scorecard ? feedbackFromScorecard(scorecard) : "";
      const human = (args.humanFeedback ?? "").trim();
      const combinedFeedback = [agentFeedback, human]
        .filter((s) => s.length > 0)
        .join("\n\n");

      script = await generateScript({
        persona: c.persona,
        topic: clip.topic,
        targetDurationSec: c.target_duration_sec,
        previousScript:
          attempt === 0 ? args.previousScript : script ?? undefined,
        feedback: combinedFeedback || undefined,
      });
      await updateClip(clip.id, { script });

      await updateClip(clip.id, { status: "reviewing" });
      scorecard = await reviewScript({
        persona: c.persona,
        topic: clip.topic,
        targetDurationSec: c.target_duration_sec,
        script,
      });
      await updateClip(clip.id, { review_scorecard: scorecard });

      // Auto-regen only when the hard monetization gate is hit. Soft
      // checks surface to the user — taste calls are theirs.
      if (!scorecard.monetization_blocked) break;
      attempt++;
    }

    await updateClip(clip.id, { status: "awaiting_approval" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await updateClip(clip.id, { status: "failed", error: message });
    throw e;
  }
}

/**
 * Phase 2: user has approved the script → voice → video render.
 * Called when the user clicks "Approve & continue" in the UI.
 */
export async function runRenderPhase(args: { clipId: string }): Promise<void> {
  const clip = await getClip(args.clipId);
  if (!clip) throw new Error("Clip not found");
  if (!clip.script) throw new Error("Clip has no script");
  if (clip.status !== "awaiting_approval") {
    throw new Error(`Cannot render: status is ${clip.status}`);
  }

  const character = await getCharacter(clip.character_id);
  if (!character) throw new Error("Character not found");
  const c = CharacterSchema.parse(character);
  const script = ScriptSchema.parse(clip.script);

  try {
    await updateClip(clip.id, { status: "voicing" });
    const voiceText = scriptToVoiceText(script);
    const audioBytes = await synthesizeSpeech({
      text: voiceText,
      voiceId: c.voice_id,
      stability: c.voice_stability,
      similarityBoost: c.voice_similarity_boost,
    });

    const audioUrl = await putBytes({
      path: `clips/${clip.id}/voice.mp3`,
      bytes: Buffer.from(audioBytes),
      contentType: "audio/mpeg",
    });
    await updateClip(clip.id, { audio_url: audioUrl });

    await updateClip(clip.id, { status: "rendering" });
    const provider = videoProvider();
    const job = await provider.startRender({
      imageUrl: c.reference_image_url,
      audioUrl,
      aspectRatio: c.aspect_ratio,
      scriptText: voiceText,
    });
    await updateClip(clip.id, { provider_job_id: job.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await updateClip(clip.id, { status: "failed", error: message });
    throw e;
  }
}

/**
 * Phase 3 (cron-driven): poll the video provider until the render is
 * finished, then mirror the MP4 into Supabase Storage so the URL is
 * stable.
 */
export async function pollClip(clip: {
  id: string;
  provider_job_id: string | null;
}): Promise<void> {
  if (!clip.provider_job_id) return;
  const provider = videoProvider();
  const job = await provider.getJob(clip.provider_job_id);

  if (job.status === "complete" && job.video_url) {
    const res = await fetch(job.video_url);
    if (!res.ok) {
      await updateClip(clip.id, {
        status: "failed",
        error: `Failed to fetch finished video: ${res.status}`,
      });
      return;
    }
    const videoBytes = Buffer.from(await res.arrayBuffer());
    const videoUrl = await putBytes({
      path: `clips/${clip.id}/video.mp4`,
      bytes: videoBytes,
      contentType: "video/mp4",
    });
    await updateClip(clip.id, {
      status: "done",
      video_url: videoUrl,
      completed_at: new Date().toISOString(),
    });
    return;
  }

  if (job.status === "failed") {
    await updateClip(clip.id, {
      status: "failed",
      error: job.error ?? "Video render failed",
    });
  }
}

async function putBytes(args: {
  path: string;
  bytes: Buffer;
  contentType: string;
}): Promise<string> {
  const sb = supabaseService();
  const { error: uploadError } = await sb.storage
    .from(STORAGE_BUCKET)
    .upload(args.path, args.bytes, {
      contentType: args.contentType,
      upsert: true,
    });
  if (uploadError) throw uploadError;
  const { data } = sb.storage.from(STORAGE_BUCKET).getPublicUrl(args.path);
  return data.publicUrl;
}
