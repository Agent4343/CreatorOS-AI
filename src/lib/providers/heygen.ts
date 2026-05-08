/**
 * HeyGen V2 video generation. Built for long-form AI presenter videos —
 * single avatar delivering a script straight to camera.
 *
 * NOTE: HeyGen's API surface evolves. The endpoint paths and field names
 * below follow their public V2 docs as of writing. If the API has
 * shifted, the swap-points are startRender() and getJob() — every other
 * layer of the app talks to HeyGen through this module's exports.
 *
 * HeyGen flow:
 *   1. Upload reference image to create a "Photo Avatar" (one-time, in
 *      the HeyGen dashboard — we just reference its avatar_id).
 *   2. POST /v2/video/generate with script + voice_id + avatar_id.
 *   3. GET  /v1/video_status.get?video_id=... until status is "completed".
 *
 * For Phase 1 we expect the user to have created their Photo Avatar
 * manually in the HeyGen dashboard and recorded its avatar_id on their
 * Character row (reference_image_url field, or we add a heygen_avatar_id
 * column later). For the prototype, the ID is read from the imageUrl
 * field via a "heygen://" URL scheme.
 */

import type { StartRenderInput, VideoJob, VideoProvider } from "./video";

const BASE_V2 = "https://api.heygen.com/v2";
const BASE_V1 = "https://api.heygen.com/v1";

function authHeaders(): Record<string, string> {
  const apiKey = process.env.HEYGEN_API_KEY;
  if (!apiKey) throw new Error("HEYGEN_API_KEY is not set");
  return {
    "X-Api-Key": apiKey,
    "Content-Type": "application/json",
  };
}

function avatarIdFromImageUrl(url: string): string {
  // Convention: a Character whose reference_image_url is
  // "heygen://<avatar_id>" maps directly to a HeyGen Photo Avatar.
  // Otherwise we fail loudly — we don't try to magic-create avatars.
  if (!url.startsWith("heygen://")) {
    throw new Error(
      `HeyGen requires reference_image_url to be 'heygen://<avatar_id>' (got ${url.slice(0, 32)}…). Create a Photo Avatar in the HeyGen dashboard first and record its avatar_id.`,
    );
  }
  return url.slice("heygen://".length);
}

async function startRender(input: StartRenderInput): Promise<{ id: string }> {
  const avatarId = avatarIdFromImageUrl(input.imageUrl);

  // HeyGen accepts script text directly OR a pre-recorded audio URL.
  // We send audio: ElevenLabs is already producing a higher-quality voice
  // than HeyGen's defaults, and using audio guarantees identical voice
  // across renders.
  const body = {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: avatarId,
          avatar_style: "normal",
        },
        voice: {
          type: "audio",
          audio_url: input.audioUrl,
        },
        background: {
          type: "color",
          value: "#0a0a0a",
        },
      },
    ],
    dimension: dimensionFor(input.aspectRatio),
  };

  const res = await fetch(`${BASE_V2}/video/generate`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`HeyGen startRender failed (${res.status}): ${errBody.slice(0, 500)}`);
  }
  const data = (await res.json()) as { data?: { video_id?: string } };
  const id = data.data?.video_id;
  if (!id) throw new Error("HeyGen startRender returned no video_id");
  return { id };
}

async function getJob(id: string): Promise<VideoJob> {
  const res = await fetch(
    `${BASE_V1}/video_status.get?video_id=${encodeURIComponent(id)}`,
    { method: "GET", headers: authHeaders() },
  );
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`HeyGen getJob failed (${res.status}): ${errBody.slice(0, 500)}`);
  }
  const data = (await res.json()) as {
    data?: {
      status?: string;
      video_url?: string;
      error?: { detail?: string; message?: string };
    };
  };
  const d = data.data ?? {};
  return {
    id,
    status: normalizeStatus(d.status),
    video_url: d.video_url ?? null,
    error: d.error?.detail ?? d.error?.message ?? null,
  };
}

function normalizeStatus(s: string | undefined): VideoJob["status"] {
  switch (s) {
    case "completed":
    case "complete":
      return "complete";
    case "pending":
    case "waiting":
      return "queued";
    case "processing":
      return "processing";
    case "failed":
    case "error":
      return "failed";
    default:
      return "processing";
  }
}

function dimensionFor(aspect: "16:9" | "9:16" | "1:1") {
  switch (aspect) {
    case "16:9":
      return { width: 1920, height: 1080 };
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
  }
}

export const heygen: VideoProvider = {
  name: "heygen",
  startRender,
  getJob,
};
