import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Update an org's notification settings.
 *
 * Body: { notification_emails: string[], notify_on_completion: boolean }
 *
 * Admin-only — controlling who gets compliance emails is a privileged
 * action; you don't want a bored field worker bcc'ing the CEO on
 * every checkbox they tick.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireRole(id, "admin");

    const body = (await req.json()) as {
      notification_emails?: unknown;
      notify_on_completion?: unknown;
    };

    const update: Record<string, unknown> = {};

    if (body.notification_emails !== undefined) {
      if (!Array.isArray(body.notification_emails)) {
        return NextResponse.json(
          { error: "notification_emails must be an array" },
          { status: 400 },
        );
      }
      const cleaned: string[] = [];
      for (const e of body.notification_emails) {
        if (typeof e !== "string") continue;
        const trimmed = e.trim().toLowerCase();
        if (trimmed === "") continue;
        if (!EMAIL_RE.test(trimmed)) {
          return NextResponse.json(
            { error: `Invalid email: ${trimmed}` },
            { status: 400 },
          );
        }
        if (cleaned.length >= 25) {
          return NextResponse.json(
            { error: "Max 25 recipients" },
            { status: 400 },
          );
        }
        if (!cleaned.includes(trimmed)) cleaned.push(trimmed);
      }
      update.notification_emails = cleaned;
    }

    if (body.notify_on_completion !== undefined) {
      if (typeof body.notify_on_completion !== "boolean") {
        return NextResponse.json(
          { error: "notify_on_completion must be a boolean" },
          { status: 400 },
        );
      }
      update.notify_on_completion = body.notify_on_completion;
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
    }

    const sb = supabaseService();
    const { error } = await sb.from("orgs").update(update).eq("id", id);
    if (error) throw error;

    await writeAudit({
      orgId: id,
      actorUserId: user.id,
      action: "org.notifications_updated",
      resourceType: "org",
      resourceId: id,
      metadata: update,
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
