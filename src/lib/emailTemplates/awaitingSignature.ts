/**
 * "It's your turn to sign" email — sent to the next assignee after
 * the previous signer in the chain finishes their signature.
 *
 * Inline CSS only; tested against Gmail / Apple Mail / Outlook.
 */
export function renderAwaitingSignatureEmail(args: {
  orgName: string;
  formName: string;
  signerName?: string;
  signerEmail: string;
  role?: string;
  inductee?: { name: string };
  link: string;
  previousSignerName?: string;
}): { subject: string; html: string } {
  const {
    orgName,
    formName,
    signerName,
    role,
    inductee,
    link,
    previousSignerName,
  } = args;

  const greeting = signerName ? `Hi ${escapeHtml(signerName)},` : "Hi,";
  const inducteePart = inductee
    ? ` for <strong>${escapeHtml(inductee.name)}</strong>`
    : "";
  const rolePart = role ? ` as the <strong>${escapeHtml(role)}</strong>` : "";
  const previousLine = previousSignerName
    ? `<strong>${escapeHtml(previousSignerName)}</strong> just signed and it's now your turn.`
    : "It's now your turn to sign.";

  const subject = role
    ? `[${orgName}] ${formName} — awaiting your signature as ${role}`
    : `[${orgName}] ${formName} — awaiting your signature`;

  const html = `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f6f6f6;font-family:-apple-system,Segoe UI,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:24px 12px;background:#f6f6f6;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#fff;border:1px solid #e5e5e5;border-radius:8px;max-width:560px;width:100%;">
        <tr><td style="padding:24px 28px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#666;font-family:ui-monospace,Menlo,monospace;">${escapeHtml(orgName)}</div>
          <h1 style="margin:6px 0 0 0;font-size:20px;color:#111;">Your signature is needed</h1>
          <p style="margin:14px 0 0 0;font-size:14px;color:#333;line-height:1.5;">
            ${greeting}
          </p>
          <p style="margin:10px 0 0 0;font-size:14px;color:#333;line-height:1.5;">
            ${previousLine} You're being asked to sign
            <strong>${escapeHtml(formName)}</strong>${inducteePart}${rolePart}.
          </p>
          <p style="margin:18px 0 0 0;">
            <a href="${escapeHtml(link)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 22px;border-radius:6px;font-weight:bold;">
              Open the form &amp; sign →
            </a>
          </p>
          <p style="margin:18px 0 0 0;font-size:11px;color:#888;line-height:1.5;">
            Sign in to FieldForm with <code>${escapeHtml(args.signerEmail)}</code>.
            The system only accepts your signature on the field assigned to you,
            so you don't have to worry about signing in the wrong place.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  return { subject, html };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
