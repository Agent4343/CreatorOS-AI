import { Persona, Script } from "../types";
import { COMEDY_SYSTEM } from "./comedy";
import { FACTS_SYSTEM } from "./facts";
import { HOOK_SYSTEM } from "./hook";
import { MONETIZATION_SYSTEM } from "./monetization";
import { PACING_SYSTEM } from "./pacing";
import { PERSONA_FIT_SYSTEM } from "./personaFit";
import { runReviewer } from "./runReviewer";
import { ReviewScorecard, ReviewScorecardSchema } from "./types";

export * from "./types";

/**
 * Run all six reviewers in parallel against one generated script. Total
 * wall-clock ~10s, total cost ~$0.60 (six Claude calls with cached
 * persona+script prefix). The combined scorecard is what the user sees
 * before the script is sent to ElevenLabs / HeyGen.
 *
 *   monetization_blocked: any "critical" issue in monetization.score is
 *     a hard gate — render must not proceed. The user is forced to
 *     regenerate or edit.
 *   overall_pass: every dimension scored ≥ 7 AND no monetization block.
 *     Cleanly green-lit; one-click approve to continue to render.
 */
export async function reviewScript(args: {
  persona: Persona;
  topic: string;
  targetDurationSec: number;
  script: Script;
}): Promise<ReviewScorecard> {
  const ctx = {
    persona: args.persona,
    topic: args.topic,
    targetDurationSec: args.targetDurationSec,
    script: args.script,
  };

  const [
    monetization,
    hook,
    persona_fit,
    comedy,
    pacing,
    facts,
  ] = await Promise.all([
    runReviewer({ systemPrompt: MONETIZATION_SYSTEM, ...ctx }),
    runReviewer({ systemPrompt: HOOK_SYSTEM, ...ctx }),
    runReviewer({ systemPrompt: PERSONA_FIT_SYSTEM, ...ctx }),
    runReviewer({ systemPrompt: COMEDY_SYSTEM, ...ctx }),
    runReviewer({ systemPrompt: PACING_SYSTEM, ...ctx }),
    runReviewer({ systemPrompt: FACTS_SYSTEM, ...ctx }),
  ]);

  const monetization_blocked = monetization.issues.some(
    (i) => i.severity === "critical",
  );

  const everyPassed =
    monetization.pass &&
    hook.pass &&
    persona_fit.pass &&
    comedy.pass &&
    pacing.pass &&
    facts.pass;

  return ReviewScorecardSchema.parse({
    monetization,
    hook,
    persona_fit,
    comedy,
    pacing,
    facts,
    monetization_blocked,
    overall_pass: !monetization_blocked && everyPassed,
  });
}

/**
 * Synthesize feedback from a scorecard's failed agents into a single
 * paragraph the script generator can consume on a regeneration.
 * Monetization criticals come first because they're non-negotiable.
 */
export function feedbackFromScorecard(scorecard: ReviewScorecard): string {
  const parts: string[] = [];

  const critM = scorecard.monetization.issues.filter(
    (i) => i.severity === "critical",
  );
  if (critM.length > 0) {
    parts.push(
      `MONETIZATION (must fix): ${critM.map((i) => i.text).join("; ")}. ${scorecard.monetization.suggestion}`,
    );
  }

  for (const [name, r] of [
    ["HOOK", scorecard.hook],
    ["PERSONA FIT", scorecard.persona_fit],
    ["COMEDY", scorecard.comedy],
    ["PACING", scorecard.pacing],
  ] as const) {
    if (!r.pass) {
      parts.push(`${name} (score ${r.score}/10): ${r.suggestion}`);
    }
  }

  return parts.join("\n\n");
}
