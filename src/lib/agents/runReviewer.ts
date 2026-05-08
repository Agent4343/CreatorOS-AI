import { client, MODEL } from "../anthropic";
import { Persona, Script } from "../types";
import { scriptToVoiceText } from "../prompts/script";
import {
  REVIEW_RESULT_JSON_SCHEMA,
  ReviewResult,
  ReviewResultSchema,
} from "./types";

/**
 * Shared reviewer harness. Every agent has the same shape:
 *   - a system prompt scoped to one dimension
 *   - the script under review (with the persona + topic for context)
 *   - return a ReviewResult
 * The persona + script are sent in a cached system block so the six
 * reviewers running in parallel share the prompt-cache prefix.
 */
export async function runReviewer(args: {
  systemPrompt: string;
  persona: Persona;
  topic: string;
  targetDurationSec: number;
  script: Script;
}): Promise<ReviewResult> {
  const sharedContext =
    `# Character persona\n\n` +
    JSON.stringify(args.persona, null, 2) +
    `\n\n# Topic\n\n${args.topic}\n\n# Target length\n${Math.round(args.targetDurationSec / 60)} minutes\n\n# Script under review\n\nTitle: ${args.script.title}\n\n${scriptToVoiceText(args.script)}`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: REVIEW_RESULT_JSON_SCHEMA },
    },
    system: [
      { type: "text", text: args.systemPrompt },
      {
        type: "text",
        text: sharedContext,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: "Score the script. JSON only." }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Reviewer returned no text block");
  }
  return ReviewResultSchema.parse(JSON.parse(text.text));
}
