import Anthropic from "@anthropic-ai/sdk";

export const MODEL = "claude-opus-4-7";

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
