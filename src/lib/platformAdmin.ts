import { AuthError, requireUser } from "./auth";

/**
 * Platform admin = founder / staff with read access across every
 * customer org. Distinct from per-org roles (owner/admin/member/
 * viewer), which are scoped to a single workspace.
 *
 * Membership in this list is configured via ADMIN_USER_IDS env var,
 * comma-separated Supabase auth user UUIDs. Visible in Supabase →
 * Authentication → Users → user's id column.
 *
 *   ADMIN_USER_IDS=00000000-0000-0000-0000-000000000001,11111111-...
 *
 * Platform admins can read every org's data via the /admin pages.
 * They cannot impersonate or modify customer data through the UI —
 * read-only by design. (Modifications still require service-role
 * code paths; we don't want a bug to let support staff silently edit
 * a customer's signed submission.)
 */
export function isPlatformAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

export async function requirePlatformAdmin() {
  const user = await requireUser();
  if (!isPlatformAdmin(user.id)) {
    throw new AuthError("Platform admin only", 403);
  }
  return user;
}
