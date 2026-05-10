import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { canWriteSection, computeSectionLock } from "@/lib/sectionLocks";
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
    const body = (await req.json()) as { data?: Record<string, unknown> };
    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json({ error: "data required" }, { status: 400 });
    }

    const sb = supabaseService();
    const { data: existing, error: getErr } = await sb
      .from("submissions")
      .select(
        "id, org_id, status, data, started_by, last_edited_by, signature_assignments, form_versions(schema)",
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
      signature_assignments: SignatureAssignments | null;
      form_versions: { schema: FormDefinition } | null;
    };

    await requireMembership(e.org_id);

    if (e.status === "completed" || e.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot edit a ${e.status} submission` },
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

      for (const section of schema.sections) {
        const lock = computeSectionLock({
          section,
          signatureAssignments: assignments,
          signedFields,
          currentUserEmail: userEmail,
        });
        if (canWriteSection(lock)) continue;
        // Find any field in this section whose value the request is
        // changing — if so, reject.
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
            const owner =
              lock.state === "reserved_for_other"
                ? `${lock.assigneeName ?? lock.assigneeEmail}${lock.assigneeRole ? ` (${lock.assigneeRole})` : ""}`
                : "the previous signer";
            return NextResponse.json(
              {
                error: `Section "${section.title}" is locked. Waiting for ${owner} — or already signed.`,
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

    return NextResponse.json({ ok: true });
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
