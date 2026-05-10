import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";
import type {
  FormDefinition,
  SignatureAssignments,
} from "@/lib/types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_INDUCTEES = 50;

/**
 * Bulk-start submissions for a workflow with multiple named signers.
 *
 * Body: {
 *   org_id, form_id,
 *   inductees:    [{name, email}],   // one submission per entry
 *   shared_data?: {field_id: value}, // pre-fills sections 1-2 etc.
 *   shared_assignments: {field_id: {email, name?, role?}},
 *      // assignments that apply to every submission in the batch (OIM,
 *      // Supervisor, Heli admin)
 *   inductee_signature_field_id?: string,
 *      // if set, that signature field is assigned to the inductee on
 *      // each per-inductee submission
 *   inductee_name_field_id?: string,
 *      // if set, that text field is pre-filled with the inductee's name
 * }
 *
 * Returns {batch_id, submissions: [...]} — caller can navigate to the
 * batch detail page to see progress.
 *
 * Permission: admin-level. Bulk start touches every signer in the org
 * — it shouldn't be left to general members.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      org_id?: string;
      form_id?: string;
      inductees?: Array<{ name?: string; email?: string }>;
      shared_data?: Record<string, unknown>;
      shared_assignments?: SignatureAssignments;
      inductee_signature_field_id?: string;
      inductee_name_field_id?: string;
    };

    if (!body.org_id || !body.form_id) {
      return NextResponse.json(
        { error: "org_id and form_id required" },
        { status: 400 },
      );
    }
    const m = await requireMembership(body.org_id);
    if (m.role !== "owner" && m.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can bulk-start a batch" },
        { status: 403 },
      );
    }

    // Validate inductees.
    if (!Array.isArray(body.inductees) || body.inductees.length === 0) {
      return NextResponse.json(
        { error: "At least one inductee required" },
        { status: 400 },
      );
    }
    if (body.inductees.length > MAX_INDUCTEES) {
      return NextResponse.json(
        { error: `Max ${MAX_INDUCTEES} inductees per batch` },
        { status: 400 },
      );
    }
    const inductees = body.inductees.map((i, idx) => {
      const name = (i.name ?? "").trim();
      const email = (i.email ?? "").trim().toLowerCase();
      if (!name) throw new Error(`Inductee #${idx + 1}: name required`);
      if (!email) throw new Error(`Inductee #${idx + 1}: email required`);
      if (!EMAIL_RE.test(email)) {
        throw new Error(`Inductee #${idx + 1}: invalid email "${email}"`);
      }
      return { name, email };
    });

    // Load + validate form schema; verify referenced field IDs exist.
    const sb = supabaseService();
    const { data: form, error: formErr } = await sb
      .from("forms")
      .select("id, org_id, current_version, archived")
      .eq("id", body.form_id)
      .eq("org_id", body.org_id)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    if ((form as { archived: boolean }).archived) {
      return NextResponse.json(
        { error: "Form is archived" },
        { status: 409 },
      );
    }

    const { data: version, error: verErr } = await sb
      .from("form_versions")
      .select("id, schema")
      .eq("form_id", body.form_id)
      .eq(
        "version_number",
        (form as { current_version: number }).current_version,
      )
      .maybeSingle();
    if (verErr || !version) {
      return NextResponse.json(
        { error: "Form version missing" },
        { status: 500 },
      );
    }
    const schema = (version as { schema: FormDefinition }).schema;

    // Collect every field on the form for ID validation.
    const allFields = schema.sections.flatMap((s) => s.fields);
    const fieldById = new Map(allFields.map((f) => [f.id, f]));
    const sigFieldIds = new Set(
      allFields.filter((f) => f.type === "signature").map((f) => f.id),
    );

    // Validate shared assignments — every key must be a real signature
    // field on the form.
    const sharedAssignments: SignatureAssignments = {};
    for (const [fieldId, assignment] of Object.entries(
      body.shared_assignments ?? {},
    )) {
      if (!sigFieldIds.has(fieldId)) {
        return NextResponse.json(
          { error: `Field ${fieldId} is not a signature field` },
          { status: 400 },
        );
      }
      const email = (assignment.email ?? "").trim().toLowerCase();
      if (!email || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { error: `Invalid email for assignment on ${fieldId}` },
          { status: 400 },
        );
      }
      sharedAssignments[fieldId] = {
        email,
        name: assignment.name?.trim() || undefined,
        role: assignment.role?.trim() || undefined,
      };
    }

    // Validate inductee signature field, if set.
    if (
      body.inductee_signature_field_id &&
      !sigFieldIds.has(body.inductee_signature_field_id)
    ) {
      return NextResponse.json(
        {
          error: `inductee_signature_field_id ${body.inductee_signature_field_id} is not a signature field`,
        },
        { status: 400 },
      );
    }

    // Validate inductee name field, if set (must be text-shaped).
    if (body.inductee_name_field_id) {
      const f = fieldById.get(body.inductee_name_field_id);
      if (!f || (f.type !== "text" && f.type !== "textarea")) {
        return NextResponse.json(
          {
            error: `inductee_name_field_id ${body.inductee_name_field_id} is not a text field`,
          },
          { status: 400 },
        );
      }
    }

    // Sanitize shared_data: drop keys that aren't on the schema.
    const sharedData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.shared_data ?? {})) {
      if (fieldById.has(k)) sharedData[k] = v;
    }

    // Build N submission rows.
    const batchId = randomUUID();
    const formVersionId = (version as { id: string }).id;
    const rows = inductees.map((inductee) => {
      const data = { ...sharedData };
      if (body.inductee_name_field_id) {
        data[body.inductee_name_field_id] = inductee.name;
      }
      const assignments: SignatureAssignments = { ...sharedAssignments };
      if (body.inductee_signature_field_id) {
        assignments[body.inductee_signature_field_id] = {
          email: inductee.email,
          name: inductee.name,
          role: "Inductee",
        };
      }
      return {
        org_id: body.org_id,
        form_id: body.form_id,
        form_version_id: formVersionId,
        status: "in_progress" as const,
        data,
        started_by: user.id,
        batch_id: batchId,
        signature_assignments: assignments,
      };
    });

    const { data: created, error: insErr } = await sb
      .from("submissions")
      .insert(rows)
      .select("id");
    if (insErr) throw insErr;
    const createdRows = (created ?? []) as { id: string }[];

    await writeAudit({
      orgId: body.org_id,
      actorUserId: user.id,
      action: "submission.batch_started",
      resourceType: "submission",
      resourceId: batchId,
      metadata: {
        form_id: body.form_id,
        batch_id: batchId,
        count: createdRows.length,
        inductees: inductees.map((i) => i.email),
        assignees: Object.fromEntries(
          Object.entries(sharedAssignments).map(([k, v]) => [k, v.email]),
        ),
      },
    });

    return NextResponse.json({
      batch_id: batchId,
      submissions: createdRows,
    });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
