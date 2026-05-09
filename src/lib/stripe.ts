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

export type Tier = "starter" | "pro";

export const TIERS: Record<
  Tier,
  { name: string; per_user_monthly: number; price_env: string; description: string }
> = {
  starter: {
    name: "Starter",
    per_user_monthly: 19,
    price_env: "STRIPE_PRICE_STARTER",
    description: "Up to 10 users · unlimited forms · 20 AI imports / mo",
  },
  pro: {
    name: "Pro",
    per_user_monthly: 39,
    price_env: "STRIPE_PRICE_PRO",
    description: "Up to 50 users · unlimited AI import · audit-log export · multi-signer flows",
  },
};

export function priceIdFor(tier: Tier): string {
  const env = TIERS[tier].price_env;
  const id = process.env[env];
  if (!id) throw new Error(`${env} is not set`);
  return id;
}
