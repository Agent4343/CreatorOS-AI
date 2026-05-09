import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type { AuditLog, Membership } from "@/lib/types";

export default async function SettingsPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org, role } = orgs[0];
  const isAdmin = role === "owner" || role === "admin";

  const sb = supabaseService();
  const { data: members } = await sb
    .from("memberships")
    .select("id, user_id, role, full_name, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  let audit: AuditLog[] = [];
  if (isAdmin) {
    const { data } = await sb
      .from("audit_logs")
      .select("*")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(50);
    audit = (data ?? []) as AuditLog[];
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 font-mono text-xs text-muted">
          {org.name} · plan: {org.plan} · your role: {role}
        </p>
      </div>

      <section className="rounded-lg border border-ink/15 bg-white p-5">
        <h2 className="text-lg font-bold">Team</h2>
        <p className="mt-1 text-sm text-muted">
          Invites are not wired in this build — coming next. Members today
          can be added via Supabase auth + a manual memberships row.
        </p>
        <div className="mt-3 space-y-1">
          {(members as Membership[] | null)?.map((m) => (
            <div
              key={m.id}
              className="flex items-baseline justify-between border-b border-ink/5 py-2 text-sm"
            >
              <span>{m.full_name ?? m.user_id.slice(0, 8) + "…"}</span>
              <span className="font-mono text-xs text-muted">{m.role}</span>
            </div>
          ))}
        </div>
      </section>

      {isAdmin && (
        <section className="rounded-lg border border-ink/15 bg-white p-5">
          <h2 className="text-lg font-bold">Audit log</h2>
          <p className="mt-1 text-sm text-muted">
            Append-only record of every consequential action in your
            workspace. Cannot be modified or deleted.
          </p>
          <div className="mt-3 space-y-1 font-mono text-xs">
            {audit.length === 0 && (
              <p className="text-muted">No audit entries yet.</p>
            )}
            {audit.map((a) => (
              <div
                key={a.id}
                className="flex items-baseline justify-between border-b border-ink/5 py-1.5"
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
      )}
    </div>
  );
}
