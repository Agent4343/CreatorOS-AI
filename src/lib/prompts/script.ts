import { client, MODEL } from "../anthropic";
import { Persona, Script, ScriptSchema } from "../types";

const SYSTEM = `You are a comedy writer for an AI presenter who delivers long-form monologue videos to camera. Format is roughly 3-15 minutes. Think: Jon Stewart desk piece, John Mulaney special excerpt, John Oliver cold open. Single voice, the whole way.

Your output is read aloud verbatim and rendered as one continuous talking-head video. Constraints follow:

WRITE FOR THE EAR
- Short sentences. Rhythmic.
- Read everything you write out loud in your head before deciding it's done. If it doesn't trip naturally off the tongue, rewrite it.
- No stage directions, no parentheticals, no "[laughs]". The voice is read literally.

LONG-FORM STRUCTURE
- One specific premise per video. Don't try to cover the topic; angle it.
- HOOK (≈30 seconds) earns the next 9 minutes. First two sentences should make a stranger keep watching. Hook patterns that work: contrarian claim, hyper-specific observation, pointed question, "let me tell you about" with a specific name. Hook patterns that fail: "Hey guys", "today we're going to talk about", "have you ever wondered."
- SEGMENTS (3-6 of them, ~60-120 seconds each). Each segment is its own bit, with its own setup → development → punch. The segments should escalate, not repeat. Use callbacks between segments — set something up in segment 1, return to it in segment 4.
- OUTRO (≈30 seconds). Land the plane. A final image, a sharp callback, or a punchline. Never "thanks for watching", never "what do you think — let me know in the comments", never recap.

VOICE
- Stay in the persona. Use vocabulary_hits where natural. Avoid every entry in avoided_phrases. Match the delivery style.
- Specificity wins. "Marketing teams" is dead. "The Series-B marketing manager who just discovered Notion" is alive.
- Comedy is opinion, sharply held. Take a position the audience can disagree with — it's better than playing safe.

LENGTH
- Target the persona's target_duration_sec, ±60 seconds. Speaking rate is roughly 150 words per minute. A 10-minute video is ~1500 words.
- Estimated_seconds in the response should be your honest estimate at ~150 wpm, not the target.

Return JSON only. The hook, each segment.body, and the outro are read verbatim — write actual sentences, not headlines.`;

const SCRIPT_JSON_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    hook: { type: "string" },
    segments: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string" },
          body: { type: "string" },
        },
        required: ["heading", "body"],
        additionalProperties: false,
      },
    },
    outro: { type: "string" },
    estimated_seconds: { type: "integer" },
    notes: { type: "string" },
  },
  required: ["title", "hook", "segments", "outro", "estimated_seconds"],
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
    ? `\n\n# Previous attempt — do NOT reproduce; rewrite\n\n${scriptToVoiceText(args.previousScript)}\n`
    : "";

  const feedbackBlock = args.feedback
    ? `\n\n# Creator feedback\n${args.feedback}\n`
    : "";

  const targetMin = Math.round(args.targetDurationSec / 60);

  const userText = `# Topic\n\n${args.topic}\n\n# Target length\n${targetMin} minutes (~${Math.round(targetMin * 150)} words, ±10%)${prevBlock}${feedbackBlock}\n\nWrite the script. JSON only.`;

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 16000,
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

/**
 * Concatenate hook + segments + outro into the spoken script.
 * Headings are NOT spoken — they're scaffolding for the writer.
 */
export function scriptToVoiceText(script: Script): string {
  const parts: string[] = [script.hook.trim()];
  for (const seg of script.segments) {
    if (seg.body.trim()) parts.push(seg.body.trim());
  }
  if (script.outro.trim()) parts.push(script.outro.trim());
  return parts.join("\n\n");
}
