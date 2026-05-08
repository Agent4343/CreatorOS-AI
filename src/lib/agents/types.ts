import { z } from "zod";

/** Each reviewer returns the same shape so the aggregator can fan them in. */
export const ReviewResultSchema = z.object({
  score: z.number().int().min(0).max(10),
  pass: z.boolean(),
  /** Concise issues — surfaced to the user. */
  issues: z
    .array(
      z.object({
        severity: z.enum(["critical", "major", "minor"]),
        text: z.string(),
        /** Optional pointer at the script segment the issue is in. */
        segment_index: z.number().int().nullable().optional(),
      }),
    )
    .max(20),
  /** One concrete suggestion the script generator can act on if we regen. */
  suggestion: z.string(),
});
export type ReviewResult = z.infer<typeof ReviewResultSchema>;

export const REVIEW_DIMENSIONS = [
  "monetization",
  "hook",
  "persona_fit",
  "comedy",
  "pacing",
  "facts",
] as const;
export type ReviewDimension = (typeof REVIEW_DIMENSIONS)[number];

export const REVIEW_LABELS: Record<ReviewDimension, string> = {
  monetization: "Monetization compliance",
  hook: "Hook strength",
  persona_fit: "Persona fit",
  comedy: "Comedy lands",
  pacing: "Length & pacing",
  facts: "Fact-check surface",
};

export const REVIEW_DESCRIPTIONS: Record<ReviewDimension, string> = {
  monetization:
    "YouTube advertiser-unfriendly content (profanity intensity, sensitive topics, harmful claims, copyrighted material).",
  hook: "First 30 seconds earn the rest. No hollow openers.",
  persona_fit: "Sounds like the character. Uses vocabulary_hits, avoids avoided_phrases.",
  comedy: "Bits escalate, callbacks present, punches specific.",
  pacing: "Hits target duration; segments roughly balanced.",
  facts: "Factual claims surfaced for the creator to spot-check.",
};

export const ReviewScorecardSchema = z.object({
  monetization: ReviewResultSchema,
  hook: ReviewResultSchema,
  persona_fit: ReviewResultSchema,
  comedy: ReviewResultSchema,
  pacing: ReviewResultSchema,
  facts: ReviewResultSchema,
  /** Hard gate: any critical monetization issue means we cannot proceed. */
  monetization_blocked: z.boolean(),
  /** All scores ≥ 7 and no monetization block. */
  overall_pass: z.boolean(),
});
export type ReviewScorecard = z.infer<typeof ReviewScorecardSchema>;

/** JSON schema used by every reviewer's output_config.format. Reused. */
export const REVIEW_RESULT_JSON_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "integer", minimum: 0, maximum: 10 },
    pass: { type: "boolean" },
    issues: {
      type: "array",
      items: {
        type: "object",
        properties: {
          severity: { type: "string", enum: ["critical", "major", "minor"] },
          text: { type: "string" },
          segment_index: { type: ["integer", "null"] },
        },
        required: ["severity", "text"],
        additionalProperties: false,
      },
    },
    suggestion: { type: "string" },
  },
  required: ["score", "pass", "issues", "suggestion"],
  additionalProperties: false,
};
