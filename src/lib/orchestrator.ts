import { generateScript, scriptToVoiceText } from "./prompts/script";
import { synthesizeSpeech } from "./providers/elevenlabs";
import { startRender, uploadAsset, getJob } from "./providers/hedra";
import { getCharacter, getClip, updateClip } from "./db";
import { supabaseService } from "./supabase/server";
import { CharacterSchema } from "./types";

const STORAGE_BUCKET = "clip-assets";

/**
 * Run the synchronous portion of the pipeline for a clip:
 *   script → voice → upload assets → kick off Hedra render.
 * Persists status to the DB at each step. Returns when Hedra has been
 * told to start; the rendering step is async and finishes via
 * /api/jobs/poll or /api/webhooks/hedra.
 */
export async function startClipPipeline(args: {
  clipId: string;
  userId: string;
}): Promise<void> {
  const clip = await getClip(args.clipId, args.userId);
  if (!clip) throw new Error("Clip not found");

  const character = await getCharacter(clip.character_id, args.userId);
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

    // 2. Voice synth
    await updateClip(clip.id, { status: "voicing" });
    const voiceText = scriptToVoiceText(script);
    const audioBytes = await synthesizeSpeech({
      text: voiceText,
      voiceId: c.voice_id,
      stability: c.voice_stability,
      similarityBoost: c.voice_similarity_boost,
    });

    // 3. Persist audio to Supabase Storage so we have it even if Hedra
    //    drops it later. Returns a public URL we hand to the user.
    const audioUrl = await putBytes({
      path: `clips/${clip.id}/voice.mp3`,
      bytes: Buffer.from(audioBytes),
      contentType: "audio/mpeg",
    });
    await updateClip(clip.id, { audio_url: audioUrl });

    // 4. Hedra needs the image and audio as uploaded assets, addressed
    //    by their internal IDs. Pull the image bytes from the
    //    character's reference_image_url; reuse the audio bytes.
    const imageRes = await fetch(c.reference_image_url);
    if (!imageRes.ok) {
      throw new Error(
        `Failed to fetch reference image: ${imageRes.status}`,
      );
    }
    const imageBytes = await imageRes.arrayBuffer();
    const imageContentType =
      imageRes.headers.get("content-type") ?? "image/png";

    const [imageAsset, audioAsset] = await Promise.all([
      uploadAsset({
        bytes: imageBytes,
        filename: `character-${c.id}.png`,
        contentType: imageContentType,
        kind: "image",
      }),
      uploadAsset({
        bytes: audioBytes,
        filename: `clip-${clip.id}.mp3`,
        contentType: "audio/mpeg",
        kind: "audio",
      }),
    ]);

    // 5. Kick off the render. Async — completion handled elsewhere.
    await updateClip(clip.id, { status: "rendering" });
    const job = await startRender({
      imageAssetId: imageAsset.id,
      audioAssetId: audioAsset.id,
      aspectRatio: c.aspect_ratio,
      promptText: `${c.persona.delivery} delivery, ${c.persona.one_liner}`,
    });
    await updateClip(clip.id, { hedra_job_id: job.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    await updateClip(clip.id, { status: "failed", error: message });
    throw e;
  }
}

/**
 * Check Hedra for the latest status of an in-flight clip and update the
 * DB accordingly. Called by /api/jobs/poll on a schedule.
 */
export async function pollClip(clip: {
  id: string;
  hedra_job_id: string | null;
}): Promise<void> {
  if (!clip.hedra_job_id) return;
  const job = await getJob(clip.hedra_job_id);

  if (job.status === "complete" && job.video_url) {
    // Mirror Hedra's video into our own storage so the URL is stable
    // and not subject to provider-side expiry / rotation.
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
      error: job.error ?? "Hedra render failed",
    });
    return;
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
