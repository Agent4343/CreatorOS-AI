/**
 * Smoke test for the comedy script generator. Per BIBLE.md §6 Phase 0:
 * "Hand-design a comedy persona. Ship 30 generated scripts through
 * manual review. Score each 1-5. Iterate the prompt until ≥40% score 4+."
 *
 * This script generates one batch of 5 topics against a fixture persona
 * and prints the scripts so the founder can review them. Run repeatedly
 * while iterating the prompt in src/lib/prompts/script.ts.
 *
 *   npm run smoke:script
 *
 * Costs: ~$0.25 per run (5 scripts × Opus 4.7 with adaptive thinking).
 */

import { generateScript, scriptToVoiceText } from "../src/lib/prompts/script";

const FIXTURE_PERSONA = {
  one_liner: "Snarky tech analyst who's seen it all",
  perspective:
    "Has worked at three failed unicorns. Suspicious of any sentence containing 'AI-native.' " +
    "Reads every TechCrunch piece for the drama, never the news. Believes most engineering blog posts " +
    "are vendor-driven content marketing. Quietly furious about the demise of RSS.",
  delivery: "deadpan" as const,
  vocabulary_hits: ["actually", "look", "the thing about", "hot take", "of course"],
  avoided_phrases: ["folks", "amazing", "in today's", "leverage", "synergy", "unlock"],
  running_jokes: ["VC bingo", "the year is 2027"],
  audience: "Tech-adjacent millennials who've stopped pretending to enjoy Twitter",
};

const TOPICS = [
  "the way LinkedIn talks about Mondays",
  "Series-B founders discovering Notion",
  "why every startup landing page now looks the same",
  "people who say 'I asked ChatGPT and...'",
  "the new wave of AI productivity gurus",
];

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("Comedy script smoke test — fixture persona");
  console.log("=".repeat(70));
  console.log(`Persona: ${FIXTURE_PERSONA.one_liner}`);
  console.log(`Delivery: ${FIXTURE_PERSONA.delivery}`);
  console.log();

  for (let i = 0; i < TOPICS.length; i++) {
    const topic = TOPICS[i];
    const t0 = Date.now();
    try {
      const script = await generateScript({
        persona: FIXTURE_PERSONA,
        topic,
        targetDurationSec: 8 * 60, // 8-min target
      });
      const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
      const minutes = (script.estimated_seconds / 60).toFixed(1);
      console.log("─".repeat(70));
      console.log(
        `Topic #${i + 1}: ${topic}    [${elapsed}s gen · est ${minutes} min · ${script.segments.length} segments]`,
      );
      console.log(`Title: ${script.title}`);
      console.log("─".repeat(70));
      console.log(scriptToVoiceText(script));
      if (script.notes) console.log(`\n[notes] ${script.notes}`);
      console.log();
    } catch (e) {
      console.error(`Topic #${i + 1} failed:`, e);
    }
  }

  console.log("=".repeat(70));
  console.log("Done. Score each 1-5 for 'would I watch this'.");
  console.log("Iterate src/lib/prompts/script.ts until ≥40% of scripts score 4+.");
  console.log("=".repeat(70));
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
