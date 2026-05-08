import { requireUser } from "@/lib/auth";
import {
  getCurrentCreator,
  getLatestVoiceProfile,
  listGenerations,
} from "@/lib/db";
import { ScoredAsset } from "@/lib/types";

export default async function DashboardPage() {
  const user = await requireUser();
  const creator = await getCurrentCreator(user.id);

  if (!creator) {
    return (
      <div className="space-y-6">
        <h1 className="text-3xl font-semibold tracking-tight">Dashboard</h1>
        <div className="rounded-lg border border-ink/15 bg-white/40 p-6">
          <p>You haven't set up your creator profile yet.</p>
          <a
            href="/onboarding"
            className="mt-3 inline-block rounded-md bg-ink px-4 py-2 font-sans text-sm text-cream no-underline"
          >
            Start onboarding
          </a>
        </div>
      </div>
    );
  }

  const [voice, gens] = await Promise.all([
    getLatestVoiceProfile(creator.id),
    listGenerations(creator.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {creator.display_name ?? "Dashboard"}
        </h1>
        {creator.niche && (
          <p className="mt-1 font-sans text-sm text-ink/60">{creator.niche}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Stat label="Style Profile" value={voice ? "ready" : "missing"} />
        <Stat label="Generations" value={String(gens?.length ?? 0)} />
        <Stat
          label="Approval rate"
          value={approvalRate(gens ?? [])}
        />
      </div>

      <section>
        <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-ink/60">
          Recent generations
        </h2>
        <div className="mt-3 space-y-2">
          {(gens ?? []).map((g) => {
            const assets = g.assets as ScoredAsset[];
            const passed = assets.filter((a) => a.qa.overall_pass).length;
            return (
              <a
                key={g.id}
                href={`/api/export?id=${g.id}&format=json`}
                className="flex items-center justify-between rounded-md border border-ink/15 bg-white/40 p-3 font-sans text-sm no-underline text-ink"
              >
                <span>
                  {new Date(g.created_at).toLocaleString()} · {assets.length}{" "}
                  assets
                </span>
                <span className="font-mono text-xs text-ink/60">
                  {passed}/{assets.length} pass
                </span>
              </a>
            );
          })}
          {(!gens || gens.length === 0) && (
            <div className="rounded-md border border-ink/15 bg-white/40 p-4 text-sm text-ink/60">
              No generations yet. <a href="/generate">Generate your first bundle</a>.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function approvalRate(
  gens: Array<{ assets: ScoredAsset[] }>,
): string {
  const all = gens.flatMap((g) => g.assets ?? []);
  if (all.length === 0) return "—";
  const passed = all.filter((a) => a.qa?.overall_pass).length;
  return `${Math.round((passed / all.length) * 100)}%`;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-ink/15 bg-white/40 p-4">
      <div className="text-xs uppercase tracking-wider text-ink/50">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}
