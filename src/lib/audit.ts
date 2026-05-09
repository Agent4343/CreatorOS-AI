import { requestFingerprint } from "./auth";
import { supabaseService } from "./supabase/server";

/**
 * Write a row to the org's audit log. Append-only at the DB level
 * (triggers reject UPDATE and DELETE), but we still go through the
 * service role for clarity.
 *
 * Every consequential action in the app should call this. If it
 * doesn't show up in audit_logs, it didn't happen.
 *
 * Common actions:
 *   form.created · form.updated · form.archived · form.imported
 *   submission.created · submission.completed · submission.signed
 *   member.invited · member.removed · member.role_changed
 *   export.pdf · export.csv
 *   auth.login_success · auth.login_failed
 */
export async function writeAudit(args: {
  orgId: string;
  actorUserId: string | null;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { ip_address, user_agent } = await requestFingerprint();
  const sb = supabaseService();
  const { error } = await sb.from("audit_logs").insert({
    org_id: args.orgId,
    actor_user_id: args.actorUserId,
    action: args.action,
    resource_type: args.resourceType,
    resource_id: args.resourceId ?? null,
    metadata: args.metadata ?? {},
    ip_address,
    user_agent,
  });
  if (error) {
    // Audit failures should never silently drop. Log loudly server-side
    // but don't fail the user's action — the alternative (rolling back
    // a successful submission because audit failed) is worse than a
    // missing audit row.
    console.error("[AUDIT WRITE FAILED]", error, args);
  }
}
