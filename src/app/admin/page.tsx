import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { supabaseService } from "@/lib/supabase/server";

type OrgRow = {
  id: string;
  name: string;
  plan: string;
  subscription_status: string | null;
  created_at: string;
  trial_ends_at: string | null;
};

export default async function AdminIndexPage() {
  await requirePlatformAdmin();

  const sb = supabaseService();
  const [orgsRes, counts] = await Promise.all([
    sb
      .from("orgs")
      .select(
        "id, name, plan, subscription_status, created_at, trial_ends_at",
      )
      .order("created_at", { ascending: false }),
    Promise.all([
      sb.from("orgs").select("*", { count: "exact", head: true }),
      sb.from("memberships").select("*", { count: "exact", head: true }),
      sb.from("forms").select("*", { count: "exact", head: true }),
      sb.from("submissions").select("*", { count: "exact", head: true }),
      sb.from("submission_signatures").select("*", { count: "exact", head: true }),
    ]),
  ]);
  if (orgsRes.error) throw orgsRes.error;
  const orgs = (orgsRes.data ?? []) as OrgRow[];
  const [orgsCount, memCount, formCount, subCount, sigCount] = counts;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Platform admin</h1>
        <p className="mt-1 text-sm text-muted">
          Read-only across every customer org. Bypasses RLS via the service
          role — use sparingly.
        </p>
      </div>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Orgs" value={orgsCount.count ?? 0} />
        <Stat label="Members" value={memCount.count ?? 0} />
        <Stat label="Forms" value={formCount.count ?? 0} />
        <Stat label="Submissions" value={subCount.count ?? 0} />
        <Stat label="Signatures" value={sigCount.count ?? 0} />
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          All orgs
        </h2>
        <div className="mt-3 space-y-2">
          {orgs.length === 0 && (
            <div className="rounded-md border border-ink/15 bg-white p-4 text-sm text-muted">
              No orgs yet. Sign up at /login to create the first one.
            </div>
          )}
          {orgs.map((o) => (
            <a
              key={o.id}
              href={`/admin/orgs/${o.id}`}
              className="flex items-center justify-between rounded-md border border-ink/15 bg-white p-3 no-underline text-ink"
            >
              <span>
                <span className="font-semibold">{o.name}</span>
                <span className="ml-2 font-mono text-xs text-muted">
                  · {o.plan}
                </span>
                {o.subscription_status && (
                  <span className="ml-2 font-mono text-xs text-muted">
                    · {o.subscription_status}
                  </span>
                )}
              </span>
              <span className="font-mono text-xs text-muted">
                {new Date(o.created_at).toLocaleDateString()}
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
    <div className="rounded-lg border border-ink/15 bg-white p-3">
      <div className="text-[10px] uppercase tracking-wider text-muted">
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}
