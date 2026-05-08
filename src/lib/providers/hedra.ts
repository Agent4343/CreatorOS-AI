/**
 * Hedra Character-3 talking-head video render. Async — we kick the job
 * off, persist the job ID, and poll until done.
 *
 * NOTE: Hedra's API surface evolves. Endpoint paths and field names below
 * follow their public Character-3 docs as of writing. If the API has
 * shifted, adjust startRender() and getJob() — every other layer of the
 * app talks to this provider through these two functions.
 */

const HEDRA_BASE = "https://api.hedra.com/web-app/public";

export type HedraJobStatus = "queued" | "processing" | "complete" | "failed";

export type HedraJob = {
  id: string;
  status: HedraJobStatus;
  video_url: string | null;
  error: string | null;
};

function authHeaders(): Record<string, string> {
  const apiKey = process.env.HEDRA_API_KEY;
  if (!apiKey) throw new Error("HEDRA_API_KEY is not set");
  return {
    "X-API-KEY": apiKey,
    "Content-Type": "application/json",
  };
}

/**
 * Start a Character-3 render. Returns the job_id. The character image
 * and audio file must already be uploaded to Hedra's asset store and
 * referenced by ID — uploadAsset() handles that.
 */
export async function startRender(args: {
  imageAssetId: string;
  audioAssetId: string;
  aspectRatio: "9:16" | "1:1" | "16:9";
  promptText?: string;
}): Promise<{ id: string }> {
  const res = await fetch(`${HEDRA_BASE}/generations`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      type: "video",
      ai_model_id: "character-3",
      start_keyframe_id: args.imageAssetId,
      audio_id: args.audioAssetId,
      generated_video_inputs: {
        text_prompt: args.promptText ?? "",
        resolution: "720p",
        aspect_ratio: args.aspectRatio,
      },
    }),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Hedra startRender failed (${res.status}): ${errBody.slice(0, 500)}`);
  }
  const body = (await res.json()) as { id?: string; generation_id?: string };
  const id = body.id ?? body.generation_id;
  if (!id) throw new Error("Hedra startRender returned no id");
  return { id };
}

export async function getJob(id: string): Promise<HedraJob> {
  const res = await fetch(`${HEDRA_BASE}/generations/${id}/status`, {
    method: "GET",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Hedra getJob failed (${res.status}): ${errBody.slice(0, 500)}`);
  }
  const body = (await res.json()) as {
    status?: string;
    url?: string;
    error?: string;
  };
  return {
    id,
    status: normalizeStatus(body.status),
    video_url: body.url ?? null,
    error: body.error ?? null,
  };
}

function normalizeStatus(s: string | undefined): HedraJobStatus {
  switch (s) {
    case "complete":
    case "completed":
      return "complete";
    case "queued":
    case "pending":
      return "queued";
    case "failed":
    case "error":
      return "failed";
    default:
      return "processing";
  }
}

/**
 * Upload an image or audio file to Hedra's asset store. The returned
 * asset_id is what startRender() expects.
 */
export async function uploadAsset(args: {
  bytes: ArrayBuffer | Buffer;
  filename: string;
  contentType: string;
  kind: "image" | "audio";
}): Promise<{ id: string }> {
  // Step 1: ask Hedra for an asset slot
  const create = await fetch(`${HEDRA_BASE}/assets`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ name: args.filename, type: args.kind }),
  });
  if (!create.ok) {
    const errBody = await create.text();
    throw new Error(`Hedra asset create failed (${create.status}): ${errBody.slice(0, 500)}`);
  }
  const slot = (await create.json()) as { id: string };

  // Step 2: upload the bytes to that slot
  const upload = await fetch(`${HEDRA_BASE}/assets/${slot.id}/upload`, {
    method: "POST",
    headers: {
      "X-API-KEY": process.env.HEDRA_API_KEY ?? "",
      "Content-Type": args.contentType,
    },
    body: args.bytes as BodyInit,
  });
  if (!upload.ok) {
    const errBody = await upload.text();
    throw new Error(`Hedra asset upload failed (${upload.status}): ${errBody.slice(0, 500)}`);
  }
  return { id: slot.id };
}
