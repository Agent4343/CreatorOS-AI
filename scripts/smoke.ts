/**
 * Smoke test: exercise voice-build → generate → QA against fixture data.
 *
 * Run with: npm run smoke
 * Requires: ANTHROPIC_API_KEY in env.
 *
 * Bypasses Supabase and the API routes — calls the prompt functions directly.
 * The 30-piece minimum lives in the /api/voice/build route, not in
 * buildVoiceProfile itself, so a smaller fixture is fine here.
 */

import { buildVoiceProfile } from "../src/lib/prompts/voiceBuild";
import { generateBundle } from "../src/lib/prompts/generate";
import { reviewAsset } from "../src/lib/prompts/qa";

const FIXTURE_INTAKE: Record<string, string> = {
  "Who is your audience?":
    "Indie SaaS founders pre-PMF, usually solo or a tiny team, ARR under $200k, technical enough to build but allergic to MBA-speak.",
  "What three pains?":
    "1) Distribution they can't crack. 2) Pricing they second-guess weekly. 3) Knowing whether to keep going or kill it.",
  "Common phrases?":
    "ship the thing, the boring answer is usually right, leverage compounds, talk to ten users",
  "Phrases you'd never say?":
    "synergy, leverage AI, in today's fast-paced world, delve, unlock value",
  "Hook style?":
    "Contrarian one-liner followed by a single line of context.",
  "Tone?":
    "casual but earnest, slightly prescriptive, warm",
  "Format preferences?":
    "LinkedIn 1-3 line paragraphs, no emojis, occasional horizontal rules. Twitter threads 6-9 tweets.",
  "Standard close?":
    "A specific question that earns a reply, never 'thoughts?'",
};

const FIXTURE_CORPUS = [
  `Most founders ship too late. They polish a v1 for six months, launch to silence, then conclude they need more polish. The boring answer is usually right: distribution is the bottleneck, not the product. Spend three weeks talking to ten users. Hear which sentence makes them lean in. Ship that sentence, not the feature you imagined.`,
  `Pricing is not a math problem. It's a positioning problem. Charging $29 says "I'm a tool." Charging $290 says "I'm an outcome." Most founders pick $29 because it feels safe, then wonder why nobody respects the product. Pick the price that matches the outcome you actually deliver. If you can't say that out loud without flinching, you have a deeper problem.`,
  `The hardest part of running a one-person company isn't the work. It's deciding what not to do. Every Slack invite, every podcast pitch, every "quick call" is an asset class with a real opportunity cost. Treat your week like a portfolio. Most days, the right move is to do nothing new and ship the thing already on the list.`,
  `Talking to users feels slow. It is slow. It's also the only step you can't shortcut. AI-generated user research isn't user research; it's an averaged hallucination. Get on a 30-minute call. Ask what they did last Tuesday, not what they think. The answer to "what would make this 10x better" is almost never the answer to "what's broken right now."`,
  `Twitter is not distribution. It's a casino with delayed payoff. You are not building an audience there; you are paying for the privilege of being entertained while you procrastinate on your real distribution work. Sometimes the right answer is to log off and write 200 cold emails. The boring answer is usually right.`,
  `A startup is a sequence of bets you can survive losing. The hard part isn't picking the right bet. It's keeping the bet small enough that the next one is still possible. Almost every founder I know who flamed out flamed out by raising too much, hiring too fast, or building too long before charging. Survive long enough to learn. Then bet again.`,
  `If you can't explain your product to a friend in one sentence, the friend is not the problem. Start with the outcome. "I help X do Y in Z time." Everything else — the screenshots, the architecture, the Slack integration — is a footnote. Most founders bury the outcome under three layers of cleverness because they think clever is the product. Clear is the product.`,
  `The best founders I know are uncomfortable in two specific ways. First, they're uncomfortable charging more than feels reasonable. Second, they're uncomfortable saying no to customers who aren't a fit. Both discomforts compound. The ones who push through end up with a business. The ones who don't end up with a project.`,
  `Most "marketing" advice is recycled growth-hacking from 2014. It worked then because the channels were new. Today, the only durable channels are the ones that take time to compound: writing, talking on podcasts, building in public with substance, and being unusually helpful in a small community. None of these are hacks. All of them work.`,
  `When I started charging $99/mo instead of $29/mo, three things happened. Conversion went down 30%. Revenue went up 2x. Support tickets went down. The takeaway isn't "raise your price." It's "your price is signaling something to buyers that has very little to do with what you're actually charging for." Listen to what your price is saying. Edit accordingly.`,
];

