import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { priceIdFor, stripe, Tier, TIERS } from "@/lib/stripe";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Start a Stripe Checkout session for a tier. Owner-only — paying for
 * the org is an owner-level decision.
 *
 * Creates the Stripe Customer if the org doesn't have one yet and
 * stashes the customer_id on the org row. Quantity = the seat count
 * the owner picked at checkout (defaults to current member count).
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      org_id?: string;
      tier?: Tier;
      seats?: number;
    };
    if (!body.org_id || !body.tier) {
      return NextResponse.json(
        { error: "org_id and tier required" },
        { status: 400 },
      );
    }
    if (!TIERS[body.tier]) {
      return NextResponse.json({ error: "Unknown tier" }, { status: 400 });
    }
    await requireRole(body.org_id, "owner");

    const sb = supabaseService();
    const { data: org, error: orgErr } = await sb
      .from("orgs")
      .select("id, name, stripe_customer_id")
      .eq("id", body.org_id)
      .maybeSingle();
    if (orgErr) throw orgErr;
    if (!org) {
      return NextResponse.json({ error: "Org not found" }, { status: 404 });
    }
    const o = org as {
      id: string;
      name: string;
      stripe_customer_id: string | null;
    };

    let customerId = o.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: user.email ?? undefined,
        name: o.name,
        metadata: { org_id: o.id },
      });
      customerId = customer.id;
      const { error: updErr } = await sb
        .from("orgs")
        .update({ stripe_customer_id: customerId })
        .eq("id", o.id);
      if (updErr) throw updErr;
    }

    // Default to current member count if no explicit seats.
    let seats = body.seats;
    if (!seats || seats < 1) {
      const { count } = await sb
        .from("memberships")
        .select("*", { count: "exact", head: true })
        .eq("org_id", o.id);
      seats = Math.max(1, count ?? 1);
    }

    const origin = req.nextUrl.origin;
    const session = await stripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [
        {
          price: priceIdFor(body.tier),
          quantity: seats,
        },
      ],
      metadata: { org_id: o.id, tier: body.tier },
      subscription_data: {
        metadata: { org_id: o.id, tier: body.tier },
      },
      success_url: `${origin}/settings?billing=success`,
      cancel_url: `${origin}/settings?billing=cancelled`,
      allow_promotion_codes: true,
    });

    await writeAudit({
      orgId: o.id,
      actorUserId: user.id,
      action: "billing.checkout_started",
      resourceType: "org",
      resourceId: o.id,
      metadata: { tier: body.tier, seats },
    });

    return NextResponse.json({ url: session.url });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
