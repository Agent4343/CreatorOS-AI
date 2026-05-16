import { renderAwaitingSignatureEmail } from "./emailTemplates/awaitingSignature";
import { enqueueEmail } from "./outbound";
import { supabaseService } from "./supabase/server";

function appBase(): string {
  return (
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000"
  ).replace(/\/$/, "");
}
import type {
  FormDefinition,
  SignatureAssignments,
  Submission,
} from "./types";

/**
 * Email the next assigned signer in the chain after `justSignedFieldId`
 * was completed. "Next" = the first signature field in schema order
 * that has an assignment but no signature yet.
 *
 * No-op (with a logged reason) if there's no next assignee, if Resend
 * isn't configured, or if the previously-emailed signer is the same
 * person (no need to re-spam them between two consecutive sigs they
 * happen to own).
 *
 * Caller passes the just-completed signature so we can describe the
 * handoff in the email body ("Brad just signed and it's now your turn").
 *
 * Never throws — email is a side effect of signing; signing must
 * succeed even if email is down.
 */
export async function notifyNextSigner(args: {
  submissionId: string;
  justSignedFieldId: string;
  justSignedByName?: string;
}): Promise<{ ok: boolean; reason?: string; sentTo?: string }> {
  try {
    const sb = supabaseService();

    const { data: sub } = await sb
      .from("submissions")
      .select(
        "id, org_id, status, signature_assignments, form_versions(schema), forms(name), orgs(name)",
      )
      .eq("id", args.submissionId)
      .maybeSingle();
    if (!sub) return { ok: false, reason: "submission not found" };

    type Joined = Submission & {
      form_versions: { schema: FormDefinition } | null;
      forms: { name: string } | null;
      orgs: { name: string } | null;
    };
    const s = sub as unknown as Joined;
    if (s.status === "completed" || s.status === "rejected") {
      return { ok: true, reason: "already terminal" };
    }
    const schema = s.form_versions?.schema;
    if (!schema) return { ok: false, reason: "schema missing" };
    const assignments: SignatureAssignments = s.signature_assignments ?? {};

    // Already-signed signature field IDs.
    const { data: sigsRows } = await sb
      .from("submission_signatures")
      .select("field_id")
      .eq("submission_id", s.id);
    const signed = new Set(
      ((sigsRows ?? []) as { field_id: string }[]).map((r) => r.field_id),
    );

    // Find the next signature field in schema order that's both
    // assigned and not yet signed.
    let next: { fieldId: string; assignment: SignatureAssignments[string] } | null = null;
    for (const sec of schema.sections) {
      for (const f of sec.fields) {
        if (f.type !== "signature") continue;
        if (signed.has(f.id)) continue;
        const a = assignments[f.id];
        if (!a) continue;
        next = { fieldId: f.id, assignment: a };
        break;
      }
      if (next) break;
    }

    if (!next) return { ok: true, reason: "no remaining assignees" };

    // Build the recipient list. For specific-person assignments it's
    // a single email. For role assignments, every roster member gets
    // notified — anyone can pick it up.
    const a = next.assignment;
    let recipients: string[];
    let roleLabel: string | undefined;
    let signerName: string | undefined;
    if ((a as { kind?: string }).kind === "role") {
      const r = a as Extract<typeof a, { kind: "role" }>;
      recipients = r.member_emails.map((e) => e.toLowerCase());
      roleLabel = `Any ${r.role_label}`;
      signerName = undefined;
    } else {
      const u = a as Extract<typeof a, { email: string }>;
      recipients = [u.email.toLowerCase()];
      roleLabel = u.role;
      signerName = u.name;
    }

    // Don't email anyone who just signed (the email-from-this-signer
    // chain). For role assignments, exclude the signer's own email
    // from the recipient set rather than skipping the whole notify —
    // their teammates still need to know.
    const justSignerEmail = (
      assignments[args.justSignedFieldId] as { email?: string } | undefined
    )?.email?.toLowerCase();
    if (justSignerEmail) {
      recipients = recipients.filter((e) => e !== justSignerEmail);
    }
    if (recipients.length === 0) {
      return { ok: true, reason: "next signer = previous signer; skip" };
    }

    // Awaiting-signature link goes to the runner, not the print view.
    // We deliberately don't use a signed token here — signing requires
    // authenticated identity (the whole point of a signature). The
    // recipient logs in with their assigned email, and the sign route
    // verifies the assignment match.
    const link = `${appBase()}/submissions/${s.id}`;

    const orgName = s.orgs?.name ?? "FieldForm";
    const formName = s.forms?.name ?? "Form";

    const { subject, html } = renderAwaitingSignatureEmail({
      orgName,
      formName,
      signerName,
      signerEmail: recipients[0],
      role: roleLabel,
      link,
      previousSignerName: args.justSignedByName,
    });

    // Enqueue one row per recipient. The queue handles the immediate
    // send attempt + durable retry; we don't need to also write
    // submission_email_log here because outbound_messages is now the
    // canonical record of every outbound attempt.
    const enqueueResults = await Promise.all(
      recipients.map((to) =>
        enqueueEmail({
          orgId: s.org_id,
          to,
          subject,
          html,
          meta: {
            kind: "next_signer",
            submission_id: s.id,
            field_id: next!.fieldId,
          },
        }).catch((err) => ({
          id: "",
          sent: false,
          error: err instanceof Error ? err.message : String(err),
        })),
      ),
    );

    const anySent = enqueueResults.some((r) => r.sent);
    if (anySent) return { ok: true, sentTo: recipients.join(",") };
    return {
      ok: false,
      reason: "queued for retry — provider unavailable on first attempt",
    };
  } catch (e) {
    console.error("[notifyNextSigner] failed", e);
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}
