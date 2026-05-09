import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type { FormDefinition, Submission } from "@/lib/types";
import SubmissionRunner from "./SubmissionRunner";

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireUser();
  const orgs = await listUserOrgs(user.id);
  if (orgs.length === 0) redirect("/onboarding");

  const { id } = await params;
  const sb = supabaseService();
  const { data: submission, error: subErr } = await sb
    .from("submissions")
    .select("*, form_versions(schema), forms(name)")
    .eq("id", id)
    .maybeSingle();
  if (subErr) throw subErr;
  if (!submission) notFound();
  type Joined = Submission & {
    form_versions: { schema: FormDefinition } | null;
    forms: { name: string } | null;
  };
  const s = submission as unknown as Joined;

  // Verify the user is in this submission's org.
  const memberOrg = orgs.find((o) => o.org.id === s.org_id);
  if (!memberOrg) notFound();

  const schema = s.form_versions?.schema;
  if (!schema) throw new Error("Form schema missing for submission");

  // Pull existing signatures for this submission so the UI knows
  // which signature fields are already signed (and by whom).
  const { data: sigs } = await sb
    .from("submission_signatures")
    .select("field_id, signer_name, signed_at")
    .eq("submission_id", s.id);
  const signed = (sigs ?? []) as {
    field_id: string;
    signer_name: string;
    signed_at: string;
  }[];

  const isOwner = s.started_by === user.id;
  const role = memberOrg.role;
  const canEdit =
    s.status !== "completed" &&
    s.status !== "rejected" &&
    (isOwner || role === "owner" || role === "admin");

  return (
    <SubmissionRunner
      submission={{
        id: s.id,
        org_id: s.org_id,
        status: s.status,
        data: s.data,
        form_name: s.forms?.name ?? "Form",
      }}
      schema={schema}
      signedFields={signed}
      canEdit={canEdit}
      currentUserId={user.id}
    />
  );
}
