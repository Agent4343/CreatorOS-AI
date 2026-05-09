import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Accept an invite. The token is the only credential — anyone with the
 * link can accept. Tokens are random 48-char hex; expire in 7 days
 * (per migration); single-use (we mark accepted_at on success).
 *
 * Security:
 *  - The signed-in user's email is checked against the invite's email.
 *    The invite is bound to the email, not "anyone with the link," so
 *    a leaked token can't be used to onboard a different user.
 *  - Single-use enforced by the unique-on-token index + the
 *    accepted_at non-null check.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { token?: string; full_name?: string };
    const token = (body.token ?? "").trim();
    if (!token) {
      return NextResponse.json({ error: "token required" }, { status: 400 });
    }

    const sb = supabaseService();
    const { data: invite, error: getErr } = await sb
      .from("invites")
      .select("id, org_id, email, role, accepted_at, expires_at")
      .eq("token", token)
      .maybeSingle();
    if (getErr) throw getErr;
    if (!invite) {
      return NextResponse.json({ error: "Invalid invite" }, { status: 404 });
    }
    const inv = invite as {
      id: string;
      org_id: string;
      email: string;
      role: "admin" | "member" | "viewer";
      accepted_at: string | null;
      expires_at: string;
    };

    if (inv.accepted_at) {
      return NextResponse.json({ error: "Invite already used" }, { status: 409 });
    }
    if (new Date(inv.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Invite expired" }, { status: 410 });
    }

    // Email check: the invite is bound to a specific email address.
    if ((user.email ?? "").toLowerCase() !== inv.email.toLowerCase()) {
      return NextResponse.json(
        { error: `This invite is for ${inv.email}; you're signed in as ${user.email}` },
        { status: 403 },
      );
    }

    // Don't double-create membership if one already exists.
    const { data: existing, error: memErr } = await sb
      .from("memberships")
      .select("id")
      .eq("org_id", inv.org_id)
      .eq("user_id", user.id)
      .maybeSingle();
    if (memErr) throw memErr;

    if (!existing) {
      const { error: insErr } = await sb.from("memberships").insert({
        org_id: inv.org_id,
        user_id: user.id,
        role: inv.role,
        full_name: body.full_name ?? null,
      });
      if (insErr) throw insErr;
    }

    const { error: updErr } = await sb
      .from("invites")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (updErr) throw updErr;

    await writeAudit({
      orgId: inv.org_id,
      actorUserId: user.id,
      action: "member.joined",
      resourceType: "membership",
      metadata: { invite_id: inv.id, email: inv.email, role: inv.role },
    });

    return NextResponse.json({ ok: true, org_id: inv.org_id });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
