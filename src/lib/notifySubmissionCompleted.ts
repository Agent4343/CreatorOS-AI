import { renderSubmissionCompletedEmail } from "./emailTemplates/submissionCompleted";
import { enqueueEmail } from "./outbound";
import { buildPrintLink } from "./submissionLinks";
import { supabaseService } from "./supabase/server";
import type {
  FormDefinition,
  SignatureRow,
  Submission,
} from "./types";

/**
 * Send the "submission completed" notification email to whichever
 * addresses the org has configured. Idempotent — the
 * submission_email_log table has a UNIQUE (submission_id, kind)
 * constraint, so a retry / double-click can't double-send.
 *
 * Intentionally swallows errors. Email is a side effect of completing
 * a submission; if Resend is down or the org has zero recipients
 * configured, signing must still succeed.
 */
export async function notifySubmissionCompleted(
  submissionId: string,
): Promise<{ ok: boolean; reason?: string; sentTo?: string[] }> {
  try {
    const sb = supabaseService();

    // Idempotency check — never send the same submission's completion
    // email twice. The unique constraint on the log table is the real
    // guarantee, but checking first avoids hitting Resend at all.
    const { data: existing } = await sb
      .from("submission_email_log")
      .select("id")
      .eq("submission_id", submissionId)
      .eq("kind", "completion")
      .maybeSingle();
    if (existing) {
      return { ok: true, reason: "already sent" };
    }

    const { data: sub, error: subErr } = await sb
      .from("submissions")
      .select("*, form_versions(schema), forms(name), orgs(name, notification_emails, notify_on_completion)")
      .eq("id", submissionId)
      .maybeSingle();
    if (subErr || !sub) {
      return { ok: false, reason: "submission not found" };
    }

    type Joined = Submission & {
      form_versions: { schema: FormDefinition } | null;
      forms: { name: string } | null;
      orgs: {
        name: string;
        notification_emails: string[] | null;
        notify_on_completion: boolean;
      } | null;
    };
    const s = sub as unknown as Joined;
    if (!s.orgs?.notify_on_completion) {
      return { ok: true, reason: "notifications disabled for org" };
    }
    const recipients = (s.orgs.notification_emails ?? [])
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
    if (recipients.length === 0) {
      return { ok: true, reason: "no recipients configured" };
    }
    const schema = s.form_versions?.schema;
    if (!schema) {
      return { ok: false, reason: "schema missing" };
    }

    const { data: sigs } = await sb
      .from("submission_signatures")
      .select("*")
      .eq("submission_id", s.id)
      .order("signed_at", { ascending: true });
    const signatures = (sigs ?? []) as SignatureRow[];

    const printLink = buildPrintLink(s.id);

    const { subject, html } = renderSubmissionCompletedEmail({
      orgName: s.orgs.name,
      formName: s.forms?.name ?? "Form",
      submission: s,
      schema,
      signatures,
      printLink,
    });

    // Enqueue one row per recipient. outbound_messages is the
    // durable record of every send attempt; submission_email_log
    // retains its idempotency guard (the row inserted below) so the
    // existing "don't double-send" check at the top of this function
    // keeps working.
    const enqueueResults = await Promise.all(
      recipients.map((to) =>
        enqueueEmail({
          orgId: s.org_id,
          to,
          subject,
          html,
          meta: {
            kind: "completion",
            submission_id: s.id,
          },
        }).catch((err) => ({
          id: "",
          sent: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      ),
    );

    await sb.from("submission_email_log").insert({
      submission_id: s.id,
      org_id: s.org_id,
      kind: "completion",
      recipients,
      provider_id: null,
      error: enqueueResults.every((r) => r.sent)
        ? null
        : "queued for retry",
    });

    if (enqueueResults.some((r) => r.sent)) {
      return { ok: true, sentTo: recipients };
    }
    return {
      ok: false,
      reason: "queued for retry — provider unavailable on first attempt",
    };
  } catch (e) {
    console.error("[notifySubmissionCompleted] failed", e);
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "unknown",
    };
  }
}
