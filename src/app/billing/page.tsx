import { requireUser } from "@/lib/auth";
import { getCurrentCreator, getSubscription } from "@/lib/db";
import { RETAINER_TIERS, RetainerTier } from "@/lib/stripe";
import { TierCard } from "./TierCard";

export default async function BillingPage() {
  const user = await requireUser();
  const creator = await getCurrentCreator(user.id);
  const sub = creator ? await getSubscription(creator.id) : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-2 text-ink/70">
          Setup is one-time and contracted directly. Software retainers are
          monthly and cancellable at any time.
        </p>
      </div>

      {sub && (
        <div className="rounded-md border border-ink/15 bg-white/40 p-4 text-sm">
          <span className="font-mono text-xs uppercase tracking-wider text-ink/50">
            Current plan ·{" "}
          </span>
          <span className="font-semibold">
            {sub.tier ? RETAINER_TIERS[sub.tier as RetainerTier]?.name : "—"}
          </span>
          <span className="ml-2 text-ink/60">
            (status: {sub.status}
            {sub.current_period_end
              ? ` · renews ${new Date(sub.current_period_end).toLocaleDateString()}`
              : ""}
            )
          </span>
        </div>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        {(Object.keys(RETAINER_TIERS) as RetainerTier[]).map((tier) => (
          <TierCard key={tier} tier={tier} />
        ))}
      </section>

      <section className="rounded-md border border-ink/15 bg-white/40 p-5 text-sm text-ink/75">
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          Setup (Done-For-You)
        </h2>
        <p className="mt-2">
          Setup is contracted by hand. Email{" "}
          <a href="mailto:setup@creatoros.ai">setup@creatoros.ai</a> to start.
        </p>
        <ul className="mt-3 list-disc space-y-1 pl-5">
          <li>
            <strong>Starter</strong> — $1,500 · voice profile + 1 workflow live
            + training
          </li>
          <li>
            <strong>Studio</strong> — $3,000 · 3 workflows + custom hook/CTA
            libraries + 30-day support
          </li>
        </ul>
      </section>
    </div>
  );
}
