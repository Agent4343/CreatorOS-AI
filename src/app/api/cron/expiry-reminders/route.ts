import { NextRequest, NextResponse } from "next/server";
import { enqueueEmail } from "@/lib/outbound";
import { supabaseService } from "@/lib/supabase/server";
import type {
  FormDefinition,
  SignatureAssignments,
  Submission,
} from "@/lib/types";

export const runtime = "nodejs";

/**
 * Daily sweep that looks for document_expiry fields on completed
 * submissions and emails a reminder when the expiry is 30 / 7 / 0
 * days away.
 *
 * Idempotency: outbound_messages.meta carries the submission_id +
 * field_id + window (30 / 7 / 0). Before enqueueing we check the
 * table for an already-sent row with the same triple; if it exists
 * the reminder was already dispatched today's pass-equivalent.
 *
 * Why this is a sweep (not a job-per-submission scheduled at sign
 * time): operators' rosters drift — people leave, change emails,
 * change roles. Resolving the recipient at sweep time (against the
 * org's current notification_emails) gets us a current address
 * instead of a 6-month-old snapshot.
 */

const WINDOWS = [30, 7, 0] as const;
type Window = (typeof WINDOWS)[number];

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 },
    );
  }
  if (req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = supabaseService();
  // Pull every completed submission. For low-volume operators this
  // is tractable; for large tenants we'd want a per-org schedule or
  // a partial index on completed_at. Marked as a known scaling
  // pinch-point.
  const { data: subs, error } = await sb
    .from("submissions")
    .select(
      "id, org_id, status, data, form_versions(schema), forms(name), orgs(name, notification_emails)",
    )
    .eq("status", "completed")
    .limit(1000);
  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 },
    );
  }

  type Joined = Submission & {
    form_versions: { schema: FormDefinition } | null;
    forms: { name: string } | null;
    orgs: { name: string; notification_emails: string[] | null } | null;
    signature_assignments?: SignatureAssignments | null;
  };

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const todayMs = today.getTime();

  let enqueued = 0;
  let skipped = 0;
  for (const s of (subs ?? []) as unknown as Joined[]) {
    const schema = s.form_versions?.schema;
    if (!schema) {
      skipped++;
      continue;
    }
    const expiryFields = schema.sections
      .flatMap((sec) => sec.fields)
      .filter((f) => f.type === "document_expiry");
    if (expiryFields.length === 0) continue;
    const orgRecipients = (s.orgs?.notification_emails ?? []).filter((e) =>
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e),
    );
    if (orgRecipients.length === 0) {
      skipped++;
      continue;
    }

    for (const f of expiryFields) {
      const val = (s.data ?? {})[f.id] as
        | { date?: string; photos?: string[] }
        | undefined;
      if (!val?.date) continue;
      const exp = new Date(val.date);
      if (isNaN(exp.getTime())) continue;
      exp.setUTCHours(0, 0, 0, 0);
      const daysUntil = Math.round(
        (exp.getTime() - todayMs) / (1000 * 60 * 60 * 24),
      );
      // Only fire on exact window-day matches so we don't spam.
      // Misses (cron skipped) are recoverable by the next sweep
      // through the same window the following year, which is fine
      // for documents that expire annually.
      const window = WINDOWS.find((w) => w === daysUntil) as
        | Window
        | undefined;
      if (window === undefined) continue;

      // Idempotency: have we already enqueued this (submission, field,
      // window) combination?
      const { count: alreadyCount } = await sb
        .from("outbound_messages")
        .select("id", { count: "exact", head: true })
        .eq("org_id", s.org_id)
        .contains("meta", {
          kind: "doc_expiry_reminder",
          submission_id: s.id,
          field_id: f.id,
          window,
        });
      if ((alreadyCount ?? 0) > 0) continue;

      const formName = s.forms?.name ?? "Form";
      const fieldLabel = f.label || "Document";
      const subject =
        window === 0
          ? `${fieldLabel} expires today`
          : `${fieldLabel} expires in ${window} days`;
      const html = `<p>${fieldLabel} on the form "${formName}" expires on <strong>${val.date}</strong>.</p>
<p>Submission: <code>${s.id}</code></p>
<p>Org: ${s.orgs?.name ?? ""}</p>`;

      for (const to of orgRecipients) {
        await enqueueEmail({
          orgId: s.org_id,
          to,
          subject,
          html,
          meta: {
            kind: "doc_expiry_reminder",
            submission_id: s.id,
            field_id: f.id,
            window,
          },
        }).catch(() => undefined);
        enqueued++;
      }
    }
  }

  return NextResponse.json({ ok: true, enqueued, skipped });
}

export async function GET(req: NextRequest) {
  return POST(req);
}
