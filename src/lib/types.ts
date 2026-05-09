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
  reference_image_url: z.string(),
  voice_id: z.string(),
  voice_provider: z.literal("elevenlabs"),
  voice_stability: z.number().min(0).max(1).default(0.5),
  voice_similarity_boost: z.number().min(0).max(1).default(0.75),
  persona: PersonaSchema,
  aspect_ratio: z.enum(ASPECT_RATIOS).default("16:9"),
  target_duration_sec: z.number().int().min(60).max(1200).default(600),
  created_at: z.string(),
});
export type Character = z.infer<typeof CharacterSchema>;

export const CLIP_STATUSES = [
  "queued",
  "scripting",
  "reviewing",
  "awaiting_approval",
  "voicing",
  "rendering",
  "done",
  "failed",
] as const;
export type ClipStatus = (typeof CLIP_STATUSES)[number];

export const ScriptSegmentSchema = z.object({
  heading: z.string(),
  body: z.string(),
});
export type ScriptSegment = z.infer<typeof ScriptSegmentSchema>;

export const ScriptSchema = z.object({
  title: z.string(),
  hook: z.string(),
  segments: z.array(ScriptSegmentSchema).min(1).max(8),
  outro: z.string(),
  estimated_seconds: z.number().int().min(60).max(1500),
  notes: z.string().optional(),
});
export type Script = z.infer<typeof ScriptSchema>;

export const UploadChapterSchema = z.object({
  timestamp_sec: z.number().int().min(0),
  label: z.string().min(1).max(80),
});
export type UploadChapter = z.infer<typeof UploadChapterSchema>;

export const ThumbnailConceptSchema = z.object({
  visual: z.string().min(5),
  text_overlay: z.string().max(40),
});
export type ThumbnailConcept = z.infer<typeof ThumbnailConceptSchema>;

export const UploadPackSchema = z.object({
  youtube_title: z.string().min(10).max(100),
  youtube_description: z.string().max(5000),
  youtube_tags: z.array(z.string().min(1).max(40)).max(25),
  youtube_chapters: z.array(UploadChapterSchema).min(3).max(15),
  thumbnail_concepts: z.array(ThumbnailConceptSchema).length(3),
  facebook_caption: z.string().max(280),
});
export type UploadPack = z.infer<typeof UploadPackSchema>;

export const ClipSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string().uuid(),
  character_id: z.string().uuid(),
  topic: z.string(),
  status: z.enum(CLIP_STATUSES),
  script: ScriptSchema.nullable(),
  upload_pack: UploadPackSchema.nullable(),
  audio_url: z.string().url().nullable(),
  video_url: z.string().url().nullable(),
  provider_job_id: z.string().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Clip = z.infer<typeof ClipSchema>;
