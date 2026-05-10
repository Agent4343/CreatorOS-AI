import { Resend } from "resend";

/**
 * Thin wrapper around Resend.
 *
 * - If RESEND_API_KEY is unset, send() is a no-op that returns a
 *   skipped result. Lets dev / smoke tests run without real email
 *   delivery, and means production failures are loud (you'll see
 *   the env var missing in /api/health).
 * - All callers should treat email failures as non-fatal — never
 *   block a submission from completing because Resend was down.
 */

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { skipped: true; reason: string };

let _client: Resend | null = null;
function client(): Resend | null {
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  if (!_client) _client = new Resend(key);
  return _client;
}

export function emailFromAddress(): string {
  // EMAIL_FROM should be a verified sender on the Resend domain,
  // e.g. "FieldForm <noreply@fieldform.app>".
  return (
    process.env.EMAIL_FROM ??
    "FieldForm <onboarding@resend.dev>" // Resend's shared sandbox sender — works without domain verification
  );
}

export async function sendEmail(args: {
  to: string[];
  subject: string;
  html: string;
  replyTo?: string;
}): Promise<SendResult> {
  const c = client();
  if (!c) return { skipped: true, reason: "RESEND_API_KEY not set" };
  if (args.to.length === 0) {
    return { skipped: true, reason: "no recipients" };
  }

  try {
    const res = await c.emails.send({
      from: emailFromAddress(),
      to: args.to,
      subject: args.subject,
      html: args.html,
      replyTo: args.replyTo,
    });
    if (res.error) {
      return { ok: false, error: res.error.message ?? "Resend error" };
    }
    return { ok: true, id: res.data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Send failed" };
  }
}
