import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platformAdmin";
import { supabaseService } from "@/lib/supabase/server";
import type { AuditLog, Form, Membership } from "@/lib/types";

type OrgRow = {
  id: string;
  name: string;
  plan: string;
  subscription_status: string | null;
  current_period_end: string | null;
  seats: number | null;
  trial_ends_at: string | null;
  stripe_customer_id: string | null;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  status: string;
  topic?: string;
  form_id: string;
  created_at: string;
  completed_at: string | null;
};

export default async function AdminOrgDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;

  const sb = supabaseService();
  const [orgRes, members, forms, subs, audit] = await Promise.all([
    sb.from("orgs").select("*").eq("id", id).maybeSingle(),
    sb
      .from("memberships")
      .select("*")
      .eq("org_id", id)
      .order("created_at", { ascending: true }),
    sb
      .from("forms")
      .select("id, name, current_version, archived, updated_at")
      .eq("org_id", id)
      .order("updated_at", { ascending: false }),
    sb
      .from("submissions")
      .select("id, status, form_id, created_at, completed_at")
      .eq("org_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    sb
      .from("audit_logs")
      .select("*")
      .eq("org_id", id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  if (!orgRes.data) notFound();
  const org = orgRes.data as OrgRow;

  return (
    <div className="space-y-6">
      <div>
        <a href="/admin" className="font-mono text-xs">
          ← back to admin
        </a>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">{org.name}</h1>
        <p className="mt-1 font-mono text-xs text-muted">
          {org.id} · plan: {org.plan}
          {org.subscription_status && ` · ${org.subscription_status}`}
          {org.seats != null && ` · ${org.seats} seats`}
          {org.current_period_end &&
            ` · renews ${new Date(org.current_period_end).toLocaleDateString()}`}
        </p>
        <p className="mt-1 font-mono text-xs text-muted">
          Created {new Date(org.created_at).toLocaleString()}
          {org.stripe_customer_id && ` · stripe ${org.stripe_customer_id}`}
        </p>
      </div>

      <section className="rounded-lg border border-ink/15 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Members ({members.data?.length ?? 0})
        </h2>
        <div className="mt-2 space-y-1 text-sm">
          {((members.data as Membership[] | null) ?? []).map((m) => (
            <div
              key={m.id}
              className="flex justify-between border-b border-ink/5 py-1"
            >
              <span>{m.full_name ?? m.user_id.slice(0, 8) + "…"}</span>
              <span className="font-mono text-xs text-muted">
                {m.role} · {new Date(m.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/15 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Forms ({forms.data?.length ?? 0})
        </h2>
        <div className="mt-2 space-y-1 text-sm">
          {((forms.data as Form[] | null) ?? []).map((f) => (
            <div
              key={f.id}
              className="flex justify-between border-b border-ink/5 py-1"
            >
              <span>
                {f.name}
                {f.archived && (
                  <span className="ml-2 font-mono text-xs text-muted">archived</span>
                )}
              </span>
              <span className="font-mono text-xs text-muted">
                v{f.current_version} ·{" "}
                {new Date(f.updated_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/15 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Submissions ({subs.data?.length ?? 0} most recent)
        </h2>
        <div className="mt-2 space-y-1 text-sm">
          {((subs.data as SubmissionRow[] | null) ?? []).map((s) => (
            <div
              key={s.id}
              className="flex justify-between border-b border-ink/5 py-1"
            >
              <span className="font-mono text-xs">
                {s.id.slice(0, 8)}…
              </span>
              <span className="font-mono text-xs text-muted">
                {s.status} · {new Date(s.created_at).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-ink/15 bg-white p-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">
          Audit log (latest 100)
        </h2>
        <div className="mt-2 space-y-1 font-mono text-xs">
          {((audit.data as AuditLog[] | null) ?? []).map((a) => (
            <div
              key={a.id}
              className="flex justify-between border-b border-ink/5 py-1"
            >
              <span>
                <span className="text-accent">{a.action}</span>
                {a.resource_type && (
                  <span className="text-muted"> · {a.resource_type}</span>
                )}
              </span>
              <span className="text-muted">
                {new Date(a.created_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
