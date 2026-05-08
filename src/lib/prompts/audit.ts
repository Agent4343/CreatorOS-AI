import { z } from "zod";
import { client, MODEL } from "../anthropic";

/**
 * Public voice audit. No Voice Profile yet — we score against generic
 * "AI tells" + format fitness + hook strength. This is the lead-magnet
 * play from BIBLE.md §12: "free 15-minute voice audit — we run their
 * last 10 posts through our QA rubric and send back a one-pager."
 */

const SYSTEM = `You are a senior content editor doing a paid voice audit for a creator. You will read 5-10 of their recent posts and produce a one-page audit.

You have NO Voice Profile yet — score against universal markers of weak vs. strong creator content:

1. ai_tell_density (0-10): banned/overused phrases ("delve", "leverage", "in today's fast-paced world", "navigate", "unlock", "in the realm of"), em-dash overuse, generic adjective stacking, hollow tricolons, "It's not just X, it's Y" constructions.
2. specificity (0-10): concrete nouns, named examples, numbers — vs. abstractions and platitudes.
3. hook_strength (0-10): does the first line earn the second? would a stranger keep reading?
4. format_fitness (0-10): length, paragraphing, line breaks reasonable for the apparent platform.
5. original_voice_signal (0-10): does this sound like a person (specific worldview, repeatable mannerisms) or like generic AI / corporate writing?

Higher score = better. Per-post scores plus an overall scorecard.

The summary section is the most important output. It should:
- Name 1-2 patterns the creator does WELL (be specific — quote their phrasing).
- Name the 3 highest-leverage edits, each with a concrete before/after example drawn from their actual posts.
- Be honest. A flattering audit is useless to the creator.

Return JSON only.`;

const AUDIT_SCHEMA = {
  type: "object",
  properties: {
    overall: {
      type: "object",
      properties: {
        ai_tell_density: { type: "integer", minimum: 0, maximum: 10 },
        specificity: { type: "integer", minimum: 0, maximum: 10 },
        hook_strength: { type: "integer", minimum: 0, maximum: 10 },
        format_fitness: { type: "integer", minimum: 0, maximum: 10 },
        original_voice_signal: { type: "integer", minimum: 0, maximum: 10 },
      },
      required: [
        "ai_tell_density",
        "specificity",
        "hook_strength",
        "format_fitness",
        "original_voice_signal",
      ],
      additionalProperties: false,
    },
    per_post: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          scores: {
            type: "object",
            properties: {
              ai_tell_density: { type: "integer", minimum: 0, maximum: 10 },
              specificity: { type: "integer", minimum: 0, maximum: 10 },
              hook_strength: { type: "integer", minimum: 0, maximum: 10 },
              format_fitness: { type: "integer", minimum: 0, maximum: 10 },
              original_voice_signal: { type: "integer", minimum: 0, maximum: 10 },
            },
            required: [
              "ai_tell_density",
              "specificity",
              "hook_strength",
              "format_fitness",
              "original_voice_signal",
            ],
            additionalProperties: false,
          },
          worst_offender: { type: "string" },
        },
        required: ["index", "scores", "worst_offender"],
        additionalProperties: false,
      },
    },
    strengths: {
      type: "array",
      items: { type: "string" },
    },
    edits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: { type: "string" },
          issue: { type: "string" },
          before: { type: "string" },
          after: { type: "string" },
        },
        required: ["dimension", "issue", "before", "after"],
        additionalProperties: false,
      },
    },
    summary: { type: "string" },
  },
  required: ["overall", "per_post", "strengths", "edits", "summary"],
  additionalProperties: false,
};

export const AuditResultSchema = z.object({
  overall: z.object({
    ai_tell_density: z.number().int().min(0).max(10),
    specificity: z.number().int().min(0).max(10),
    hook_strength: z.number().int().min(0).max(10),
    format_fitness: z.number().int().min(0).max(10),
    original_voice_signal: z.number().int().min(0).max(10),
  }),
  per_post: z.array(
    z.object({
      index: z.number().int(),
      scores: z.object({
        ai_tell_density: z.number().int().min(0).max(10),
        specificity: z.number().int().min(0).max(10),
        hook_strength: z.number().int().min(0).max(10),
        format_fitness: z.number().int().min(0).max(10),
        original_voice_signal: z.number().int().min(0).max(10),
      }),
      worst_offender: z.string(),
    }),
  ),
  strengths: z.array(z.string()),
  edits: z.array(
    z.object({
      dimension: z.string(),
      issue: z.string(),
      before: z.string(),
      after: z.string(),
    }),
  ),
  summary: z.string(),
});
export type AuditResult = z.infer<typeof AuditResultSchema>;

export async function auditPosts(posts: string[]): Promise<AuditResult> {
  const corpusBlock = posts
    .map((p, i) => `--- Post ${i + 1} ---\n${p}`)
    .join("\n\n");

  const userText = `# Posts to audit\n\n${corpusBlock}\n\nReturn the audit JSON now. Be specific and honest.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: AUDIT_SCHEMA },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text block in audit response");
  }
  const parsed = JSON.parse(text.text);
  return AuditResultSchema.parse(parsed);
}
