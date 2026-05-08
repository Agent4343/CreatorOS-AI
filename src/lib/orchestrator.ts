import { generateScript, scriptToVoiceText } from "./prompts/script";
import { synthesizeSpeech } from "./providers/elevenlabs";
import { videoProvider } from "./providers/video";
import { getCharacter, getClip, updateClip } from "./db";
import { supabaseService } from "./supabase/server";
import { CharacterSchema } from "./types";

const STORAGE_BUCKET = "clip-assets";

/**
 * Sync portion of the pipeline:
 *   script → voice → upload audio to Storage → kick off video render.
 * The video render itself is async and finishes via /api/jobs/poll.
 */
export async function startClipPipeline(args: { clipId: string }): Promise<void> {
  const clip = await getClip(args.clipId);
  if (!clip) throw new Error("Clip not found");

  const character = await getCharacter(clip.character_id);
  if (!character) throw new Error("Character not found");
  const c = CharacterSchema.parse(character);

  try {
    // 1. Script
    await updateClip(clip.id, { status: "scripting" });
    const script = await generateScript({
      persona: c.persona,
      topic: clip.topic,
      targetDurationSec: c.target_duration_sec,
    });
    await updateClip(clip.id, { script });

    // 2. Voice
    await updateClip(clip.id, { status: "voicing" });
    const voiceText = scriptToVoiceText(script);
    const audioBytes = await synthesizeSpeech({
      text: voiceText,
      voiceId: c.voice_id,
      stability: c.voice_stability,
      similarityBoost: c.voice_similarity_boost,
    });

    // 3. Persist audio to Supabase Storage and get a public URL.
    //    HeyGen needs to fetch this URL directly.
    const audioUrl = await putBytes({
      path: `clips/${clip.id}/voice.mp3`,
      bytes: Buffer.from(audioBytes),
      contentType: "audio/mpeg",
    });
    await updateClip(clip.id, { audio_url: audioUrl });

    // 4. Kick off the video render via whichever provider is configured.
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
 * Check the video provider for the latest status of one in-flight clip.
 * Called by /api/jobs/poll on a schedule.
 */
export async function pollClip(clip: {
  id: string;
  provider_job_id: string | null;
}): Promise<void> {
  if (!clip.provider_job_id) return;
  const provider = videoProvider();
  const job = await provider.getJob(clip.provider_job_id);

  if (job.status === "complete" && job.video_url) {
    // Mirror the provider's video into our own storage so the URL is
    // stable and not subject to provider-side expiry / rotation.
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
  // Otherwise still rendering; nothing to do.
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
