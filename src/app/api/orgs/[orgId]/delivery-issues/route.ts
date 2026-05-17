import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * List outbound messages that haven't landed cleanly — terminal
 * failures and rows that are currently retrying. The settings
 * "Delivery issues" widget calls this.
 *
 * Scope: org-admin only. Returns at most 100 rows ordered by recency
 * so the panel renders without paging in the common case.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ orgId: string }> },
) {
  try {
    await requireUser();
    const { orgId } = await params;
    const m = await requireMembership(orgId);
    if (m.role !== "owner" && m.role !== "admin") {
      return NextResponse.json(
        { error: "admin-only" },
        { status: 403 },
      );
    }
    const sb = supabaseService();
    const { data, error } = await sb
      .from("outbound_messages")
      .select(
        "id, channel, recipient, subject, status, attempts, max_attempts, last_error, send_after, created_at, meta",
      )
      .eq("org_id", orgId)
      // Terminal failures + active retries. Successful + first-pass
      // pending rows aren't issues — they're working as intended.
      .or(
        "status.eq.failed,and(status.eq.pending,attempts.gt.0)",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ rows: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
