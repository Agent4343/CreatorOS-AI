import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

const VALID_ROLES = new Set(["admin", "member", "viewer"]);

/**
 * Create an invite. Admins/owners only. We generate a random token
 * and let the inviter share the resulting link however they want
 * (email, Slack, in-person). Email-based invitations through a
 * transactional ESP (Resend/Postmark) is a Phase 2 add-on; right
 * now the admin copies the link.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      org_id?: string;
      email?: string;
      role?: string;
    };
    if (!body.org_id) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }
    await requireRole(body.org_id, "admin");

    const email = (body.email ?? "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Valid email required" }, { status: 400 });
    }
    const role = String(body.role ?? "member");
    if (!VALID_ROLES.has(role)) {
      return NextResponse.json({ error: `role must be one of ${[...VALID_ROLES].join(", ")}` }, { status: 400 });
    }

    const token = randomBytes(24).toString("hex");

    const sb = supabaseService();
    const { data, error } = await sb
      .from("invites")
      .insert({
        org_id: body.org_id,
        email,
        role,
        token,
        invited_by: user.id,
      })
      .select()
      .single();
    if (error) throw error;

    await writeAudit({
      orgId: body.org_id,
      actorUserId: user.id,
      action: "member.invited",
      resourceType: "invite",
      resourceId: (data as { id: string }).id,
      metadata: { email, role },
    });

    return NextResponse.json({ invite: data, token });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * List pending invites for an org. Admins/owners only.
 */
export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const orgId = req.nextUrl.searchParams.get("org_id");
    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }
    await requireRole(orgId, "admin");

    const sb = supabaseService();
    const { data, error } = await sb
      .from("invites")
      .select("id, email, role, token, accepted_at, expires_at, created_at")
      .eq("org_id", orgId)
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ invites: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
