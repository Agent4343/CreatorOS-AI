import { requireAdmin } from "@/lib/admin";
import { adminCounts, adminListCreators } from "@/lib/db";

export default async function AdminPage() {
  await requireAdmin();
  const [counts, creators] = await Promise.all([
    adminCounts(),
    adminListCreators(),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">Admin</h1>
        <p className="mt-2 text-sm text-ink/70">
          Bypasses RLS via the service role. Founder review queue per BIBLE.md §6 Phase 0.
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <Stat label="Creators" value={counts.creators} />
        <Stat label="Style profiles" value={counts.voice_profiles} />
        <Stat label="Generations" value={counts.generations} />
      </div>

      <section>
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          All creators
        </h2>
        <div className="mt-3 space-y-2">
          {creators.length === 0 && (
            <div className="rounded-md border border-ink/15 bg-white/40 p-4 text-sm text-ink/60">
              No creators yet. Once you sign up and complete onboarding, you'll show up here.
            </div>
          )}
          {creators.map((c) => (
            <a
              key={c.id}
              href={`/admin/creators/${c.id}`}
              className="flex items-center justify-between rounded-md border border-ink/15 bg-white/40 p-3 font-sans text-sm no-underline text-ink"
            >
              <span>
                <span className="font-semibold">
                  {c.display_name ?? "(no display name)"}
                </span>
                {c.niche && <span className="text-ink/60"> · {c.niche}</span>}
              </span>
              <span className="font-mono text-xs text-ink/50">
                {new Date(c.created_at).toLocaleDateString()}
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white/40 p-4">
      <div className="text-xs uppercase tracking-wider text-ink/50">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
