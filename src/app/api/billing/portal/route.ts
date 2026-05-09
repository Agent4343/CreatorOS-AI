import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { stripe } from "@/lib/stripe";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Open the Stripe customer portal — handles plan changes, payment
 * method updates, invoice downloads, and cancellation. Owner-only.
 */
export async function POST(req: NextRequest) {
  try {
    await requireUser();
    const body = (await req.json()) as { org_id?: string };
    if (!body.org_id) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }
    await requireRole(body.org_id, "owner");

    const sb = supabaseService();
    const { data: org } = await sb
      .from("orgs")
      .select("stripe_customer_id")
      .eq("id", body.org_id)
      .maybeSingle();
    const customerId = (org as { stripe_customer_id: string | null } | null)?.stripe_customer_id;
    if (!customerId) {
      return NextResponse.json(
        { error: "No Stripe customer for this org. Start a checkout first." },
        { status: 409 },
      );
    }

    const session = await stripe().billingPortal.sessions.create({
      customer: customerId,
      return_url: `${req.nextUrl.origin}/settings`,
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
