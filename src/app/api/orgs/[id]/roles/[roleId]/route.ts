import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";
import { normaliseMembers } from "../route";

export const runtime = "nodejs";

/**
 * PATCH a role. Body: { name?, description?, members? }
 *
 * Admin-only. Note: edits do NOT retroactively change who can sign
 * batches that have already been started — those snapshot the roster
 * at start time. Edits affect future batches only.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, roleId } = await params;
    await requireRole(id, "admin");

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      members?: unknown;
    };
    const update: Record<string, unknown> = {};
    if (body.name !== undefined) {
      const trimmed = body.name.trim();
      if (!trimmed) {
        return NextResponse.json({ error: "name cannot be empty" }, { status: 400 });
      }
      update.name = trimmed;
    }
    if (body.description !== undefined) {
      update.description = body.description?.trim() || null;
    }
    if (body.members !== undefined) {
      update.members = normaliseMembers(body.members);
    }
    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "no fields to update" }, { status: 400 });
    }

    const sb = supabaseService();
    const { data, error } = await sb
      .from("org_roles")
      .update(update)
      .eq("id", roleId)
      .eq("org_id", id)
      .select("id, name, description, members, created_at")
      .maybeSingle();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "A role with this name already exists" },
          { status: 409 },
        );
      }
      throw error;
    }
    if (!data) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }

    await writeAudit({
      orgId: id,
      actorUserId: user.id,
      action: "org_role.updated",
      resourceType: "org_role",
      resourceId: roleId,
      metadata: {
        fields: Object.keys(update),
        member_count: Array.isArray(update.members)
          ? (update.members as unknown[]).length
          : undefined,
      },
    });

    return NextResponse.json({ role: data });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * DELETE a role. Admin-only.
 *
 * Doesn't touch any in-flight submissions — those carry a snapshot
 * of the role's members in their signature_assignments JSON. So
 * deleting "Heli admin" today won't break inductions started
 * yesterday; they continue to validate against the snapshot.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; roleId: string }> },
) {
  try {
    const user = await requireUser();
    const { id, roleId } = await params;
    await requireRole(id, "admin");

    const sb = supabaseService();
    const { data: existing } = await sb
      .from("org_roles")
      .select("id, name")
      .eq("id", roleId)
      .eq("org_id", id)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Role not found" }, { status: 404 });
    }
    const { error } = await sb
      .from("org_roles")
      .delete()
      .eq("id", roleId)
      .eq("org_id", id);
    if (error) throw error;

    await writeAudit({
      orgId: id,
      actorUserId: user.id,
      action: "org_role.deleted",
      resourceType: "org_role",
      resourceId: roleId,
      metadata: { name: (existing as { name: string }).name },
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
