import { client, MODEL } from "../anthropic";
import {
  GeneratedAsset,
  QAScorecard,
  QAScorecardSchema,
  VoiceProfile,
} from "../types";

const SYSTEM = `You are CreatorOS AI's QA reviewer. You score generated assets against a creator's Voice Profile across six dimensions.

Each dimension is scored 0–10:
- voice_match: vocabulary, sentence patterns, hook style match the Voice Profile
- ai_tell_density: penalize banned phrases, em-dash overuse, generic adjective stacking, hollow tricolons, "delve", "leverage", "in today's fast-paced world"
- specificity: concrete nouns, named examples, numbers vs. abstractions and platitudes
- hook_strength: first line passes "would I keep reading" against the hook_library patterns
- format_fitness: length, structure, line breaks match the platform format_preferences
- cta_quality: clear, single, in-voice — or appropriately absent

For any dimension scoring under 7, add a flag with a SPECIFIC suggestion that references the Voice Profile (e.g. "Hook uses 'In today's world' — your hook_library favors contrarian claims; try X").

overall_pass = true only if every dimension >= 7.

Be honest. A scorecard that flatters the asset is useless to the creator.`;

const QA_JSON_SCHEMA = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: {
        voice_match: { type: "integer", minimum: 0, maximum: 10 },
        ai_tell_density: { type: "integer", minimum: 0, maximum: 10 },
        specificity: { type: "integer", minimum: 0, maximum: 10 },
        hook_strength: { type: "integer", minimum: 0, maximum: 10 },
        format_fitness: { type: "integer", minimum: 0, maximum: 10 },
        cta_quality: { type: "integer", minimum: 0, maximum: 10 },
      },
      required: [
        "voice_match",
        "ai_tell_density",
        "specificity",
        "hook_strength",
        "format_fitness",
        "cta_quality",
      ],
      additionalProperties: false,
    },
    flags: {
      type: "array",
      items: {
        type: "object",
        properties: {
          dimension: {
            type: "string",
            enum: [
              "voice_match",
              "ai_tell_density",
              "specificity",
              "hook_strength",
              "format_fitness",
              "cta_quality",
            ],
          },
          issue: { type: "string" },
          suggestion: { type: "string" },
        },
        required: ["dimension", "issue", "suggestion"],
        additionalProperties: false,
      },
    },
    overall_pass: { type: "boolean" },
  },
  required: ["scores", "flags", "overall_pass"],
  additionalProperties: false,
};

export async function reviewAsset(args: {
  voiceProfile: VoiceProfile;
  asset: GeneratedAsset;
}): Promise<QAScorecard> {
  const voiceText =
    `# Voice Profile\n\n` + JSON.stringify(args.voiceProfile, null, 2);
  const assetText =
    `# Asset under review\n\nKind: ${args.asset.kind}\nPlatform: ${args.asset.platform}\nTitle: ${args.asset.title}\n\nBody:\n${args.asset.body}\n\nReturn the scorecard JSON now.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: QA_JSON_SCHEMA },
    },
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        text: voiceText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: assetText }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text block in QA response");
  }

  const parsed = JSON.parse(text.text);
  return QAScorecardSchema.parse(parsed);
}
