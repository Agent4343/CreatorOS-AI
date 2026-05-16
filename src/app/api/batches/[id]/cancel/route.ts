import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Cancel every still-open submission in a batch.
 *
 * Use case: heli admin starts a batch, immediately realises the
 * supervisor assignments are wrong, or the manifest changed. Today
 * the only recovery is to open all N submissions and "reject" them
 * one by one. This endpoint does it in one call.
 *
 * Scope:
 *   - Only `in_progress` and `awaiting_signature` rows are touched.
 *     Completed submissions are immutable; cancelled rows are
 *     already terminal.
 *   - Admin-only — same gate as batch creation.
 *
 * Body: { reason?: string } — recorded on the audit log so the team
 * can see "Brad cancelled because Sam was off-shift."
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id: batchId } = await params;
    const body = (await req
      .json()
      .catch(() => ({}))) as { reason?: string };

    const sb = supabaseService();

    // Find every submission in the batch so we can a) verify the
    // batch belongs to an org this user administers, and b) report
    // back which ones we actually cancelled vs. skipped.
    const { data: rows, error: getErr } = await sb
      .from("submissions")
      .select("id, org_id, status, batch_label")
      .eq("batch_id", batchId);
    if (getErr) throw getErr;
    const subs = (rows ?? []) as {
      id: string;
      org_id: string;
      status: string;
      batch_label: string | null;
    }[];

    if (subs.length === 0) {
      return NextResponse.json({ error: "Batch not found" }, { status: 404 });
    }

    const orgId = subs[0].org_id;
    if (!subs.every((s) => s.org_id === orgId)) {
      // Defensive: a batch should never span orgs. If it does, refuse.
      return NextResponse.json(
        { error: "Batch spans multiple organisations — refusing" },
        { status: 409 },
      );
    }

    const m = await requireMembership(orgId);
    if (m.role !== "owner" && m.role !== "admin") {
      return NextResponse.json(
        { error: "Only admins can cancel a batch" },
        { status: 403 },
      );
    }

    const cancellable = subs.filter(
      (s) => s.status === "in_progress" || s.status === "awaiting_signature",
    );
    if (cancellable.length === 0) {
      return NextResponse.json({
        ok: true,
        cancelled: 0,
        skipped: subs.length,
        reason: "no open submissions",
      });
    }

    const { error: updErr } = await sb
      .from("submissions")
      .update({
        status: "rejected",
        completed_at: new Date().toISOString(),
      })
      .in(
        "id",
        cancellable.map((s) => s.id),
      );
    if (updErr) throw updErr;

    await writeAudit({
      orgId,
      actorUserId: user.id,
      action: "submission.batch_cancelled",
      resourceType: "submission",
      resourceId: batchId,
      metadata: {
        batch_id: batchId,
        batch_label: subs[0].batch_label,
        cancelled: cancellable.length,
        skipped: subs.length - cancellable.length,
        reason: body.reason ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      cancelled: cancellable.length,
      skipped: subs.length - cancellable.length,
    });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
