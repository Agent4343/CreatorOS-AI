import { client, MODEL } from "../anthropic";
import { Persona, Script, ScriptSchema } from "../types";

const SYSTEM = `You are a working comedy writer. Your job is to write a 30-second monologue, in character, that lands.

Your output is read aloud by an AI voice and rendered onto an AI character. So:

- Write for the ear, not the page. Short sentences. Rhythm matters.
- One specific premise per clip. Don't try to cover the topic — angle it.
- The hook is the first 1-2 lines. If the hook doesn't earn the second sentence, the clip is dead. Hooks are: contrarian claims, hyper-specific observations, or pointed questions. Never "Hey guys" / "Today we're talking about" / "Have you ever wondered."
- Beats > setups. A 30-second comedy clip has room for a hook, two or three beats, and a closer. Each beat should be its own laugh, not a step toward one final laugh.
- Specificity wins. "Marketing teams" is dead. "The Series-B marketing manager who just discovered Notion" is alive.
- Stay in character. Use the persona's vocabulary_hits where natural. Avoid every phrase in avoided_phrases. Match the delivery style exactly.
- No fourth-wall breaks unless the persona's delivery calls for them.
- No "in conclusion," no recap, no "what do you think?" CTAs. The closer is a punchline, an image, or a sharp landing — not a question to the audience.

Length: target the persona's target_duration_sec, ±5 seconds. ~150 words is roughly 30 seconds at conversational pace.

Return JSON only.`;

const SCRIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    hook: { type: "string" },
    body: { type: "string" },
    closer: { type: "string" },
    estimated_seconds: { type: "integer" },
    notes: { type: "string" },
  },
  required: ["hook", "body", "closer", "estimated_seconds"],
  additionalProperties: false,
};

export async function generateScript(args: {
  persona: Persona;
  topic: string;
  targetDurationSec: number;
  feedback?: string;
  previousScript?: Script;
}): Promise<Script> {
  const personaBlock =
    `# Character persona\n\n` + JSON.stringify(args.persona, null, 2);

  const prevBlock = args.previousScript
    ? `\n\n# Previous attempt — do NOT reproduce; rewrite\n\nHook: ${args.previousScript.hook}\nBody: ${args.previousScript.body}\nCloser: ${args.previousScript.closer}\n`
    : "";

  const feedbackBlock = args.feedback
    ? `\n\n# Creator feedback\n${args.feedback}\n`
    : "";

  const userText = `# Topic\n\n${args.topic}\n\n# Target length\n${args.targetDurationSec} seconds (±5)${prevBlock}${feedbackBlock}\n\nWrite the script. JSON only.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 4000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: SCRIPT_JSON_SCHEMA },
    },
    system: [
      { type: "text", text: SYSTEM },
      {
        type: "text",
        text: personaBlock,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userText }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("No text block in script response");
  }
  const parsed = JSON.parse(text.text);
  return ScriptSchema.parse(parsed);
}

/** Combine the three script parts into the single voice-script string. */
export function scriptToVoiceText(script: Script): string {
  return [script.hook.trim(), script.body.trim(), script.closer.trim()]
    .filter(Boolean)
    .join("\n\n");
}
