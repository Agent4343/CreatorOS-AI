import type {
  FormDefinition,
  SignatureRow,
  Submission,
} from "@/lib/types";

/**
 * HTML email body for a completed submission.
 *
 * Goal: a recipient (safety officer, supervisor, compliance) opens
 * the email and can tell at a glance:
 *   - which form was completed
 *   - who signed it
 *   - when
 *   - and click through for the full record + audit trail
 *
 * Inline CSS only — most email clients strip <style> blocks. Keep
 * the layout tolerant of Outlook / Gmail / iOS Mail.
 */
export function renderSubmissionCompletedEmail(args: {
  orgName: string;
  formName: string;
  submission: Submission;
  schema: FormDefinition;
  signatures: SignatureRow[];
  printLink: string;
}): { subject: string; html: string } {
  const { orgName, formName, submission, schema, signatures, printLink } = args;

  const completedAt = submission.completed_at
    ? new Date(submission.completed_at).toLocaleString()
    : new Date().toLocaleString();

  const summaryRows = buildSummaryRows(schema, submission.data ?? {});
  const sigRows = signatures
    .map(
      (s) => `
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font:13px/1.4 -apple-system,Segoe UI,sans-serif;">
            <strong>${escapeHtml(s.signer_name)}</strong><br/>
            <span style="color:#666;font-size:11px;">${escapeHtml(s.signer_email)}</span>
          </td>
          <td style="padding:6px 8px;border-bottom:1px solid #eee;font:11px/1.4 ui-monospace,Menlo,monospace;color:#333;">
            ${escapeHtml(new Date(s.signed_at).toLocaleString())}
          </td>
        </tr>`,
    )
    .join("");

  const subject = `[${orgName}] ${formName} completed`;

  const html = `<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#f6f6f6;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border:1px solid #e5e5e5;border-radius:8px;max-width:600px;width:100%;">
          <tr>
            <td style="padding:24px 28px 8px 28px;border-bottom:2px solid #111;">
              <div style="font:11px/1.2 ui-monospace,Menlo,monospace;text-transform:uppercase;letter-spacing:0.08em;color:#666;">
                ${escapeHtml(orgName)}
              </div>
              <h1 style="margin:6px 0 0 0;font:bold 22px/1.3 -apple-system,Segoe UI,sans-serif;color:#111;">
                ${escapeHtml(formName)}
              </h1>
              <div style="margin-top:6px;font:13px/1.4 -apple-system,Segoe UI,sans-serif;color:#1a7f37;">
                ✓ Completed ${escapeHtml(completedAt)}
              </div>
            </td>
          </tr>

          <tr>
            <td style="padding:18px 28px;">
              <a href="${escapeHtml(printLink)}"
                 style="display:inline-block;padding:12px 20px;background:#111;color:#fff;text-decoration:none;border-radius:6px;font:bold 14px/1 -apple-system,Segoe UI,sans-serif;">
                View full record &amp; download PDF →
              </a>
              <p style="margin:10px 0 0 0;font:12px/1.5 -apple-system,Segoe UI,sans-serif;color:#666;">
                The link includes a signed token — no login required.
                Open in any browser, then use Print → Save as PDF for a
                downloadable copy.
              </p>
            </td>
          </tr>

          ${
            summaryRows.length
              ? `
          <tr>
            <td style="padding:8px 28px 18px 28px;">
              <h2 style="margin:0 0 8px 0;font:bold 13px/1.2 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:0.05em;color:#444;">
                Summary
              </h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;border-collapse:separate;">
                ${summaryRows}
              </table>
            </td>
          </tr>`
              : ""
          }

          ${
            sigRows
              ? `
          <tr>
            <td style="padding:8px 28px 18px 28px;">
              <h2 style="margin:0 0 8px 0;font:bold 13px/1.2 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;letter-spacing:0.05em;color:#444;">
                Signatures
              </h2>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;border-radius:6px;">
                <thead>
                  <tr style="background:#fafafa;">
                    <th align="left" style="padding:6px 8px;font:bold 11px/1.2 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;color:#666;border-bottom:1px solid #eee;">Signer</th>
                    <th align="left" style="padding:6px 8px;font:bold 11px/1.2 -apple-system,Segoe UI,sans-serif;text-transform:uppercase;color:#666;border-bottom:1px solid #eee;">Signed at</th>
                  </tr>
                </thead>
                <tbody>${sigRows}</tbody>
              </table>
              <p style="margin:8px 0 0 0;font:11px/1.5 -apple-system,Segoe UI,sans-serif;color:#888;">
                Each signature is bound to a SHA-256 hash of the form data —
                tamper-evident under 21 CFR Part 11 / eIDAS / ESIGN.
              </p>
            </td>
          </tr>`
              : ""
          }

          <tr>
            <td style="padding:14px 28px 22px 28px;border-top:1px solid #eee;">
              <p style="margin:0;font:11px/1.5 -apple-system,Segoe UI,sans-serif;color:#888;">
                Submission ID:
                <span style="font-family:ui-monospace,Menlo,monospace;">${escapeHtml(submission.id)}</span><br/>
                Sent by FieldForm on behalf of ${escapeHtml(orgName)}.
                Reply-to addresses are not monitored — manage notification
                recipients in your FieldForm settings.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  return { subject, html };
}

/**
 * Render a compact summary table — at most ~20 rows, skipping fields
 * that are empty / structural / binary (signatures, photos). Long text
 * is truncated. The full record is always one click away via printLink,
 * so the email body stays scannable.
 */
function buildSummaryRows(
  schema: FormDefinition,
  data: Record<string, unknown>,
): string {
  const rows: string[] = [];
  let count = 0;
  const MAX = 20;

  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      if (count >= MAX) break;
      if (
        f.type === "section_header" ||
        f.type === "divider" ||
        f.type === "signature" ||
        f.type === "photo"
      ) {
        continue;
      }
      const v = data[f.id];
      const display = formatValue(f.type, v);
      if (display === null) continue;
      rows.push(`
        <tr>
          <td style="padding:6px 8px;border-bottom:1px solid #f2f2f2;font:12px/1.4 -apple-system,Segoe UI,sans-serif;color:#666;width:45%;vertical-align:top;">
            ${escapeHtml(f.label)}
          </td>
          <td style="padding:6px 8px;border-bottom:1px solid #f2f2f2;font:13px/1.4 -apple-system,Segoe UI,sans-serif;color:#111;">
            ${display}
          </td>
        </tr>`);
      count++;
    }
  }
  return rows.join("");
}

function formatValue(type: string, v: unknown): string | null {
  if (v == null || v === "") return null;
  if (type === "checkbox") {
    return v ? "<strong style='color:#1a7f37;'>✓ Yes</strong>" : "—";
  }
  if (Array.isArray(v)) {
    if (v.length === 0) return null;
    return escapeHtml(v.join(", "));
  }
  if (typeof v === "object") {
    if (
      "lat" in (v as Record<string, unknown>) &&
      "lng" in (v as Record<string, unknown>)
    ) {
      const o = v as { lat: number; lng: number };
      return `<span style="font-family:ui-monospace,Menlo,monospace;font-size:12px;">${o.lat.toFixed(5)}, ${o.lng.toFixed(5)}</span>`;
    }
    return null;
  }
  let s = String(v);
  if (s.length > 200) s = s.slice(0, 200) + "…";
  return escapeHtml(s);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
