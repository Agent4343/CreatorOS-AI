import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { cascadeFieldChangesToSiblings } from "@/lib/batchCascade";
import { captureError } from "@/lib/sentry";
import {
  canWriteSection,
  computeSectionLock,
  inducteeEmailFromSubmission,
  type SectionLockState,
} from "@/lib/sectionLocks";
import { supabaseService } from "@/lib/supabase/server";
import type { FormDefinition, SignatureAssignments } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    const sb = supabaseService();
    const { data, error } = await sb
      .from("submissions")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    await requireMembership((data as { org_id: string }).org_id);
    return NextResponse.json({ submission: data });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Save the submission's in-progress data.
 *
 * Permission model: any member of the submission's org can save —
 * "open clipboard" semantics so a teammate can pick up a half-filled
 * form when the original worker can't finish (shift change, called
 * away, equipment failure). Identity is preserved via:
 *
 *   - last_edited_by + last_edited_at on every save
 *   - audit_logs entry the first time a non-starter edits
 *   - signatures still bind the final-state attestation to specific
 *     people via the data_hash
 *
 * Cannot be called once the submission is signed/completed (that
 * would silently invalidate every signature on the row).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as {
      data?: Record<string, unknown>;
      /** Optimistic-lock token. The client sends the `updated_at` it
       * last observed; the server refuses the PATCH if the row has
       * moved since. Omit to bypass (force-save) — useful for the
       * "use my version" branch after a conflict prompt. */
      expected_updated_at?: string;
    };
    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json({ error: "data required" }, { status: 400 });
    }

    const sb = supabaseService();
    const { data: existing, error: getErr } = await sb
      .from("submissions")
      .select(
        "id, org_id, status, data, started_by, last_edited_by, last_edited_at, updated_at, signature_assignments, batch_id, last_cascade_at, form_versions(schema)",
      )
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const e = existing as {
      id: string;
      org_id: string;
      status: string;
      data: Record<string, unknown>;
      started_by: string;
      last_edited_by: string | null;
      last_edited_at: string | null;
      updated_at: string;
      signature_assignments: SignatureAssignments | null;
      batch_id: string | null;
      last_cascade_at: string | null;
      form_versions: { schema: FormDefinition } | null;
    };

    await requireMembership(e.org_id);

    if (e.status === "completed" || e.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot edit a ${e.status} submission` },
        { status: 409 },
      );
    }

    // Optimistic-lock check. Two admins editing the same submission
    // (different tabs, different devices, batch sibling reconciler)
    // can race and silently overwrite each other. We refuse PATCH
    // when the client's last-seen updated_at doesn't match what the
    // server has now, and return the current state so the runner
    // can show a "this row was edited elsewhere" conflict prompt.
    //
    // Bypassable by passing the server's CURRENT updated_at as the
    // override — the "use my version" branch of the conflict prompt
    // does exactly that. Omitting the field entirely also bypasses
    // (for non-runner callers like the smoke-import script).
    if (
      body.expected_updated_at &&
      body.expected_updated_at !== e.updated_at
    ) {
      return NextResponse.json(
        {
          error:
            "This submission was edited elsewhere since you loaded it.",
          conflict: true,
          current_updated_at: e.updated_at,
          current_data: e.data,
          last_edited_by: e.last_edited_by,
          last_edited_at: e.last_edited_at,
        },
        { status: 409 },
      );
    }

    // Per-section lock enforcement. Compute which sections the
    // requesting user is allowed to write to (open or
    // reserved-for-me), and reject any field-value change that
    // touches a section the user can't edit.
    //
    // Why server-side: the runner disables locked inputs in the UI,
    // but a hand-crafted PATCH could still try. RLS doesn't know
    // about sections, so the gate has to live here.
    const schema = e.form_versions?.schema;
    if (schema) {
      const { data: sigsRows } = await sb
        .from("submission_signatures")
        .select("field_id, signer_name, signed_at")
        .eq("submission_id", e.id);
      const signedFields = (sigsRows ?? []) as {
        field_id: string;
        signer_name: string;
        signed_at: string;
      }[];
      const assignments = e.signature_assignments ?? {};
      const userEmail = (user.email ?? "").toLowerCase();
      const currentData = e.data ?? {};

      // Pull every role the section schema references plus the user's
      // memberships in those roles, in one round-trip per concern. We
      // need both: role IDs to resolve role names for error messages,
      // and the user's email-presence in member arrays to gate edits.
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
          .eq("org_id", e.org_id)
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
      const inducteeEmail = inducteeEmailFromSubmission(schema, assignments);

      for (let idx = 0; idx < schema.sections.length; idx++) {
        const section = schema.sections[idx];
        const lock = computeSectionLock({
          section,
          signatureAssignments: assignments,
          signedFields,
          currentUserEmail: userEmail,
          allSections: schema.sections,
          sectionIndex: idx,
          userRoleIds,
          roleNameById,
          inducteeEmail,
        });
        if (canWriteSection(lock)) continue;
        // Find any field in this section whose value the request is
        // changing — if so, reject with the most specific reason.
        for (const f of section.fields) {
          if (
            f.type === "section_header" ||
            f.type === "divider" ||
            f.type === "signature"
          ) {
            continue;
          }
          const incoming = (body.data as Record<string, unknown>)[f.id];
          const stored = currentData[f.id];
          if (!shallowEqual(incoming, stored)) {
            const reason = lockReason(lock);
            return NextResponse.json(
              {
                error: `Section "${section.title}" is locked. ${reason}`,
                section_id: section.id,
                section_title: section.title,
                lock_state: lock.state,
              },
              { status: 403 },
            );
          }
        }
      }
    }

    const now = new Date().toISOString();
    const { error: updErr } = await sb
      .from("submissions")
      .update({
        data: body.data,
        updated_at: now,
        last_edited_by: user.id,
        last_edited_at: now,
      })
      .eq("id", id);
    if (updErr) throw updErr;

    // First time someone other than the starter touches the form,
    // log a handoff event. Subsequent saves by the same person don't
    // get re-logged (would flood the audit log; auto-save runs every
    // 5 sec).
    const isFirstHandoff =
      e.started_by !== user.id && e.last_edited_by !== user.id;
    if (isFirstHandoff) {
      await writeAudit({
        orgId: e.org_id,
        actorUserId: user.id,
        action: "submission.picked_up",
        resourceType: "submission",
        resourceId: e.id,
        metadata: {
          original_starter: e.started_by,
        },
      });
    }

    // Auto-cascade to batch siblings. When the source row is part of
    // a batch, propagate field changes to siblings whose section is
    // shared with this one (heli admin / OIM / supervisor-within-
    // crew). Inductee sections never cascade. The cascade is best-
    // effort and the source save has already committed — a failure
    // here doesn't undo the source. We surface the summary so the
    // runner can show "synced to N siblings."
    let cascade: Awaited<
      ReturnType<typeof cascadeFieldChangesToSiblings>
    > | null = null;
    if (schema && e.batch_id) {
      try {
        cascade = await cascadeFieldChangesToSiblings({
          sb,
          sourceId: e.id,
          sourceOrgId: e.org_id,
          batchId: e.batch_id,
          schema,
          sourceAssignments: e.signature_assignments ?? {},
          newData: body.data,
          actingUserId: user.id,
          lastCascadeAt: e.last_cascade_at,
        });
        if (cascade.siblings_updated > 0) {
          await writeAudit({
            orgId: e.org_id,
            actorUserId: user.id,
            action: "submission.batch_field_cascade",
            resourceType: "submission",
            resourceId: e.id,
            metadata: {
              batch_id: e.batch_id,
              siblings_updated: cascade.siblings_updated,
              fields_written: cascade.fields_written,
              skipped: cascade.skipped,
            },
          });
        }
      } catch (err) {
        // Cascade is best-effort — source save already committed.
        // Surface to Sentry so a silent cascade failure (which the
        // admin can't see) doesn't go unnoticed in monitoring.
        captureError(err, {
          where: "patch.batch_cascade",
          submission_id: e.id,
          batch_id: e.batch_id,
        });
      }
    }

    return NextResponse.json({ ok: true, cascade, updated_at: now });
  } catch (err) {
    if (err instanceof AuthError) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Cheap equality check for submission field values. JSON-encodable
 * scalars or arrays — strings, numbers, booleans, nulls, arrays of
 * those. Good enough for the field types FieldForm stores.
 */
function lockReason(lock: SectionLockState): string {
  switch (lock.state) {
    case "signed_locked":
      return `Already signed by ${lock.signerName} — can't edit a signed section.`;
    case "waiting_prior":
      return `Waiting on "${lock.priorSectionTitle}" to be signed first.`;
    case "role_required":
      return `Only members of the "${lock.requiredRoleName}" role can edit this.`;
    case "inductee_required":
      return lock.inducteeEmail
        ? `Only ${lock.inducteeEmail} (the inductee) can edit this.`
        : `Only the inductee assigned to this submission can edit this.`;
    case "reserved_for_other":
      return `Reserved for ${lock.assigneeLabel}.`;
    default:
      return "Section is locked.";
  }
}

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!shallowEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
