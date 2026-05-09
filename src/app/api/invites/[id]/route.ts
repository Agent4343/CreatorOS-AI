import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Cancel a pending invite. Admins/owners only.
 */
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const sb = supabaseService();

    const { data: row, error: getErr } = await sb
      .from("invites")
      .select("id, org_id, email, accepted_at")
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const r = row as { id: string; org_id: string; email: string; accepted_at: string | null };
    await requireRole(r.org_id, "admin");

    if (r.accepted_at) {
      return NextResponse.json(
        { error: "Invite already accepted; remove the member from settings instead" },
        { status: 409 },
      );
    }

    const { error: delErr } = await sb.from("invites").delete().eq("id", id);
    if (delErr) throw delErr;

    await writeAudit({
      orgId: r.org_id,
      actorUserId: user.id,
      action: "invite.cancelled",
      resourceType: "invite",
      resourceId: id,
      metadata: { email: r.email },
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
