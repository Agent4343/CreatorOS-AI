import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

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
      .select("id, org_id, status, started_by, last_edited_by")
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
      started_by: string;
      last_edited_by: string | null;
    };

    await requireMembership(e.org_id);

    if (e.status === "completed" || e.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot edit a ${e.status} submission` },
        { status: 409 },
      );
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
