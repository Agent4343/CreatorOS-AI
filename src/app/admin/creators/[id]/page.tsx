import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin";
import {
  adminGetCreator,
  adminListGenerationsForCreator,
  getLatestVoiceProfile,
} from "@/lib/db";
import { ScoredAsset, VoiceProfile } from "@/lib/types";

export default async function AdminCreatorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;

  const creator = await adminGetCreator(id);
  if (!creator) notFound();

  const [voiceRow, generations] = await Promise.all([
    getLatestVoiceProfile(creator.id),
    adminListGenerationsForCreator(creator.id),
  ]);
  const profile = voiceRow?.profile as VoiceProfile | undefined;

  return (
    <div className="space-y-8">
      <div>
        <a href="/admin" className="font-sans text-xs">
          ← back to admin
        </a>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          {creator.display_name ?? "(no display name)"}
        </h1>
        <p className="mt-1 font-sans text-xs text-ink/60">
          creator_id: <span className="font-mono">{creator.id}</span> · user_id:{" "}
          <span className="font-mono">{creator.user_id}</span>
        </p>
        {creator.niche && (
          <p className="mt-1 text-sm text-ink/70">{creator.niche}</p>
        )}
      </div>

      <section className="rounded-lg border border-ink/15 bg-white/40 p-5">
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          Style profile
        </h2>
        {!profile ? (
          <p className="mt-2 text-sm text-ink/60">No profile built yet.</p>
        ) : (
          <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-ink/10 bg-white/60 p-3 font-mono text-xs">
            {JSON.stringify(profile, null, 2)}
          </pre>
        )}
      </section>

      <section>
        <h2 className="font-sans text-xs font-semibold uppercase tracking-wider text-ink/60">
          Generations ({generations?.length ?? 0})
        </h2>
        <div className="mt-3 space-y-3">
          {(!generations || generations.length === 0) && (
            <div className="rounded-md border border-ink/15 bg-white/40 p-4 text-sm text-ink/60">
              No generations yet.
            </div>
          )}
          {generations?.map((g) => {
            const assets = g.assets as ScoredAsset[];
            const passed = assets.filter((a) => a.qa?.overall_pass).length;
            return (
              <details
                key={g.id}
                className="rounded-md border border-ink/15 bg-white/40"
              >
                <summary className="cursor-pointer p-3 font-sans text-sm">
                  <span className="font-mono text-xs text-ink/60">
                    {new Date(g.created_at).toLocaleString()}
                  </span>{" "}
                  · {assets.length} assets · {passed}/{assets.length} pass
                </summary>
                <div className="space-y-2 border-t border-ink/10 p-3">
                  {assets.map((a, i) => (
                    <div
                      key={i}
                      className="rounded-md border border-ink/10 bg-white/60 p-2 font-sans text-xs"
                    >
                      <div className="flex justify-between">
                        <span className="font-mono uppercase tracking-wider text-ink/50">
                          {a.platform} · {a.kind}
                        </span>
                        <span
                          className={
                            a.qa?.overall_pass
                              ? "text-ink/70"
                              : "text-accent"
                          }
                        >
                          {a.qa?.overall_pass ? "pass" : "review"}
                        </span>
                      </div>
                      <div className="mt-1 font-semibold">{a.title}</div>
                      <pre className="mt-1 whitespace-pre-wrap font-serif text-ink/85">
                        {a.body}
                      </pre>
                    </div>
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
