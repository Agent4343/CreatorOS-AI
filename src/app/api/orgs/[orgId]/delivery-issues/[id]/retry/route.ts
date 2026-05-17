import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Force-retry a single outbound_messages row. Resets status to
 * 'pending' and send_after to now() so the cron picks it up on the
 * next sweep (within ~60s). Doesn't reset the attempts counter —
 * that exists so we can tell "tried 8 times and still failing" from
 * "fresh send" in monitoring.
 *
 * Admin-only. Refuses for terminal-success rows (no point retrying
 * something that already worked).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string; id: string }> },
) {
  try {
    const user = await requireUser();
    const { orgId, id } = await params;
    const m = await requireMembership(orgId);
    if (m.role !== "owner" && m.role !== "admin") {
      return NextResponse.json({ error: "admin-only" }, { status: 403 });
    }
    const sb = supabaseService();
    const { data: row, error: getErr } = await sb
      .from("outbound_messages")
      .select("id, org_id, status, max_attempts")
      .eq("id", id)
      .maybeSingle();
    if (getErr) throw getErr;
    const r = row as {
      id: string;
      org_id: string;
      status: string;
      max_attempts: number;
    } | null;
    if (!r) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (r.org_id !== orgId) {
      // Belt and braces — the URL says one org, the row belongs to
      // another. Don't leak cross-org existence.
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    if (r.status === "sent") {
      return NextResponse.json(
        { error: "Already sent — nothing to retry" },
        { status: 409 },
      );
    }
    // Reset for retry. Bump max_attempts by 1 so a terminal-failed
    // row gets another swing without resetting the attempt count
    // (preserves the diagnostic of "this address has failed N times").
    const { error: updErr } = await sb
      .from("outbound_messages")
      .update({
        status: "pending",
        send_after: new Date().toISOString(),
        max_attempts: r.max_attempts + 1,
        last_error: null,
      })
      .eq("id", r.id);
    if (updErr) throw updErr;

    await writeAudit({
      orgId,
      actorUserId: user.id,
      action: "outbound.retried",
      resourceType: "outbound_message",
      resourceId: r.id,
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
