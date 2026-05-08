import { z } from "zod";

export const ASPECT_RATIOS = ["9:16", "1:1", "16:9"] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

export const DELIVERIES = ["deadpan", "hyped", "exasperated", "wry", "warm"] as const;
export type Delivery = (typeof DELIVERIES)[number];

export const PersonaSchema = z.object({
  one_liner: z.string().min(5).max(120),
  perspective: z.string().min(40).max(800),
  delivery: z.enum(DELIVERIES),
  vocabulary_hits: z.array(z.string()).max(20).default([]),
  avoided_phrases: z.array(z.string()).max(20).default([]),
  running_jokes: z.array(z.string()).max(10).default([]),
  audience: z.string().max(200),
});
export type Persona = z.infer<typeof PersonaSchema>;

export const CharacterSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  name: z.string().min(1).max(60),
  reference_image_url: z.string().url(),
  voice_id: z.string(),
  voice_provider: z.literal("elevenlabs"),
  voice_stability: z.number().min(0).max(1).default(0.5),
  voice_similarity_boost: z.number().min(0).max(1).default(0.75),
  persona: PersonaSchema,
  aspect_ratio: z.enum(ASPECT_RATIOS).default("9:16"),
  target_duration_sec: z.number().int().min(10).max(60).default(30),
  created_at: z.string(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CLIP_STATUSES = [
  "queued",
  "scripting",
  "voicing",
  "rendering",
  "done",
  "failed",
] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

export const ScriptSchema = z.object({
  hook: z.string(),
  body: z.string(),
  closer: z.string(),
  estimated_seconds: z.number().int().min(8).max(60),
  notes: z.string().optional(),
});
export type Script = z.infer<typeof ScriptSchema>;

export const ClipSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  character_id: z.string().uuid(),
  topic: z.string(),
  status: z.enum(CLIP_STATUSES),
  script: ScriptSchema.nullable(),
  audio_url: z.string().url().nullable(),
  video_url: z.string().url().nullable(),
  hedra_job_id: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Clip = z.infer<typeof ClipSchema>;