const FIXTURE_SOURCE = `Welcome back to the show. Today I'm talking with Sam, a solo founder who hit $50k MRR in fourteen months building a tool for restaurant owners. Sam, walk me through the first sale.

Sam: I cold-emailed eighty restaurants in Brooklyn. Two replied. One bought. The one who bought paid $200 a month, not the $29 I'd put on the landing page. He told me the price felt too low to be serious. That single conversation changed everything. I went home, wrote down what he actually used the product for, and rebuilt the homepage around that one sentence. Conversion didn't move much. Average deal size doubled.

Me: How did you handle distribution after that?

Sam: I stopped trying to be on Twitter. I started showing up in two restaurant-owner Facebook groups where I could be useful without pitching. I'd answer questions about POS integrations, costs of compliance, that sort of thing. After three months of that, owners started DMing me asking if I had a tool. I never had to "do marketing" the way I'd planned. Being useful in public was the marketing.

Me: Pricing — you've raised it twice since then.

Sam: Yeah. $200 to $400 to $600. Each time I was terrified. Each time the only thing that happened was the customers who stayed got more serious. I still get one cancellation a month from someone who says "this is too expensive." That's how I know I'm priced right. If nobody's saying that, you're leaving money on the table.

Me: What's the boring lesson?

Sam: Talk to ten people before you build anything. Charge more than feels reasonable. Show up in places where your customers already are, and be useful before you sell anything. None of this is novel. Most founders just don't do it because it's slow.`;

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Aborting.");
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("STEP 1: build voice profile");
  console.log("=".repeat(70));
  const t0 = Date.now();
  const profile = await buildVoiceProfile({
    intake: FIXTURE_INTAKE,
    corpus: FIXTURE_CORPUS,
  });
  console.log(`✓ built in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  console.log("Audience:", profile.audience.who);
  console.log("Signature phrases:", profile.vocabulary.signature_phrases.slice(0, 5).join(" · "));
  console.log("Avoided phrases:", profile.vocabulary.avoided_phrases.slice(0, 5).join(" · "));
  console.log("Hooks:", profile.hook_library.length, "patterns");
  console.log("Tone vectors:", profile.tone_vectors);

  console.log();
  console.log("=".repeat(70));
  console.log("STEP 2: generate bundle");
  console.log("=".repeat(70));
  const t1 = Date.now();
  const bundle = await generateBundle({
    voiceProfile: profile,
    source: FIXTURE_SOURCE,
  });
  console.log(`✓ generated ${bundle.assets.length} assets in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  for (const asset of bundle.assets) {
    console.log(`  · [${asset.platform}/${asset.kind}] ${asset.title}`);
  }

  console.log();
  console.log("=".repeat(70));
  console.log("STEP 3: QA score (first 3 assets)");
  console.log("=".repeat(70));
  const sample = bundle.assets.slice(0, 3);
  const t2 = Date.now();
  const scored = await Promise.all(
    sample.map(async (asset) => ({ asset, qa: await reviewAsset({ voiceProfile: profile, asset }) })),
  );
  console.log(`✓ scored ${scored.length} assets in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  for (const { asset, qa } of scored) {
    const totals = Object.values(qa.scores);
    const avg = (totals.reduce((a, b) => a + b, 0) / totals.length).toFixed(1);
    console.log(
      `  · [${asset.platform}/${asset.kind}] ${qa.overall_pass ? "PASS" : "REVIEW"} avg=${avg} flags=${qa.flags.length}`,
    );
    for (const flag of qa.flags) {
      console.log(`      - ${flag.dimension}: ${flag.issue} → ${flag.suggestion}`);
    }
  }

  console.log();
  console.log("=".repeat(70));
  console.log("DONE");
  console.log("=".repeat(70));
  console.log(`Total wall-clock: ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}

main().catch((e) => {
  console.error("Smoke test failed:", e);
  process.exit(1);
});
