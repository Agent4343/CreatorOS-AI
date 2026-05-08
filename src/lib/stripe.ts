import Stripe from "stripe";

let _stripe: Stripe | null = null;

export function stripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return _stripe;
}

export type RetainerTier = "solo" | "pro" | "team";

// Price IDs come from your Stripe dashboard. Set these env vars to wire
// the checkout flow to real prices. Prices reflect BIBLE.md §9.
export const RETAINER_TIERS: Record<
  RetainerTier,
  { name: string; monthly: number; priceEnv: string; description: string }
> = {
  solo: {
    name: "Solo",
    monthly: 99,
    priceEnv: "STRIPE_PRICE_SOLO",
    description: "1 voice profile · 4 generations/week",
  },
  pro: {
    name: "Pro",
    monthly: 199,
    priceEnv: "STRIPE_PRICE_PRO",
    description: "1 voice profile · unlimited · QA scorecard · priority support",
  },
  team: {
    name: "Team",
    monthly: 399,
    priceEnv: "STRIPE_PRICE_TEAM",
    description: "Up to 3 voice profiles · unlimited",
  },
};

export function priceIdFor(tier: RetainerTier): string {
  const envName = RETAINER_TIERS[tier].priceEnv;
  const id = process.env[envName];
  if (!id) {
    throw new Error(`${envName} is not set`);
  }
  return id;
}
