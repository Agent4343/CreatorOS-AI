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
 *   inductees: [{
 *      name, email,
 *      // optional per-inductee assignments — wins over shared
 *      // assignments for the same field_id. Use this when Brad-the-
 *      // foreman supervises 3 inductees and Sam-the-foreman supervises
 *      // the other 5.
 *      assignments?: {field_id: {email, name?, role?}},
 *   }],
 *   shared_data?: {field_id: value}, // pre-fills sections 1-2 etc.
 *   shared_assignments: {field_id: {email, name?, role?}},
 *      // applies to every submission in the batch (Heli admin, OIM,
 *      // and possibly Supervisor when it's the same person for all)
 *   inductee_signature_field_id?: string,
 *      // if set, that signature field is assigned to the inductee on
 *      // each per-inductee submission
 *   inductee_name_field_id?: string,
 *      // if set, that text field is pre-filled with THIS inductee's
 *      // name on each per-inductee submission
 *   batch_roster_field_id?: string,
 *      // if set, that text/textarea field is pre-filled on every
 *      // submission with a comma-separated list of ALL inductees in
 *      // the batch. Lets the Heli admin's Section 1 show "Today's
 *      // group: Ashley, Marcus, Priya, Tom" so the signature
 *      // attests to the whole group, not just one row.
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
      inductees?: Array<{
        name?: string;
        email?: string;
        assignments?: SignatureAssignments;
      }>;
      shared_data?: Record<string, unknown>;
      shared_assignments?: SignatureAssignments;
      inductee_signature_field_id?: string;
      inductee_name_field_id?: string;
      batch_roster_field_id?: string;
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
      // Hold the raw assignments object — we can't validate field IDs
      // until the form schema is loaded a few lines down. Email format
      // and shape are checked here; field-ID validation is below.
      return { name, email, rawAssignments: i.assignments ?? {} };
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
    // field on the form. Two assignment shapes accepted:
    //  - {email, name?, role?}                    → specific person
    //  - {kind:"role", role_id, role_label,
    //     member_emails, member_names?}           → roster snapshot
    //
    // For role assignments we re-fetch the roster and re-snapshot
    // server-side rather than trusting the client. Two reasons:
    // (a) we want a verified moment-in-time copy of who was on the
    // roster, with the actual auth-server-known emails; (b) clients
    // can't be trusted to serialise the right thing.
    const sharedAssignments: SignatureAssignments = {};
    const referencedRoleIds = new Set<string>();
    for (const [fieldId, assignment] of Object.entries(
      body.shared_assignments ?? {},
    )) {
      if (!sigFieldIds.has(fieldId)) {
        return NextResponse.json(
          { error: `Field ${fieldId} is not a signature field` },
          { status: 400 },
        );
      }
      if ((assignment as { kind?: string }).kind === "role") {
        const a = assignment as { role_id?: string };
        if (!a.role_id) {
          return NextResponse.json(
            { error: `Missing role_id on role assignment for ${fieldId}` },
            { status: 400 },
          );
        }
        referencedRoleIds.add(a.role_id);
        // Placeholder; we'll fill it in after fetching the roster.
        sharedAssignments[fieldId] = {
          kind: "role",
          role_id: a.role_id,
          role_label: "",
          member_emails: [],
        };
        continue;
      }
      // Specific-person assignment.
      const email = (
        (assignment as { email?: string }).email ?? ""
      )
        .trim()
        .toLowerCase();
      if (!email || !EMAIL_RE.test(email)) {
        return NextResponse.json(
          { error: `Invalid email for assignment on ${fieldId}` },
          { status: 400 },
        );
      }
      sharedAssignments[fieldId] = {
        email,
        name: (assignment as { name?: string }).name?.trim() || undefined,
        role: (assignment as { role?: string }).role?.trim() || undefined,
      };
    }

    // Fetch and snapshot every referenced role roster.
    if (referencedRoleIds.size > 0) {
      const { data: roleRows, error: roleErr } = await sb
        .from("org_roles")
        .select("id, name, members")
        .eq("org_id", body.org_id)
        .in("id", Array.from(referencedRoleIds));
      if (roleErr) throw roleErr;
      const roleById = new Map(
        ((roleRows ?? []) as Array<{
          id: string;
          name: string;
          members: { email: string; name?: string }[];
        }>).map((r) => [r.id, r]),
      );
      for (const [fid, a] of Object.entries(sharedAssignments)) {
        if ((a as { kind?: string }).kind !== "role") continue;
        const roleId = (a as { role_id: string }).role_id;
        const role = roleById.get(roleId);
        if (!role) {
          return NextResponse.json(
            { error: `Role ${roleId} not found in this org` },
            { status: 400 },
          );
        }
        if (role.members.length === 0) {
          return NextResponse.json(
            {
              error: `Role "${role.name}" has no members. Nobody could sign.`,
            },
            { status: 400 },
          );
        }
        const emails = role.members.map((m) => m.email.toLowerCase());
        const names: Record<string, string> = {};
        for (const m of role.members) {
          if (m.name) names[m.email.toLowerCase()] = m.name;
        }
        sharedAssignments[fid] = {
          kind: "role",
          role_id: role.id,
          role_label: role.name,
          member_emails: emails,
          member_names: Object.keys(names).length > 0 ? names : undefined,
        };
      }
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
    // Validate roster field, if set. textarea is preferred so each
    // name lands on its own line, but text is allowed too — in which
    // case the names are comma-joined.
    if (body.batch_roster_field_id) {
      const f = fieldById.get(body.batch_roster_field_id);
      if (!f || (f.type !== "text" && f.type !== "textarea")) {
        return NextResponse.json(
          {
            error: `batch_roster_field_id ${body.batch_roster_field_id} is not a text field`,
          },
          { status: 400 },
        );
      }
    }

    // Now that the schema is loaded, validate per-inductee assignments
    // properly: every key must be a real signature field on the form
    // (NOT just any field). Catches stale/typo'd field IDs that would
    // otherwise get silently stored under a key no signature field
    // uses — meaning the supervisor never gets emailed and the field
    // stays "(unassigned)" on the runner. This was the silent-failure
    // mode that produced the "supervisor never gets assigned" report.
    const inducteesWithAssignments = inductees.map((i, idx) => {
      const perAssignments: SignatureAssignments = {};
      for (const [fid, a] of Object.entries(i.rawAssignments)) {
        if (!sigFieldIds.has(fid)) {
          throw new Error(
            `Inductee #${idx + 1}: field ${fid} isn't a signature field on this form`,
          );
        }
        if ((a as { kind?: string }).kind === "role") {
          throw new Error(
            `Inductee #${idx + 1}: role assignments aren't supported per inductee`,
          );
        }
        const u = a as { email?: string; name?: string; role?: string };
        const aEmail = (u.email ?? "").trim().toLowerCase();
        if (!aEmail) continue;
        if (!EMAIL_RE.test(aEmail)) {
          throw new Error(
            `Inductee #${idx + 1}: invalid email for field ${fid}`,
          );
        }
        perAssignments[fid] = {
          email: aEmail,
          name: u.name?.trim() || undefined,
          role: u.role?.trim() || undefined,
        };
      }
      return { name: i.name, email: i.email, perAssignments };
    });

    // Sanitize shared_data: drop keys that aren't on the schema.
    const sharedData: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(body.shared_data ?? {})) {
      if (fieldById.has(k)) sharedData[k] = v;
    }

    // Pre-compute the roster string. Same value on every submission
    // in the batch — that's the whole point: the Heli admin sees the
    // entire induction group in their Section 1, not just one name.
    if (body.batch_roster_field_id) {
      const rosterField = fieldById.get(body.batch_roster_field_id)!;
      const roster =
        rosterField.type === "textarea"
          ? inductees.map((i) => i.name).join("\n")
          : inductees.map((i) => i.name).join(", ");
      sharedData[body.batch_roster_field_id] = roster;
    }

    // Build N submission rows.
    const batchId = randomUUID();
    const formVersionId = (version as { id: string }).id;
    const rows = inducteesWithAssignments.map((inductee) => {
      const data = { ...sharedData };
      if (body.inductee_name_field_id) {
        data[body.inductee_name_field_id] = inductee.name;
      }
      // Merge order matters: shared baseline, then per-inductee
      // overrides (different supervisor for different inductees),
      // then the inductee's own signature field assignment.
      const assignments: SignatureAssignments = {
        ...sharedAssignments,
        ...inductee.perAssignments,
      };
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
          Object.entries(sharedAssignments).map(([k, v]) => [
            k,
            (v as { kind?: string }).kind === "role"
              ? `role:${(v as { role_label: string }).role_label}`
              : (v as { email: string }).email,
          ]),
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
