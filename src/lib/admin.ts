import { requireUser } from "./auth";

/**
 * Admin gate. Set ADMIN_USER_IDS in env to a comma-separated list of
 * Supabase auth user UUIDs (visible in Supabase → Authentication → Users).
 *
 *   ADMIN_USER_IDS=00000000-0000-0000-0000-000000000001,11111111-...
 */
export function isAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.ADMIN_USER_IDS ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(userId);
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!isAdmin(user.id)) {
    throw new Response("Forbidden", { status: 403 });
  }
  return user;
}
