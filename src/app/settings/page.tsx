import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type { AuditLog, Membership } from "@/lib/types";
import BillingSection from "./BillingSection";
import InviteSection from "./InviteSection";
import NotificationsSection from "./NotificationsSection";
import RolesSection, { type Role } from "./RolesSection";

type PendingInvite = {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  token: string;
  expires_at: string;
  created_at: string;
};

type OrgWithBilling = {
  id: string;
  name: string;
  plan: string;
  subscription_status: string | null;
  current_period_end: string | null;
  seats: number | null;
  notification_emails: string[] | null;
  notify_on_completion: boolean | null;
};

export default async function SettingsPage() {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org, role } = orgs[0];
  const isAdmin = role === "owner" || role === "admin";
  const isOwner = role === "owner";

  const sb = supabaseService();

  // Fetch the full billing state — listUserOrgs only returns the
  // baseline columns.
  const { data: orgRow } = await sb
    .from("orgs")
    .select(
      "id, name, plan, subscription_status, current_period_end, seats, notification_emails, notify_on_completion",
    )
    .eq("id", org.id)
    .maybeSingle();
  const billing = (orgRow ?? null) as OrgWithBilling | null;

  const { data: members } = await sb
    .from("memberships")
    .select("id, user_id, role, full_name, created_at")
    .eq("org_id", org.id)
    .order("created_at", { ascending: true });

  // Roles are visible to all org members (UI references their labels);
  // admins can mutate them via the API.
  const { data: roleRows } = await sb
    .from("org_roles")
    .select("id, name, description, members, created_at")
    .eq("org_id", org.id)
    .order("name");
  const roles = (roleRows ?? []) as Role[];

  let pendingInvites: PendingInvite[] = [];
  let audit: AuditLog[] = [];
  if (isAdmin) {
    const { data: invs } = await sb
      .from("invites")
      .select("id, email, role, token, expires_at, created_at")
      .eq("org_id", org.id)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    pendingInvites = (invs ?? []) as PendingInvite[];

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
        <h2 className="text-lg font-bold">Members</h2>
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

      {billing && (
        <BillingSection
          org={billing}
          isOwner={isOwner}
          memberCount={(members as Membership[] | null)?.length ?? 1}
        />
      )}

      {isAdmin && (
        <NotificationsSection
          orgId={org.id}
          initialEmails={billing?.notification_emails ?? []}
          initialEnabled={billing?.notify_on_completion ?? true}
        />
      )}

      {isAdmin && <RolesSection orgId={org.id} initialRoles={roles} />}

      {isAdmin && (
        <InviteSection orgId={org.id} initialPending={pendingInvites} />
      )}

      {isAdmin && (
        <section className="rounded-lg border border-ink/15 bg-white p-5">
          <h2 className="text-lg font-bold">Audit log</h2>
          <p className="mt-1 text-sm text-muted">
            Append-only record of every consequential action. Cannot be modified or deleted.
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
