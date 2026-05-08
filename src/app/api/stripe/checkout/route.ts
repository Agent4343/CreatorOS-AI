import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentCreator, upsertCreator } from "@/lib/db";
import { supabaseService } from "@/lib/supabase/server";
import {
  RETAINER_TIERS,
  RetainerTier,
  priceIdFor,
  stripe,
} from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { tier } = (await req.json()) as { tier: RetainerTier };

    if (!RETAINER_TIERS[tier]) {
      return NextResponse.json({ error: "Unknown tier" }, { status: 400 });
    }

    let creator = await getCurrentCreator(user.id);
    if (!creator) {
      creator = await upsertCreator(user.id, {});
    }

    const sb = supabaseService();
    const { data: existing } = await sb
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("creator_id", creator.id)
      .maybeSingle();

    let stripeCustomerId = existing?.stripe_customer_id;
    if (!stripeCustomerId) {
      const customer = await stripe().customers.create({
        email: user.email,
        metadata: { creator_id: creator.id, user_id: user.id },
      });
      stripeCustomerId = customer.id;
      await sb.from("subscriptions").upsert(
        {
          creator_id: creator.id,
          stripe_customer_id: stripeCustomerId,
          status: "incomplete",
        },
        { onConflict: "creator_id" },
      );
    }

    const origin = req.nextUrl.origin;
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: stripeCustomerId,
      line_items: [{ price: priceIdFor(tier), quantity: 1 }],
      metadata: { creator_id: creator.id, tier },
      subscription_data: {
        metadata: { creator_id: creator.id, tier },
      },
      success_url: `${origin}/dashboard?checkout=success`,
      cancel_url: `${origin}/billing?checkout=cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
