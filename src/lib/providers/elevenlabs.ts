/**
 * ElevenLabs voice synthesis. Phase 1 uses preset voices only — we
 * narrow to a curated list (see CURATED_VOICES below) so users don't
 * have to evaluate hundreds of options.
 */

const TTS_BASE = "https://api.elevenlabs.io/v1/text-to-speech";
const DEFAULT_MODEL = "eleven_multilingual_v2";

export type CuratedVoice = {
  voice_id: string;
  label: string;
  vibe: string;
};

// Hand-curated subset of ElevenLabs default voices. The voice_ids below
// are placeholders — replace with the actual IDs from your ElevenLabs
// dashboard when wiring this up. Keep ~12 options across delivery styles.
export const CURATED_VOICES: CuratedVoice[] = [
  { voice_id: "REPLACE_ME_DEADPAN_M", label: "Calm male — deadpan", vibe: "deadpan" },
  { voice_id: "REPLACE_ME_DRY_F", label: "Sharp female — dry", vibe: "wry" },
  { voice_id: "REPLACE_ME_HYPED_M", label: "Energetic male — hyped", vibe: "hyped" },
  { voice_id: "REPLACE_ME_HYPED_F", label: "Energetic female — hyped", vibe: "hyped" },
  { voice_id: "REPLACE_ME_WARM_M", label: "Warm male — friendly", vibe: "warm" },
  { voice_id: "REPLACE_ME_WARM_F", label: "Warm female — friendly", vibe: "warm" },
];

export async function synthesizeSpeech(args: {
  text: string;
  voiceId: string;
  stability?: number;
  similarityBoost?: number;
}): Promise<ArrayBuffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("ELEVENLABS_API_KEY is not set");

  const res = await fetch(`${TTS_BASE}/${args.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: args.text,
      model_id: DEFAULT_MODEL,
      voice_settings: {
        stability: args.stability ?? 0.5,
        similarity_boost: args.similarityBoost ?? 0.75,
      },
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`ElevenLabs failed (${res.status}): ${errBody.slice(0, 500)}`);
  }
  return await res.arrayBuffer();
}
