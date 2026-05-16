import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";
import type { FormDefinition, SignatureAssignments } from "@/lib/types";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Reassign the inductee on a single batch submission.
 *
 * Why: heli admin typed the wrong email at batch start; the form
 * went out to the wrong address; the actual inductee can't open
 * their form. Today there's no fix — the bad row sits in
 * "Waiting on you" for someone who isn't watching, and an
 * untrained admin's only option is to cancel and re-create.
 *
 * Body: { name, email } — both required. The signature_assignments
 * entry for every signature in any section marked inductee_section
 * is rewritten to point at the new person. The inductee_name field
 * (if the template has one — same field the batch route prefilled
 * with the inductee's name at creation time) is updated to match.
 *
 * Refuses if any inductee section signature has already been signed
 * — once the *current* inductee has signed, reassigning would orphan
 * a signature from the row.
 *
 * Admin-only. No effect on completed/rejected submissions.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json().catch(() => ({}))) as {
      name?: string;
      email?: string;
    };
    const name = body.name?.trim();
    const email = body.email?.trim().toLowerCase();
    if (!name || !email) {
      return NextResponse.json(
        { error: "name and email required" },
        { status: 400 },
      );
    }
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json(
        { error: "email format invalid" },
        { status: 400 },
      );
    }

    const sb = supabaseService();

    const { data: row, error: getErr } = await sb
      .from("submissions")
      .select(
        "id, org_id, status, data, signature_assignments, batch_id, form_versions(schema)",
      )
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const s = row as {
      id: string;
      org_id: string;
      status: string;
      data: Record<string, unknown> | null;
      signature_assignments: SignatureAssignments | null;
      batch_id: string | null;
      form_versions: { schema: FormDefinition } | null;
    };

    const m = await requireMembership(s.org_id);
    if (m.role !== "owner" && m.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can reassign an inductee" },
        { status: 403 },
      );
    }

    if (s.status === "completed" || s.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot reassign a ${s.status} submission` },
        { status: 409 },
      );
    }

    const schema = s.form_versions?.schema;
    if (!schema) {
      return NextResponse.json({ error: "Schema missing" }, { status: 500 });
    }

    // Find every signature field inside an inductee section. The
    // template might have one (typical) or several; we rewrite them
    // all to the new person.
    const inducteeSigFieldIds: string[] = [];
    let inducteeNameFieldId: string | null = null;
    for (const sec of schema.sections) {
      if (!sec.inductee_section) continue;
      for (const f of sec.fields) {
        if (f.type === "signature") inducteeSigFieldIds.push(f.id);
        // First text/textarea field in the inductee section is the
        // canonical "name field" — same convention the batch route
        // uses when it prefills inductee names.
        if (
          !inducteeNameFieldId &&
          (f.type === "text" || f.type === "textarea")
        ) {
          inducteeNameFieldId = f.id;
        }
      }
    }

    if (inducteeSigFieldIds.length === 0) {
      return NextResponse.json(
        {
          error:
            "This template has no inductee section — nothing to reassign. Add one in the form editor.",
        },
        { status: 400 },
      );
    }

    // Refuse if any inductee-section signature is already signed —
    // reassigning would orphan a signature.
    const { data: signedRows } = await sb
      .from("submission_signatures")
      .select("field_id, signer_email")
      .eq("submission_id", s.id)
      .in("field_id", inducteeSigFieldIds);
    const signed = (signedRows ?? []) as {
      field_id: string;
      signer_email: string;
    }[];
    if (signed.length > 0) {
      return NextResponse.json(
        {
          error: `The current inductee (${signed[0].signer_email}) has already signed. Cancel and re-create this row instead of reassigning.`,
        },
        { status: 409 },
      );
    }

    const newAssignments: SignatureAssignments = {
      ...(s.signature_assignments ?? {}),
    };
    const previous: Record<string, string | null> = {};
    for (const fid of inducteeSigFieldIds) {
      const prev = newAssignments[fid];
      previous[fid] =
        prev && (prev as { kind?: string }).kind !== "role"
          ? ((prev as { email?: string }).email ?? null)
          : null;
      newAssignments[fid] = { email, name, role: "Inductee" };
    }

    const newData: Record<string, unknown> = { ...(s.data ?? {}) };
    if (inducteeNameFieldId) newData[inducteeNameFieldId] = name;

    const { error: updErr } = await sb
      .from("submissions")
      .update({
        signature_assignments: newAssignments,
        data: newData,
        updated_at: new Date().toISOString(),
      })
      .eq("id", s.id);
    if (updErr) throw updErr;

    await writeAudit({
      orgId: s.org_id,
      actorUserId: user.id,
      action: "submission.inductee_reassigned",
      resourceType: "submission",
      resourceId: s.id,
      metadata: {
        batch_id: s.batch_id,
        previous,
        new_email: email,
        new_name: name,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
