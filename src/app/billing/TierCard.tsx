"use client";

import { useState } from "react";
import { RETAINER_TIERS, RetainerTier } from "@/lib/stripe";

export function TierCard({ tier }: { tier: RetainerTier }) {
  const meta = RETAINER_TIERS[tier];
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function subscribe() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      window.location.href = data.url;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
      setLoading(false);
    }
  }

  return (
    <div className="rounded-lg border border-ink/15 bg-white/40 p-5">
      <div className="font-sans text-xs uppercase tracking-wider text-ink/50">
        {meta.name}
      </div>
      <div className="mt-1">
        <span className="text-3xl font-semibold">${meta.monthly}</span>
        <span className="text-sm text-ink/60"> / mo</span>
      </div>
      <p className="mt-2 text-sm text-ink/75">{meta.description}</p>

      <button
        onClick={subscribe}
        disabled={loading}
        className="mt-4 w-full rounded-md bg-ink px-4 py-2 font-sans text-sm text-cream disabled:opacity-50"
      >
        {loading ? "Starting checkout..." : `Choose ${meta.name}`}
      </button>

      {error && (
        <div className="mt-2 text-xs text-accent">{error}</div>
      )}
    </div>
  );
}
