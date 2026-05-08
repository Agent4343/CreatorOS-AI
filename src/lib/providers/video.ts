/**
 * Video provider interface. Pick one with VIDEO_PROVIDER env var:
 *   "heygen"  — HeyGen V2 API. Default for Reel; supports long-form.
 *   "hedra"   — Hedra Character-3. Better for short ≤90s expressive clips.
 *
 * Both return a job_id from startRender() and are polled with getJob()
 * until status === "complete", at which point video_url is populated.
 */

export type VideoJobStatus = "queued" | "processing" | "complete" | "failed";

export type VideoJob = {
  id: string;
  status: VideoJobStatus;
  video_url: string | null;
  error: string | null;
};

export type StartRenderInput = {
  /** Public URL the provider can fetch the character image from. */
  imageUrl: string;
  /** Public URL the provider can fetch the audio file from. */
  audioUrl: string;
  /** "16:9" | "9:16" | "1:1" — passed through to provider. */
  aspectRatio: "16:9" | "9:16" | "1:1";
  /** Total script length, used by some providers as a hint. */
  scriptText: string;
};

export interface VideoProvider {
  name: "heygen" | "hedra";
  startRender(input: StartRenderInput): Promise<{ id: string }>;
  getJob(id: string): Promise<VideoJob>;
}

import { heygen } from "./heygen";

export function videoProvider(): VideoProvider {
  const which = (process.env.VIDEO_PROVIDER ?? "heygen").toLowerCase();
  if (which === "heygen") return heygen;
  // Future: import {hedra} from "./hedra"; if (which === "hedra") return hedra;
  throw new Error(`Unknown VIDEO_PROVIDER: ${which}`);
}
