import { client, MODEL } from "../anthropic";
import { VoiceProfile, VoiceProfileSchema } from "../types";

const SYSTEM = `You are a voice-profiling analyst for CreatorOS AI. You read a creator's body of published work and extract a structured Voice Profile that can be used to generate new content in their voice.

Be specific. Generic adjectives ("punchy", "engaging", "thoughtful") are useless — name actual phrases, real sentence structures, real hooks the creator has used. The Voice Profile is the entire product; vagueness here breaks every downstream generation.

Rules:
- signature_phrases: at most 20, drawn verbatim or near-verbatim from the corpus.
- avoided_phrases: include AI-tells the creator does not use (e.g. "delve", "leverage", "in today's fast-paced world", hollow tricolons).
- hook_library: real opening patterns from the corpus, with examples copied from actual posts.
- tone_vectors: each on a -1.0 to 1.0 scale. Positive = the right-side label, negative = the left-side label. Be honest — most creators are not 0.0.
- audience.who: one specific sentence ("indie SaaS founders pre-PMF, ARR < $200k") not "marketers and entrepreneurs".
- Reading level: estimate from sentence complexity (Flesch-Kincaid grade roughly).

Return ONLY the structured JSON matching the schema. No prose around it.`;

export async function buildVoiceProfile(args: {
  intake: Record<string, string>;
  corpus: string[];
}): Promise<VoiceProfile> {
  const filled = Object.entries(args.intake).filter(([, a]) => a && a.trim());

  const intakeBlock =
    filled.length > 0
      ? filled.map(([q, a]) => `Q: ${q}\nA: ${a.trim()}`).join("\n\n")
      : "(The creator skipped the intake. Infer everything from the corpus. " +
        "For audience.who, audience.pains, vocabulary.avoided_phrases, and " +
        "the cta_library, make your best inference but mark uncertainty by " +
        "preferring shorter / more conservative entries.)";

  const corpusBlock = args.corpus
    .map((piece, i) => `--- Piece ${i + 1} ---\n${piece}`)
    .join("\n\n");

  const userText = `# Creator intake\n\n${intakeBlock}\n\n# Source corpus (${args.corpus.length} pieces)\n\n${corpusBlock}\n\nReturn the Voice Profile JSON now.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content: userText }],
    output_config: {
      format: {
        type: "json_schema",
        schema: VOICE_PROFILE_JSON_SCHEMA,
      },
    },
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text block in voice profile response");
  }

  const parsed = JSON.parse(text.text);
  return VoiceProfileSchema.parse(parsed);
}

const VOICE_PROFILE_JSON_SCHEMA = {
  type: "object",
  properties: {
    vocabulary: {
      type: "object",
      properties: {
        signature_phrases: { type: "array", items: { type: "string" } },
        avoided_phrases: { type: "array", items: { type: "string" } },
        technical_level: { type: "string", enum: ["low", "medium", "high"] },
        reading_level_grade: { type: "integer" },
      },
      required: ["signature_phrases", "avoided_phrases", "technical_level", "reading_level_grade"],
      additionalProperties: false,
    },
    sentence_patterns: {
      type: "object",
      properties: {
        avg_length_words: { type: "integer" },
        fragment_frequency: { type: "string", enum: ["low", "medium", "high"] },
        starts_with_conjunction: { type: "boolean" },
        list_density: { type: "string", enum: ["low", "medium", "high"] },
      },
      required: ["avg_length_words", "fragment_frequency", "starts_with_conjunction", "list_density"],
      additionalProperties: false,
    },
    hook_library: {
      type: "array",
      items: {
        type: "object",
        properties: {
          pattern: { type: "string" },
          example: { type: "string" },
        },
        required: ["pattern", "example"],
        additionalProperties: false,
      },
    },
    cta_library: {
      type: "array",
      items: {
        type: "object",
        properties: {
          context: { type: "string" },
          pattern: { type: "string" },
          example: { type: "string" },
        },
        required: ["context", "pattern", "example"],
        additionalProperties: false,
      },
    },
    tone_vectors: {
      type: "object",
      properties: {
        formal_casual: { type: "number" },
        earnest_ironic: { type: "number" },
        prescriptive_reflective: { type: "number" },
        warm_clinical: { type: "number" },
      },
      required: ["formal_casual", "earnest_ironic", "prescriptive_reflective", "warm_clinical"],
      additionalProperties: false,
    },
    format_preferences: {
      type: "object",
      properties: {
        twitter: {
          type: "object",
          properties: {
            thread_length: { type: "array", items: { type: "integer" } },
            uses_emojis: { type: "boolean" },
          },
          required: ["thread_length", "uses_emojis"],
          additionalProperties: false,
        },
        linkedin: {
          type: "object",
          properties: {
            para_length_lines: { type: "array", items: { type: "integer" } },
            uses_horizontal_rules: { type: "boolean" },
          },
          required: ["para_length_lines", "uses_horizontal_rules"],
          additionalProperties: false,
        },
        newsletter: {
          type: "object",
          properties: {
            subhead_style: { type: "string", enum: ["sentence_case", "title_case", "lowercase"] },
            section_count: { type: "array", items: { type: "integer" } },
          },
          required: ["subhead_style", "section_count"],
          additionalProperties: false,
        },
      },
      required: ["twitter", "linkedin", "newsletter"],
      additionalProperties: false,
    },
    audience: {
      type: "object",
      properties: {
        who: { type: "string" },
        pains: { type: "array", items: { type: "string" } },
        objections: { type: "array", items: { type: "string" } },
      },
      required: ["who", "pains", "objections"],
      additionalProperties: false,
    },
  },
  required: [
    "vocabulary",
    "sentence_patterns",
    "hook_library",
    "cta_library",
    "tone_vectors",
    "format_preferences",
    "audience",
  ],
  additionalProperties: false,
};
