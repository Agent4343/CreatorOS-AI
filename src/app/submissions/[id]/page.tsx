import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listUserOrgs } from "@/lib/orgs";
import { supabaseService } from "@/lib/supabase/server";
import type {
  FormDefinition,
  SignatureAssignments,
  Submission,
} from "@/lib/types";
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

  const memberOrg = orgs.find((o) => o.org.id === s.org_id);
  if (!memberOrg) notFound();

  const schema = s.form_versions?.schema;
  if (!schema) throw new Error("Form schema missing for submission");

  const { data: sigs } = await sb
    .from("submission_signatures")
    .select("field_id, signer_name, signed_at")
    .eq("submission_id", s.id);
  const signed = (sigs ?? []) as {
    field_id: string;
    signer_name: string;
    signed_at: string;
  }[];

  // Resolve user_id → name for handoff UI: starter, last editor, and
  // every teammate who can pick up the form. Single org-scoped query.
  const { data: members } = await sb
    .from("memberships")
    .select("user_id, full_name, role")
    .eq("org_id", s.org_id);
  const memberRows =
    (members ?? []) as { user_id: string; full_name: string | null; role: string }[];
  const nameById: Record<string, string> = {};
  for (const m of memberRows) {
    nameById[m.user_id] = m.full_name ?? "Teammate";
  }

  // Open-clipboard permission: any member can continue an in-progress
  // form. The PATCH route enforces the same rule and audits cross-user
  // edits.
  const canEdit = s.status !== "completed" && s.status !== "rejected";

  // Teammates available for handoff = everyone in the org except the
  // current user. We don't try to filter to "active" workers — small
  // crews + offline shifts make any "online" signal noisy.
  const teammates = memberRows
    .filter((m) => m.user_id !== user.id)
    .map((m) => ({
      user_id: m.user_id,
      name: m.full_name ?? "Teammate",
    }));

  const assignments: SignatureAssignments = s.signature_assignments ?? {};

  // Section-level role gating context. We need: every role the schema
  // references, the user's membership in those roles, and the
  // inductee's email (derived from the signature assignment in the
  // section flagged inductee_section). Resolved once server-side so
  // the runner can compute locks without extra round-trips.
  const referencedRoleIds = new Set<string>();
  for (const sec of schema.sections) {
    if (sec.required_role_id) referencedRoleIds.add(sec.required_role_id);
  }
  const userRoleIds: string[] = [];
  const roleNameById: Record<string, string> = {};
  if (referencedRoleIds.size > 0) {
    const { data: roleRows } = await sb
      .from("org_roles")
      .select("id, name, members")
      .eq("org_id", s.org_id)
      .in("id", Array.from(referencedRoleIds));
    const userEmailLc = (user.email ?? "").toLowerCase();
    for (const r of (roleRows ?? []) as Array<{
      id: string;
      name: string;
      members: { email: string }[];
    }>) {
      roleNameById[r.id] = r.name;
      const memberEmails = (r.members ?? []).map((m) => m.email.toLowerCase());
      if (memberEmails.includes(userEmailLc)) userRoleIds.push(r.id);
    }
  }
  let inducteeEmail: string | null = null;
  for (const section of schema.sections) {
    if (!section.inductee_section) continue;
    for (const f of section.fields) {
      if (f.type !== "signature") continue;
      const a = assignments[f.id];
      if (!a) continue;
      if ((a as { kind?: string }).kind === "role") continue;
      const email = (a as { email?: string }).email;
      if (email) {
        inducteeEmail = email.toLowerCase();
        break;
      }
    }
    if (inducteeEmail) break;
  }

  // Count other submissions in the same batch — used by the runner to
  // surface 'Apply to N siblings' and 'Sign for all' affordances.
  let batchSiblingCount = 0;
  if (s.batch_id) {
    const { count } = await sb
      .from("submissions")
      .select("id", { count: "exact", head: true })
      .eq("batch_id", s.batch_id)
      .eq("org_id", s.org_id)
      .neq("id", s.id);
    batchSiblingCount = count ?? 0;
  }

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
      currentUserEmail={(user.email ?? "").toLowerCase()}
      starter={{
        user_id: s.started_by,
        name: nameById[s.started_by] ?? "Teammate",
        is_self: s.started_by === user.id,
      }}
      lastEditor={
        s.last_edited_by && s.last_edited_by !== s.started_by
          ? {
              user_id: s.last_edited_by,
              name: nameById[s.last_edited_by] ?? "Teammate",
              at: s.last_edited_at ?? null,
            }
          : null
      }
      teammates={teammates}
      signatureAssignments={assignments}
      batchId={s.batch_id ?? null}
      batchSiblingCount={batchSiblingCount}
      userRoleIds={userRoleIds}
      roleNameById={roleNameById}
      inducteeEmail={inducteeEmail}
    />
  );
}
