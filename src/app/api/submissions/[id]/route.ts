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
 * Save the submission's in-progress data. Cannot be called once the
 * submission is signed/completed (that would silently invalidate every
 * signature on the row).
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
      .select("id, org_id, status, started_by")
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
    };

    const m = await requireMembership(e.org_id);

    // Members can only edit their own in-progress submissions. Admins
    // can edit anyone's pre-signature.
    const isOwner = e.started_by === user.id;
    const isAdmin = m.role === "owner" || m.role === "admin";
    if (!isOwner && !isAdmin) {
      return NextResponse.json(
        { error: "Cannot edit another member's submission" },
        { status: 403 },
      );
    }
    if (e.status === "completed" || e.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot edit a ${e.status} submission` },
        { status: 409 },
      );
    }

    const { error: updErr } = await sb
      .from("submissions")
      .update({
        data: body.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    if (updErr) throw updErr;

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 },
    );
  }
}
