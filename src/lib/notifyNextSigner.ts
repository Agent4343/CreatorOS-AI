import { sendEmail } from "./email";
import { renderAwaitingSignatureEmail } from "./emailTemplates/awaitingSignature";
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

    // Don't email if the next assignee is the same person who just signed.
    const justAssignment = assignments[args.justSignedFieldId];
    if (
      justAssignment &&
      justAssignment.email.toLowerCase() === next.assignment.email.toLowerCase()
    ) {
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
      signerName: next.assignment.name,
      signerEmail: next.assignment.email,
      role: next.assignment.role,
      link,
      previousSignerName: args.justSignedByName,
    });

    const result = await sendEmail({
      to: [next.assignment.email],
      subject,
      html,
    });

    // Log into the email log table even though kind != 'completion'.
    await sb.from("submission_email_log").insert({
      submission_id: s.id,
      org_id: s.org_id,
      kind: `awaiting_signature:${next.fieldId}`,
      recipients: [next.assignment.email],
      provider_id: "ok" in result && result.ok ? result.id : null,
      error:
        "ok" in result && !result.ok
          ? result.error
          : "skipped" in result
            ? `skipped: ${result.reason}`
            : null,
    });

    if ("ok" in result && result.ok) {
      return { ok: true, sentTo: next.assignment.email };
    }
    if ("skipped" in result) return { ok: false, reason: result.reason };
    return { ok: false, reason: result.error };
  } catch (e) {
    console.error("[notifyNextSigner] failed", e);
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}
