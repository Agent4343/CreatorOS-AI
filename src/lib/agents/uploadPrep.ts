/**
 * Upload-prep agent. Runs after the user approves a script, before
 * the render kicks off. Produces the YouTube + Facebook metadata
 * pack so the creator can copy/paste straight into the upload form.
 *
 * Not a reviewer — this is a generator. Different shape from the
 * six review agents in this directory.
 */

import { client, MODEL } from "../anthropic";
import { scriptToVoiceText } from "../prompts/script";
import {
  Persona,
  Script,
  UploadPack,
  UploadPackSchema,
} from "../types";

const SYSTEM = `You are a YouTube + Facebook upload-prep editor. You read an approved long-form comedy script and produce the metadata pack the creator copies into the upload form: title, description, tags, chapter timestamps, thumbnail concepts, and a Facebook caption.

Your output is read by humans — the creator pastes it directly. Follow these rules:

YOUTUBE TITLE
- 10-100 chars. Optimal is 50-70 — long enough to carry a hook, short enough not to truncate.
- Must promise the value of the video specifically, not be cute. Curiosity hook OR sharp claim, not both.
- Title-case is fine; ALL CAPS is not.
- No clickbait the video doesn't deliver on. The video has to earn the title or retention will collapse.
- DO NOT start with "How to" or "Why" unless the script literally is a how-to/why piece.

YOUTUBE DESCRIPTION
- The first 150 characters appear above the "more" cutoff and matter for SEO. Lead with the hook + the value.
- After the cutoff, expand: 2-3 short paragraphs of context, the chapter list, optional links section.
- Chapter list goes in the description in this exact format, one per line:
    0:00 Chapter label
    1:23 Next chapter label
    etc.
  YouTube auto-creates clickable chapters from this format. The first chapter MUST start at 0:00.
- Include 5-10 hashtags at the bottom (e.g. #comedy #techcommentary).

YOUTUBE TAGS
- Up to 25 tags, total under 500 chars when comma-joined.
- Mix of broad (#comedy, #monologue) and specific (the topic, the persona, named entities mentioned).

YOUTUBE CHAPTERS
- 3-15 chapters total. The first MUST be at 0:00 (use timestamp_sec: 0).
- Each subsequent chapter MUST be ≥10 seconds after the previous one.
- Distribute proportionally to the script's segment word counts. The script has: hook + N segments + outro. Suggested mapping: hook = "Intro" chapter at 0:00, each segment = its own chapter, outro = its own final chapter (only if outro is long enough — skip if under 30s of estimated runtime).
- Compute timestamps as if the video runs at 150 words per minute. Round to whole seconds.
- Labels should be short, specific, watchable on their own. NOT "Segment 1" — name the actual content.

THUMBNAIL CONCEPTS
- Exactly 3 distinct concepts. Each is a one-sentence visual description PLUS the text overlay (max 40 chars).
- Concepts should be different angles, not three variations of the same idea.
- Text overlays should be short, sharp, readable on a phone — 4-6 words max.

FACEBOOK CAPTION
- Different rules than YouTube. Facebook truncates aggressively at ~280 chars and the algorithm rewards conversation-starters, not SEO.
- Pose a question or take a sharp position. End with a hook to comment.
- No hashtags (Facebook deprioritizes hashtag-heavy posts).

VOICE
- The metadata should match the persona. If the character is deadpan, the title should be deadpan. If the character is hyped, the title can be a little louder.
- Pull phrases from the script where they're punchy. The title is often best as a literal line from the hook.

Return JSON only.`;

const SCHEMA = {
  type: "object",
  properties: {
    youtube_title: { type: "string", minLength: 10, maxLength: 100 },
    youtube_description: { type: "string", maxLength: 5000 },
    youtube_tags: {
      type: "array",
      items: { type: "string", minLength: 1, maxLength: 40 },
      maxItems: 25,
    },
    youtube_chapters: {
      type: "array",
      minItems: 3,
      maxItems: 15,
      items: {
        type: "object",
        properties: {
          timestamp_sec: { type: "integer", minimum: 0 },
          label: { type: "string", minLength: 1, maxLength: 80 },
        },
        required: ["timestamp_sec", "label"],
        additionalProperties: false,
      },
    },
    thumbnail_concepts: {
      type: "array",
      minItems: 3,
      maxItems: 3,
      items: {
        type: "object",
        properties: {
          visual: { type: "string", minLength: 5 },
          text_overlay: { type: "string", maxLength: 40 },
        },
        required: ["visual", "text_overlay"],
        additionalProperties: false,
      },
    },
    facebook_caption: { type: "string", maxLength: 280 },
  },
  required: [
    "youtube_title",
    "youtube_description",
    "youtube_tags",
    "youtube_chapters",
    "thumbnail_concepts",
    "facebook_caption",
  ],
  additionalProperties: false,
};

export async function generateUploadPack(args: {
  persona: Persona;
  script: Script;
  topic: string;
  targetDurationSec: number;
}): Promise<UploadPack> {
  const personaBlock =
    `# Character persona\n\n` + JSON.stringify(args.persona, null, 2);

  const scriptBlock = `# Approved script\n\nTitle (writer's working title): ${args.script.title}\nEstimated runtime: ${args.script.estimated_seconds} sec (${(args.script.estimated_seconds / 60).toFixed(1)} min)\nSegment count: ${args.script.segments.length}\n\n${scriptToVoiceText(args.script)}\n\n# Segment breakdown (for chapter timing)\n\nHook (chapter 1, t=0): ${args.script.hook.slice(0, 200)}…\n${args.script.segments.map((s, i) => `Segment ${i + 1} — ${s.heading} — ${countWords(s.body)} words`).join("\n")}\nOutro: ${countWords(args.script.outro)} words\n\nUse 150 wpm to estimate timestamps.`;

  const userText = `# Topic\n\n${args.topic}\n\nProduce the upload pack. JSON only.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SCHEMA },
    },
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        text: `${personaBlock}\n\n${scriptBlock}`,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Upload-prep returned no text block");
  }
  return UploadPackSchema.parse(JSON.parse(text.text));
}

function countWords(s: string): number {
  return s.trim().split(/\s+/).filter(Boolean).length;
}
