import { supabaseService } from "./supabase/server";
import { Membership, Org } from "./types";

/**
 * Return every org the user is a member of, with their role. Used by
 * the org-picker in the layout and by the default-org redirect on
 * sign-in.
 */
export async function listUserOrgs(userId: string): Promise<
  Array<{ org: Org; role: Membership["role"] }>
> {
  const sb = supabaseService();
  const { data, error } = await sb
    .from("memberships")
    .select("role, org_id, orgs(id, name, plan, trial_ends_at, created_at)")
    .eq("user_id", userId);
  if (error) throw error;
  type Joined = {
    role: Membership["role"];
    orgs: Org | null;
  };
  return ((data ?? []) as unknown as Joined[])
    .filter((r) => r.orgs)
    .map((r) => ({ role: r.role, org: r.orgs as Org }));
}

/**
 * Create an org and make the creator the owner.
 * Atomic: both rows go in a transactional pair (no DB transaction
 * primitive in Supabase JS, but we delete the org row if the
 * membership insert fails to avoid orphan orgs).
 */
export async function createOrgWithOwner(args: {
  name: string;
  ownerUserId: string;
  ownerName?: string;
}): Promise<Org> {
  const sb = supabaseService();
  const { data: org, error: orgErr } = await sb
    .from("orgs")
    .insert({ name: args.name })
    .select()
    .single();
  if (orgErr || !org) throw orgErr ?? new Error("Failed to create org");

  const { error: memErr } = await sb.from("memberships").insert({
    org_id: (org as Org).id,
    user_id: args.ownerUserId,
    role: "owner",
    full_name: args.ownerName ?? null,
  });
  if (memErr) {
    await sb.from("orgs").delete().eq("id", (org as Org).id);
    throw memErr;
  }
  return org as Org;
}
