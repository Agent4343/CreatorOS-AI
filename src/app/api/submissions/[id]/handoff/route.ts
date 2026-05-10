import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/email";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Hand off an in-progress submission to a teammate by emailing
 * them a link to finish it.
 *
 * Permission model: open clipboard — every org member can already
 * pick up any in-progress form. This endpoint is just a polite
 * notification ("hey, can you finish this for me?") plus an email
 * link they can tap from their phone.
 *
 * Body: { to_user_id: string }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const fromUser = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as { to_user_id?: string };
    if (!body.to_user_id || typeof body.to_user_id !== "string") {
      return NextResponse.json(
        { error: "to_user_id required" },
        { status: 400 },
      );
    }
    if (body.to_user_id === fromUser.id) {
      return NextResponse.json(
        { error: "You can't hand off to yourself" },
        { status: 400 },
      );
    }

    const sb = supabaseService();
    const { data: sub } = await sb
      .from("submissions")
      .select("id, org_id, status, forms(name)")
      .eq("id", id)
      .maybeSingle();
    if (!sub) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    type SubRow = {
      id: string;
      org_id: string;
      status: string;
      forms: { name: string } | null;
    };
    const s = sub as unknown as SubRow;

    await requireMembership(s.org_id);
    if (s.status === "completed" || s.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot hand off a ${s.status} submission` },
        { status: 409 },
      );
    }

    // Verify recipient is in the same org. Hand-off across orgs is
    // a security hole — would let someone email forms from one org's
    // data to another org's user.
    const { data: recipientMembership } = await sb
      .from("memberships")
      .select("user_id, full_name")
      .eq("org_id", s.org_id)
      .eq("user_id", body.to_user_id)
      .maybeSingle();
    if (!recipientMembership) {
      return NextResponse.json(
        { error: "Recipient is not a member of this org" },
        { status: 403 },
      );
    }
    const recipient = recipientMembership as {
      user_id: string;
      full_name: string | null;
    };

    // Resolve recipient's email via auth.admin. We use the service role
    // client which has admin scope on auth.users.
    const adminClient = sb as unknown as {
      auth: { admin: { getUserById: (id: string) => Promise<{ data: { user: { email: string | null } | null } }> } };
    };
    const { data: userResult } = await adminClient.auth.admin.getUserById(
      body.to_user_id,
    );
    const recipientEmail = userResult?.user?.email;
    if (!recipientEmail) {
      return NextResponse.json(
        { error: "Recipient has no email on file" },
        { status: 400 },
      );
    }

    // Org name for the subject line.
    const { data: orgRow } = await sb
      .from("orgs")
      .select("name")
      .eq("id", s.org_id)
      .maybeSingle();
    const orgName = (orgRow as { name: string } | null)?.name ?? "FieldForm";

    const fromName =
      fromUser.user_metadata?.full_name ?? fromUser.email ?? "A teammate";
    const formName = s.forms?.name ?? "Form";
    const base =
      process.env.APP_URL ??
      process.env.NEXT_PUBLIC_APP_URL ??
      req.nextUrl.origin;
    const link = `${base.replace(/\/$/, "")}/submissions/${s.id}`;

    // Plain-language email — the goal is "tap the link, finish the
    // form." No compliance jargon, no legalese.
    const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;background:#f6f6f6;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;max-width:560px;width:100%;">
        <tr><td style="padding:24px 28px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#666;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(orgName)}</div>
          <h1 style="margin:6px 0 0 0;font-size:20px;color:#111;">Can you finish a form?</h1>
          <p style="margin:14px 0 0 0;font-size:14px;color:#333;line-height:1.5;">
            <strong>${escapeHtml(fromName)}</strong> started a
            <strong>${escapeHtml(formName)}</strong> and needs someone
            to finish it. Tap the button below to pick up where they
            left off.
          </p>
          <p style="margin:18px 0 0 0;">
            <a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;">
              Open the form →
            </a>
          </p>
          <p style="margin:18px 0 0 0;font-size:11px;color:#888;line-height:1.5;">
            You'll need to be signed into FieldForm with your
            <code>${escapeHtml(recipientEmail)}</code> account.
            Submission ID:
            <span style="font-family:ui-monospace,Menlo,monospace;">${escapeHtml(s.id)}</span>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

    const subject = `[${orgName}] ${fromName} needs help finishing ${formName}`;
    const result = await sendEmail({
      to: [recipientEmail],
      subject,
      html,
      replyTo: fromUser.email ?? undefined,
    });

    await writeAudit({
      orgId: s.org_id,
      actorUserId: fromUser.id,
      action: "submission.handoff_sent",
      resourceType: "submission",
      resourceId: s.id,
      metadata: {
        to_user_id: body.to_user_id,
        to_name: recipient.full_name,
        email_result:
          "ok" in result
            ? result.ok
              ? "sent"
              : `error: ${result.error}`
            : `skipped: ${result.reason}`,
      },
    });

    if ("ok" in result && !result.ok) {
      return NextResponse.json(
        { error: `Email failed: ${result.error}` },
        { status: 502 },
      );
    }
    if ("skipped" in result) {
      return NextResponse.json(
        {
          ok: true,
          warning:
            "Email service not configured — handoff logged but no email sent.",
        },
      );
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
