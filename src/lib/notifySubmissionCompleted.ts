import { sendEmail } from "./email";
import { renderSubmissionCompletedEmail } from "./emailTemplates/submissionCompleted";
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

    const result = await sendEmail({ to: recipients, subject, html });

    // Always log — success or failure — so admins can see why an
    // email didn't arrive.
    await sb.from("submission_email_log").insert({
      submission_id: s.id,
      org_id: s.org_id,
      kind: "completion",
      recipients,
      provider_id:
        "ok" in result && result.ok ? result.id : null,
      error:
        "ok" in result && !result.ok
          ? result.error
          : "skipped" in result
            ? `skipped: ${result.reason}`
            : null,
    });

    if ("ok" in result && result.ok) {
      return { ok: true, sentTo: recipients };
    }
    if ("skipped" in result) {
      return { ok: false, reason: result.reason };
    }
    return { ok: false, reason: result.error };
  } catch (e) {
    console.error("[notifySubmissionCompleted] failed", e);
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "unknown",
    };
  }
}
