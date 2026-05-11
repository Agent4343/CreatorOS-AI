import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import {
  canWriteSection,
  computeSectionLock,
  inducteeEmailFromSubmission,
} from "@/lib/sectionLocks";
import { supabaseService } from "@/lib/supabase/server";
import type {
  FormDefinition,
  SignatureAssignments,
} from "@/lib/types";

export const runtime = "nodejs";

/**
 * "Apply my section to every sibling in this batch."
 *
 * Heli admin runs an induction for 5-8 people in one room. They fill
 * sections 1-2 once and want those values to populate every other
 * inductee's submission in the same batch. Without this, they'd have
 * to switch between 8 forms and re-key identical content.
 *
 * Body: { section_id: string }
 *
 * Effect: for every other submission in the same batch where:
 *   - the section is still writable for this user (open or
 *     reserved_for_me), AND
 *   - the section's signature isn't already signed,
 * copy the field values of this section from this submission into
 * that sibling. Signature field values are not copied (signatures
 * are per-submission and use the /sign endpoint).
 *
 * Re-runnable: copying the same data twice is a no-op.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as { section_id?: string };
    if (!body.section_id) {
      return NextResponse.json(
        { error: "section_id required" },
        { status: 400 },
      );
    }

    const sb = supabaseService();
    const { data: source, error: srcErr } = await sb
      .from("submissions")
      .select(
        "id, org_id, status, data, batch_id, signature_assignments, form_id, form_versions(schema)",
      )
      .eq("id", id)
      .maybeSingle();
    if (srcErr) throw srcErr;
    if (!source) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    type Source = {
      id: string;
      org_id: string;
      status: string;
      data: Record<string, unknown>;
      batch_id: string | null;
      signature_assignments: SignatureAssignments | null;
      form_id: string;
      form_versions: { schema: FormDefinition } | null;
    };
    const s = source as Source;

    await requireMembership(s.org_id);

    if (!s.batch_id) {
      return NextResponse.json(
        { error: "This submission isn't part of a batch" },
        { status: 400 },
      );
    }
    if (s.status === "completed" || s.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot propagate from a ${s.status} submission` },
        { status: 409 },
      );
    }

    const schema = s.form_versions?.schema;
    if (!schema) {
      return NextResponse.json(
        { error: "Schema missing" },
        { status: 500 },
      );
    }
    const sectionIndex = schema.sections.findIndex(
      (sec) => sec.id === body.section_id,
    );
    if (sectionIndex < 0) {
      return NextResponse.json(
        { error: "Unknown section_id" },
        { status: 400 },
      );
    }
    const section = schema.sections[sectionIndex];

    // The user must be allowed to write this section on the source.
    const { data: srcSigs } = await sb
      .from("submission_signatures")
      .select("field_id, signer_name, signed_at")
      .eq("submission_id", s.id);
    const sourceSigned = (srcSigs ?? []) as {
      field_id: string;
      signer_name: string;
      signed_at: string;
    }[];
    const userEmail = (user.email ?? "").toLowerCase();

    // Resolve section-level role context once: which roles the schema
    // references, and which of them the user is a member of. Used for
    // both source and sibling lock evaluation below.
    const referencedRoleIds = new Set<string>();
    for (const sec of schema.sections) {
      if (sec.required_role_id) referencedRoleIds.add(sec.required_role_id);
    }
    const userRoleIds = new Set<string>();
    const roleNameById = new Map<string, string>();
    if (referencedRoleIds.size > 0) {
      const { data: roleRows } = await sb
        .from("org_roles")
        .select("id, name, members")
        .eq("org_id", s.org_id)
        .in("id", Array.from(referencedRoleIds));
      for (const r of (roleRows ?? []) as Array<{
        id: string;
        name: string;
        members: { email: string }[];
      }>) {
        roleNameById.set(r.id, r.name);
        const memberSet = new Set(
          (r.members ?? []).map((m) => m.email.toLowerCase()),
        );
        if (memberSet.has(userEmail)) userRoleIds.add(r.id);
      }
    }
    const sourceInductee = inducteeEmailFromSubmission(
      schema,
      s.signature_assignments ?? {},
    );

    const sourceLock = computeSectionLock({
      section,
      signatureAssignments: s.signature_assignments ?? {},
      signedFields: sourceSigned,
      currentUserEmail: userEmail,
      allSections: schema.sections,
      sectionIndex,
      userRoleIds,
      roleNameById,
      inducteeEmail: sourceInductee,
    });
    if (!canWriteSection(sourceLock)) {
      return NextResponse.json(
        {
          error:
            "You can't propagate a section you don't own on the source submission",
        },
        { status: 403 },
      );
    }

    // The actual values to copy: every non-signature, non-header
    // field in the section.
    const fieldIds = section.fields
      .filter(
        (f) =>
          f.type !== "section_header" &&
          f.type !== "divider" &&
          f.type !== "signature",
      )
      .map((f) => f.id);
    const valuesToCopy: Record<string, unknown> = {};
    for (const fid of fieldIds) {
      valuesToCopy[fid] = s.data?.[fid] ?? null;
    }

    // Load every sibling in the batch.
    const { data: siblingsRows, error: sibErr } = await sb
      .from("submissions")
      .select("id, status, data, signature_assignments")
      .eq("batch_id", s.batch_id)
      .eq("org_id", s.org_id)
      .neq("id", s.id);
    if (sibErr) throw sibErr;
    const siblings = (siblingsRows ?? []) as {
      id: string;
      status: string;
      data: Record<string, unknown>;
      signature_assignments: SignatureAssignments | null;
    }[];

    // For each sibling: check the section's lock state for this user.
    // Only propagate where they can write. Load each sibling's
    // signatures in one batched query.
    const sibIds = siblings.map((sib) => sib.id);
    const sibSigsByIdMap: Record<
      string,
      { field_id: string; signer_name: string; signed_at: string }[]
    > = {};
    if (sibIds.length > 0) {
      const { data: sibSigs } = await sb
        .from("submission_signatures")
        .select("submission_id, field_id, signer_name, signed_at")
        .in("submission_id", sibIds);
      for (const row of (sibSigs ?? []) as {
        submission_id: string;
        field_id: string;
        signer_name: string;
        signed_at: string;
      }[]) {
        const arr = sibSigsByIdMap[row.submission_id] ?? [];
        arr.push({
          field_id: row.field_id,
          signer_name: row.signer_name,
          signed_at: row.signed_at,
        });
        sibSigsByIdMap[row.submission_id] = arr;
      }
    }

    const now = new Date().toISOString();
    let propagatedCount = 0;
    const skipped: { id: string; reason: string }[] = [];

    for (const sib of siblings) {
      if (sib.status === "completed" || sib.status === "rejected") {
        skipped.push({ id: sib.id, reason: sib.status });
        continue;
      }
      const sibInductee = inducteeEmailFromSubmission(
        schema,
        sib.signature_assignments ?? {},
      );
      const sibLock = computeSectionLock({
        section,
        signatureAssignments: sib.signature_assignments ?? {},
        signedFields: sibSigsByIdMap[sib.id] ?? [],
        currentUserEmail: userEmail,
        allSections: schema.sections,
        sectionIndex,
        userRoleIds,
        roleNameById,
        inducteeEmail: sibInductee,
      });
      if (!canWriteSection(sibLock)) {
        skipped.push({ id: sib.id, reason: sibLock.state });
        continue;
      }
      const newData = { ...sib.data, ...valuesToCopy };
      const { error: updErr } = await sb
        .from("submissions")
        .update({
          data: newData,
          updated_at: now,
          last_edited_by: user.id,
          last_edited_at: now,
        })
        .eq("id", sib.id);
      if (updErr) {
        skipped.push({ id: sib.id, reason: `update failed: ${updErr.message}` });
        continue;
      }
      propagatedCount++;
    }

    await writeAudit({
      orgId: s.org_id,
      actorUserId: user.id,
      action: "submission.section_propagated",
      resourceType: "submission",
      resourceId: s.id,
      metadata: {
        batch_id: s.batch_id,
        section_id: body.section_id,
        section_title: section.title,
        field_ids: fieldIds,
        propagated: propagatedCount,
        skipped,
      },
    });

    return NextResponse.json({
      ok: true,
      propagated: propagatedCount,
      total_siblings: siblings.length,
      skipped: skipped.length,
    });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
