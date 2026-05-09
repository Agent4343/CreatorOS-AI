"use client";

import { useState } from "react";
import { TIERS, type Tier } from "@/lib/stripe";

type OrgBilling = {
  id: string;
  plan: string;
  subscription_status: string | null;
  current_period_end: string | null;
  seats: number | null;
};

export default function BillingSection({
  org,
  isOwner,
  memberCount,
}: {
  org: OrgBilling;
  isOwner: boolean;
  memberCount: number;
}) {
  const [busy, setBusy] = useState<"checkout" | "portal" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tier, setTier] = useState<Tier>("starter");
  const [seats, setSeats] = useState<number>(Math.max(1, memberCount));

  async function startCheckout() {
    setBusy("checkout");
    setError(null);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id, tier, seats }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy("portal");
    setError(null);
    try {
      const res = await fetch("/api/billing/portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: org.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      window.location.href = body.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setBusy(null);
    }
  }

  const isPaid = org.plan === "starter" || org.plan === "pro";
  const isPastDue = org.subscription_status === "past_due";

  return (
    <section className="rounded-lg border border-ink/15 bg-white p-5">
      <h2 className="text-lg font-bold">Billing</h2>

      <div className="mt-3 rounded-md border border-ink/10 bg-bg p-3 text-sm">
        <div className="font-mono text-xs uppercase tracking-wider text-muted">
          Current
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span className="text-base font-semibold capitalize">
            {org.plan}
          </span>
          <span
            className={
              "font-mono text-xs " +
              (isPastDue
                ? "text-err"
                : isPaid
                  ? "text-ok"
                  : "text-muted")
            }
          >
            {org.subscription_status ?? (isPaid ? "active" : "no subscription")}
          </span>
        </div>
        {org.seats != null && (
          <div className="mt-1 font-mono text-xs text-muted">
            {org.seats} seats
            {org.seats < memberCount && (
              <span className="ml-2 text-warn">
                (you have {memberCount} members — top up seats)
              </span>
            )}
          </div>
        )}
        {org.current_period_end && (
          <div className="mt-1 font-mono text-xs text-muted">
            Renews {new Date(org.current_period_end).toLocaleDateString()}
          </div>
        )}
      </div>

      {!isOwner && (
        <p className="mt-3 text-xs text-muted">
          Only the workspace owner can change the plan.
        </p>
      )}

      {isOwner && !isPaid && (
        <div className="mt-4 space-y-3">
          <h3 className="text-sm font-semibold">Pick a plan</h3>
          <div className="grid gap-2 md:grid-cols-2">
            {(Object.keys(TIERS) as Tier[]).map((t) => (
              <label
                key={t}
                className={
                  "cursor-pointer rounded-md border p-3 " +
                  (tier === t
                    ? "border-accent bg-accent/5"
                    : "border-ink/15 hover:border-ink/30")
                }
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">{TIERS[t].name}</span>
                  <span className="font-mono text-sm">
                    ${TIERS[t].per_user_monthly}
                    <span className="text-xs text-muted"> / user / mo</span>
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {TIERS[t].description}
                </p>
                <input
                  type="radio"
                  name="tier"
                  value={t}
                  checked={tier === t}
                  onChange={() => setTier(t)}
                  className="hidden"
                />
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm">
              Seats:
              <input
                type="number"
                min={1}
                max={500}
                value={seats}
                onChange={(e) => setSeats(Math.max(1, Number(e.target.value)))}
                className="ml-2 w-20 rounded-md border border-ink/20 bg-white p-1 text-sm"
              />
            </label>
            <span className="font-mono text-sm">
              = ${TIERS[tier].per_user_monthly * seats} / mo
            </span>
            <button
              type="button"
              onClick={startCheckout}
              disabled={busy !== null}
              className="ml-auto rounded-md bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50"
            >
              {busy === "checkout" ? "Starting…" : "Subscribe"}
            </button>
          </div>
          <p className="text-[11px] text-muted">
            You'll be redirected to Stripe to enter payment details. Cancel
            any time from the customer portal.
          </p>
        </div>
      )}

      {isOwner && isPaid && (
        <div className="mt-4">
          <button
            type="button"
            onClick={openPortal}
            disabled={busy !== null}
            className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink disabled:opacity-50"
          >
            {busy === "portal" ? "Opening…" : "Manage subscription"}
          </button>
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
          {error}
        </div>
      )}
    </section>
  );
}
