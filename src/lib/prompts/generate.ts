import { client, MODEL } from "../anthropic";
import {
  AssetKind,
  GeneratedAsset,
  GeneratedAssetSchema,
  GenerationBundle,
  GenerationBundleSchema,
  Platform,
  QAScorecard,
  VoiceProfile,
} from "../types";

const SYSTEM_PREFIX = `You are CreatorOS AI's content workflow engine. Given (1) a creator's Voice Profile and (2) one source piece, you produce a bundle of ~20 platform-ready assets that sound like the creator wrote them.

Hard rules:
- Use the Voice Profile literally. Pull from signature_phrases, hook_library patterns, cta_library patterns. Avoid every entry in avoided_phrases.
- Match format_preferences for each platform exactly: thread length, paragraph line count, emoji policy, subhead style, section count.
- Specificity beats abstraction. Use concrete nouns, named examples, numbers from the source. No platitudes.
- Match audience.who. Address their pains, anticipate their objections.
- Do not output assets that contradict the source piece's facts. If the source doesn't say it, don't claim it.

Output the bundle as JSON only — no preamble.`;

const VOICE_PROFILE_HEADER = `# Voice Profile\n\n`;
const SOURCE_HEADER = `# Source piece to repurpose\n\n`;

const BUNDLE_JSON_SCHEMA = {
  type: "object",
  properties: {
    assets: {
      type: "array",
      items: {
        type: "object",
        properties: {
          kind: {
            type: "string",
            enum: [
              "twitter_thread",
              "twitter_single",
              "linkedin_post",
              "newsletter_teaser",
              "newsletter_section",
              "video_clip_caption",
              "instagram_caption",
            ],
          },
          platform: {
            type: "string",
            enum: ["twitter", "linkedin", "newsletter", "instagram"],
          },
          title: { type: "string" },
          body: { type: "string" },
        },
        required: ["kind", "platform", "title", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["assets"],
  additionalProperties: false,
};

export async function generateBundle(args: {
  voiceProfile: VoiceProfile;
  source: string;
  topic?: string;
}): Promise<GenerationBundle> {
  const voiceText =
    VOICE_PROFILE_HEADER + JSON.stringify(args.voiceProfile, null, 2);

  const sourceText =
    SOURCE_HEADER +
    args.source +
    (args.topic ? `\n\n# Optional angle\n${args.topic}` : "") +
    `\n\nProduce the bundle now. Aim for ~20 assets covering: 5 short video clip captions, 3 twitter threads, 5 twitter singles, 3 linkedin posts, 2 newsletter teasers, 2 newsletter sections.`;

  // The Voice Profile is large and reused across every generation for this
  // creator — cache it. Top-level cache_control auto-places on the last
  // cacheable block (the second system text block).
  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 32000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: BUNDLE_JSON_SCHEMA },
    },
    system: [
      { type: "text", text: SYSTEM_PREFIX },
      {
        type: "text",
        text: voiceText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: sourceText }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text block in generate response");
  }

  const parsed = JSON.parse(text.text);
  return GenerationBundleSchema.parse(parsed);
}

const SINGLE_ASSET_JSON_SCHEMA = {
  type: "object",
  properties: {
    kind: { type: "string", enum: BUNDLE_JSON_SCHEMA.properties.assets.items.properties.kind.enum },
    platform: { type: "string", enum: BUNDLE_JSON_SCHEMA.properties.assets.items.properties.platform.enum },
    title: { type: "string" },
    body: { type: "string" },
  },
  required: ["kind", "platform", "title", "body"],
  additionalProperties: false,
};

/**
 * Regenerate a single asset of a given kind/platform. Used for the
 * per-asset "regenerate" button — cheaper than re-running the whole
 * bundle, and lets the creator pass a feedback hint ("shorter",
 * "punchier hook", "drop the third tweet") that steers the rewrite.
 */
export async function regenerateAsset(args: {
  voiceProfile: VoiceProfile;
  source: string;
  kind: AssetKind;
  platform: Platform;
  previous?: GeneratedAsset;
  qa?: QAScorecard;
  feedback?: string;
}): Promise<GeneratedAsset> {
  const voiceText =
    `# Voice Profile\n\n` + JSON.stringify(args.voiceProfile, null, 2);

  const prevBlock = args.previous
    ? `# Previous attempt (do NOT reproduce verbatim — rewrite)\n\nTitle: ${args.previous.title}\n\n${args.previous.body}\n`
    : "";
  const qaBlock = args.qa
    ? `# QA scorecard for the previous attempt — fix every flag below\n\n` +
      args.qa.flags
        .map((f) => `- ${f.dimension}: ${f.issue} → ${f.suggestion}`)
        .join("\n") +
      `\n`
    : "";
  const feedbackBlock = args.feedback
    ? `# Creator feedback\n\n${args.feedback}\n`
    : "";

  const userText = `# Source piece\n\n${args.source}\n\n${prevBlock}${qaBlock}${feedbackBlock}\n# Task\nProduce ONE asset of kind=${args.kind} for platform=${args.platform}. Return JSON only.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SINGLE_ASSET_JSON_SCHEMA },
    },
    system: [
      { type: "text", text: SYSTEM_PREFIX },
      {
        type: "text",
        text: voiceText,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text block in regenerate response");
  }
  const parsed = JSON.parse(text.text);
  return GeneratedAssetSchema.parse(parsed);
}
