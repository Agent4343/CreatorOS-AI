import Anthropic from "@anthropic-ai/sdk";

/**
 * Default high-accuracy model for vision-heavy tasks like
 * paper-to-digital import. Use this when the source is a phone photo,
 * handwritten markup, or anything where the model has to reason about
 * faded ink, skewed scans, etc.
 */
export const MODEL = "claude-opus-4-7";

/**
 * Cheaper, faster alternative for clean inputs. Sonnet 4.6 is roughly
 * 5× cheaper per token; on digitally-clean PDFs the accuracy gap is
 * small. We expose this as a "fast mode" toggle on the import UI so
 * cost-sensitive users can opt into it for typical forms.
 */
export const MODEL_FAST = "claude-sonnet-4-6";

let _client: Anthropic | null = null;

export function client(): Anthropic {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error("ANTHROPIC_API_KEY is not set");
    }
    _client = new Anthropic();
  }
  return _client;
}
