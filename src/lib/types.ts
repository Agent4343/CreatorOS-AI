import { z } from "zod";

export const PLATFORMS = ["twitter", "linkedin", "newsletter", "instagram"] as const;
export type Platform = (typeof PLATFORMS)[number];

export const AssetKinds = [
  "twitter_thread",
  "twitter_single",
  "linkedin_post",
  "newsletter_teaser",
  "newsletter_section",
  "video_clip_caption",
  "instagram_caption",
] as const;
export type AssetKind = (typeof AssetKinds)[number];

export const VoiceProfileSchema = z.object({
  vocabulary: z.object({
    signature_phrases: z.array(z.string()).max(20),
    avoided_phrases: z.array(z.string()),
    technical_level: z.enum(["low", "medium", "high"]),
    reading_level_grade: z.number().int().min(4).max(16),
  }),
  sentence_patterns: z.object({
    avg_length_words: z.number().int().min(4).max(40),
    fragment_frequency: z.enum(["low", "medium", "high"]),
    starts_with_conjunction: z.boolean(),
    list_density: z.enum(["low", "medium", "high"]),
  }),
  hook_library: z
    .array(
      z.object({
        pattern: z.string(),
        example: z.string(),
      }),
    )
    .min(1),
  cta_library: z.array(
    z.object({
      context: z.string(),
      pattern: z.string(),
      example: z.string(),
    }),
  ),
  tone_vectors: z.object({
    formal_casual: z.number().min(-1).max(1),
    earnest_ironic: z.number().min(-1).max(1),
    prescriptive_reflective: z.number().min(-1).max(1),
    warm_clinical: z.number().min(-1).max(1),
  }),
  format_preferences: z.object({
    twitter: z.object({
      thread_length: z.tuple([z.number().int(), z.number().int()]),
      uses_emojis: z.boolean(),
    }),
    linkedin: z.object({
      para_length_lines: z.tuple([z.number().int(), z.number().int()]),
      uses_horizontal_rules: z.boolean(),
    }),
    newsletter: z.object({
      subhead_style: z.enum(["sentence_case", "title_case", "lowercase"]),
      section_count: z.tuple([z.number().int(), z.number().int()]),
    }),
  }),
  audience: z.object({
    who: z.string(),
    pains: z.array(z.string()),
    objections: z.array(z.string()),
  }),
});

export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

export const QA_DIMENSIONS = [
  "voice_match",
  "ai_tell_density",
  "specificity",
  "hook_strength",
  "format_fitness",
  "cta_quality",
] as const;
export type QADimension = (typeof QA_DIMENSIONS)[number];

export const QA_DIMENSION_LABELS: Record<QADimension, string> = {
  voice_match: "Voice match",
  ai_tell_density: "AI-tell density",
  specificity: "Specificity",
  hook_strength: "Hook strength",
  format_fitness: "Format fitness",
  cta_quality: "CTA quality",
};

export const QAScorecardSchema = z.object({
  scores: z.object({
    voice_match: z.number().int().min(0).max(10),
    ai_tell_density: z.number().int().min(0).max(10),
    specificity: z.number().int().min(0).max(10),
    hook_strength: z.number().int().min(0).max(10),
    format_fitness: z.number().int().min(0).max(10),
    cta_quality: z.number().int().min(0).max(10),
  }),
  flags: z
    .array(
      z.object({
        dimension: z.enum(QA_DIMENSIONS),
        issue: z.string(),
        suggestion: z.string(),
      }),
    )
    .max(20),
  overall_pass: z.boolean(),
});

export type QAScorecard = z.infer<typeof QAScorecardSchema>;

export const GeneratedAssetSchema = z.object({
  kind: z.enum(AssetKinds),
  platform: z.enum(PLATFORMS),
  title: z.string(),
  body: z.string(),
});

export type GeneratedAsset = z.infer<typeof GeneratedAssetSchema>;

export const GenerationBundleSchema = z.object({
  assets: z.array(GeneratedAssetSchema).min(1).max(30),
});

export type GenerationBundle = z.infer<typeof GenerationBundleSchema>;

export type ScoredAsset = GeneratedAsset & {
  qa: QAScorecard;
};
