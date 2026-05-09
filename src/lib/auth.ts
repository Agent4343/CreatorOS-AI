import { headers } from "next/headers";
import { supabaseAuthed, supabaseService } from "./supabase/server";
import { Membership, OrgRole } from "./types";

export class AuthError extends Response {
  constructor(message: string, status: number) {
    super(message, { status });
  }
}

/**
 * Throws a 401 Response if the request isn't authenticated.
 * Returns the Supabase auth user.
 */
export async function requireUser() {
  const sb = await supabaseAuthed();
  const { data, error } = await sb.auth.getUser();
  if (error || !data.user) {
    throw new AuthError("Unauthorized", 401);
  }
  return data.user;
}

/**
 * Verify the current user is a member of the given org. Returns the
 * membership row (with role). Throws 403 if not a member.
 *
 * This is the function every server action should call before reading
 * or writing data scoped to a specific org. Even though RLS would
 * also block cross-tenant access, having an explicit check makes the
 * code's security boundary visible at every API surface.
 */
export async function requireMembership(orgId: string): Promise<Membership> {
  const user = await requireUser();
  // Use service role to read memberships so this doesn't depend on
  // RLS being enabled for the lookup itself.
  const sb = supabaseService();
  const { data, error } = await sb
    .from("memberships")
    .select("*")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new AuthError(error.message, 500);
  if (!data) throw new AuthError("Not a member of this org", 403);
  return data as Membership;
}

const ROLE_RANK: Record<OrgRole, number> = {
  viewer: 0,
  member: 1,
  admin: 2,
  owner: 3,
};

/**
 * Like requireMembership but also enforces a minimum role.
 *   requireRole(orgId, "admin")  // owner OR admin allowed
 */
export async function requireRole(
  orgId: string,
  minRole: OrgRole,
): Promise<Membership> {
  const m = await requireMembership(orgId);
  if (ROLE_RANK[m.role] < ROLE_RANK[minRole]) {
    throw new AuthError(`Requires ${minRole} role`, 403);
  }
  return m;
}

/**
 * Pull network-level fingerprint for audit-log + signature purposes.
 * Always called from server context. Best-effort only.
 */
export async function requestFingerprint(): Promise<{
  ip_address: string | null;
  user_agent: string | null;
}> {
  const h = await headers();
  const ip =
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    h.get("x-real-ip") ??
    null;
  const ua = h.get("user-agent");
  return { ip_address: ip, user_agent: ua };
}
