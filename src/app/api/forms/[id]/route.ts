import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";
import { FormDefinitionSchema } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Fetch a single form by id. Member-level access; the org-membership
 * check is implicit because RLS would block a non-member, but we also
 * call requireMembership-equivalent via the audit-ready service path
 * by joining on org membership.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const sb = supabaseService();
    const { data, error } = await sb
      .from("forms")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Ensure the requester is a member of the form's org.
    const orgId = (data as { org_id: string }).org_id;
    const { data: m } = await sb
      .from("memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (!m) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json({ form: data });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Save an edited form schema. Admins/owners only.
 *
 * Bumps current_version and inserts a new immutable form_versions row.
 * The version chain means existing submissions stay bound to the
 * version they were started against — editing the form doesn't
 * silently mutate completed submissions.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as { schema?: unknown };
    const definition = FormDefinitionSchema.parse(body.schema);

    const sb = supabaseService();
    const { data: existing, error: getErr } = await sb
      .from("forms")
      .select("id, org_id, current_version, archived")
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const f = existing as {
      id: string;
      org_id: string;
      current_version: number;
      archived: boolean;
    };

    await requireRole(f.org_id, "admin");

    if (f.archived) {
      return NextResponse.json(
        { error: "Cannot edit an archived form" },
        { status: 409 },
      );
    }

    const newVersion = f.current_version + 1;

    // Insert the new immutable version first; if either op fails, the
    // form row stays at the prior version.
    const { error: verErr } = await sb.from("form_versions").insert({
      form_id: f.id,
      org_id: f.org_id,
      version_number: newVersion,
      schema: definition,
      created_by: user.id,
    });
    if (verErr) throw verErr;

    const { error: updErr } = await sb
      .from("forms")
      .update({
        name: definition.name,
        description: definition.description ?? null,
        schema: definition,
        current_version: newVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", f.id);
    if (updErr) throw updErr;

    await writeAudit({
      orgId: f.org_id,
      actorUserId: user.id,
      action: "form.updated",
      resourceType: "form",
      resourceId: f.id,
      metadata: {
        version: newVersion,
        sections: definition.sections.length,
        fields: definition.sections.reduce((n, s) => n + s.fields.length, 0),
      },
    });

    return NextResponse.json({ ok: true, version: newVersion });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Archive a form. Soft delete — sets archived=true. Existing
 * submissions remain accessible (and their form_version row is
 * immutable so the schema is preserved for audit).
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const sb = supabaseService();

    const { data: existing, error: getErr } = await sb
      .from("forms")
      .select("id, org_id, name")
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const f = existing as { id: string; org_id: string; name: string };

    await requireRole(f.org_id, "admin");

    const { error: updErr } = await sb
      .from("forms")
      .update({ archived: true, updated_at: new Date().toISOString() })
      .eq("id", f.id);
    if (updErr) throw updErr;

    await writeAudit({
      orgId: f.org_id,
      actorUserId: user.id,
      action: "form.archived",
      resourceType: "form",
      resourceId: f.id,
      metadata: { name: f.name },
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
