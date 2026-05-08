import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { updateSubscriptionByCustomer } from "@/lib/db";

export const runtime = "nodejs";

// Stripe needs the raw body to verify the signature.
export async function POST(req: NextRequest) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "STRIPE_WEBHOOK_SECRET not set" },
      { status: 500 },
    );
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, sig, secret);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Invalid signature";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string | null;
        await updateSubscriptionByCustomer(customerId, {
          stripe_subscription_id: subscriptionId ?? undefined,
          tier: (session.metadata?.tier as string) ?? undefined,
          status: "active",
        });
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const customerId = sub.customer as string;
        type SubWithPeriodEnd = Stripe.Subscription & {
          current_period_end?: number;
        };
        const periodEnd = (sub as SubWithPeriodEnd).current_period_end;
        await updateSubscriptionByCustomer(customerId, {
          stripe_subscription_id: sub.id,
          tier: (sub.metadata?.tier as string) ?? undefined,
          status: sub.status,
          current_period_end:
            typeof periodEnd === "number"
              ? new Date(periodEnd * 1000).toISOString()
              : undefined,
        });
        break;
      }
      default:
        break;
    }
    return NextResponse.json({ received: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook handler failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
