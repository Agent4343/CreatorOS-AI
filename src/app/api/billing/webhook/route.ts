import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { writeAudit } from "@/lib/audit";
import { stripe } from "@/lib/stripe";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Stripe webhook. Verifies signature, then mirrors subscription state
 * onto the org row so the UI / access checks can read it.
 *
 * Events we care about:
 *   checkout.session.completed       — initial subscription created
 *   customer.subscription.created    — same as above on some flows
 *   customer.subscription.updated    — plan/seat changes, status flips
 *   customer.subscription.deleted    — cancellation
 *   invoice.payment_failed           — flag the org's status
 *
 * Stripe needs the raw body to verify the signature, so we read
 * req.text() rather than req.json().
 */
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
    const msg = e instanceof Error ? e.message : "Bad signature";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = session.customer as string | null;
        const subscriptionId = session.subscription as string | null;
        const orgId = session.metadata?.org_id;
        const tier = session.metadata?.tier;
        if (!orgId) break;
        await applyOrgUpdate(orgId, {
          stripe_customer_id: customerId ?? undefined,
          stripe_subscription_id: subscriptionId ?? undefined,
          plan: tier ?? undefined,
          subscription_status: "active",
        });
        await writeAudit({
          orgId,
          actorUserId: null,
          action: "billing.subscription_started",
          resourceType: "org",
          resourceId: orgId,
          metadata: { tier, subscription_id: subscriptionId },
        });
        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const orgId = sub.metadata?.org_id;
        if (!orgId) break;
        const item = sub.items.data[0];
        const seats = item?.quantity ?? null;
        const tier = sub.metadata?.tier ?? undefined;
        type SubWithPeriodEnd = Stripe.Subscription & {
          current_period_end?: number;
        };
        const periodEnd = (sub as SubWithPeriodEnd).current_period_end;
        await applyOrgUpdate(orgId, {
          stripe_subscription_id: sub.id,
          subscription_status: sub.status,
          current_period_end:
            typeof periodEnd === "number"
              ? new Date(periodEnd * 1000).toISOString()
              : null,
          seats: seats ?? null,
          plan:
            event.type === "customer.subscription.deleted"
              ? "trial"
              : tier,
        });
        await writeAudit({
          orgId,
          actorUserId: null,
          action: `billing.${event.type.replace("customer.subscription.", "subscription_")}`,
          resourceType: "org",
          resourceId: orgId,
          metadata: { status: sub.status, tier, seats },
        });
        break;
      }

      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        const customerId = inv.customer as string | null;
        if (!customerId) break;
        const sb = supabaseService();
        const { data: org } = await sb
          .from("orgs")
          .select("id")
          .eq("stripe_customer_id", customerId)
          .maybeSingle();
        const orgId = (org as { id: string } | null)?.id;
        if (!orgId) break;
        await applyOrgUpdate(orgId, { subscription_status: "past_due" });
        await writeAudit({
          orgId,
          actorUserId: null,
          action: "billing.payment_failed",
          resourceType: "org",
          resourceId: orgId,
          metadata: { invoice_id: inv.id },
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Webhook handler failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function applyOrgUpdate(
  orgId: string,
  fields: {
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
    subscription_status?: string;
    current_period_end?: string | null;
    plan?: string;
    seats?: number | null;
  },
) {
  const sb = supabaseService();
  const cleaned: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (v !== undefined) cleaned[k] = v;
  }
  if (Object.keys(cleaned).length === 0) return;
  const { error } = await sb.from("orgs").update(cleaned).eq("id", orgId);
  if (error) throw error;
}
