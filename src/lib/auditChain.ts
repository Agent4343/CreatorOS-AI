import { createHash } from "node:crypto";
import { supabaseService } from "@/lib/supabase/server";

/**
 * Verify the per-org audit hash chain.
 *
 * Walks every audit_logs row for the org in created_at order, recomputes
 * hash_self from hash_prev + payload, and reports the first row whose
 * recomputed hash doesn't match the stored hash_self. That row (and
 * every row after it) is suspect — the chain forward of an edit
 * always breaks.
 *
 * Returns { ok: true } when intact, otherwise the row id + index that
 * fails first. The caller decides what to do (escalate to admin,
 * raise a ticket, mark the org for forensic review).
 *
 * Called from a CLI / maintenance endpoint, not on hot paths — the
 * cost is O(rows in org) and the read is unbounded.
 */
export type AuditChainResult =
  | { ok: true; rows: number }
  | { ok: false; rows: number; broken_at_index: number; broken_id: string };

export async function verifyAuditChain(orgId: string): Promise<AuditChainResult> {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("audit_logs")
    .select(
      "id, org_id, actor_user_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at, hash_prev, hash_self",
    )
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as {
    id: string;
    org_id: string;
    actor_user_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    metadata: unknown;
    ip_address: string | null;
    user_agent: string | null;
    created_at: string;
    hash_prev: string | null;
    hash_self: string | null;
  }[];

  let prev = "";
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    // Mirror the trigger payload in 0008_audit_chain.sql — structural
    // fields only (metadata omitted), ISO 8601 ms-precision UTC for
    // the timestamp so the byte-for-byte string matches Postgres'
    // to_char output in the trigger.
    const ts = new Date(r.created_at).toISOString();
    const payload = [
      r.org_id,
      r.actor_user_id ?? "",
      r.action,
      r.resource_type,
      r.resource_id ?? "",
      r.ip_address ?? "",
      r.user_agent ?? "",
      ts,
      prev,
    ].join("|");
    const expected = createHash("sha256").update(payload).digest("hex");
    if (r.hash_prev !== prev || r.hash_self !== expected) {
      return {
        ok: false,
        rows: rows.length,
        broken_at_index: i,
        broken_id: r.id,
      };
    }
    prev = r.hash_self ?? "";
  }
  return { ok: true, rows: rows.length };
}
