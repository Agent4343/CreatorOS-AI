import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type { Form } from "@/lib/types";
import FormEditor from "./FormEditor";

export default async function EditFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");
  const { org, role } = orgs[0];
  if (role !== "owner" && role !== "admin") {
    redirect(`/forms/${(await params).id}`);
  }

  const { id } = await params;
  const sb = supabaseService();
  const { data, error } = await sb
    .from("forms")
    .select("*")
    .eq("id", id)
    .eq("org_id", org.id)
    .maybeSingle();
  if (error) throw error;
  if (!data) notFound();
  const form = data as Form;

  // Org's role rosters — drives the per-signature "required role"
  // dropdown. Empty array = no roles defined yet (link them to
  // Settings → Role rosters).
  const { data: rolesData } = await sb
    .from("org_roles")
    .select("id, name")
    .eq("org_id", org.id)
    .order("name");
  const roles = (rolesData ?? []) as { id: string; name: string }[];

  return <FormEditor form={form} roles={roles} />;
}
