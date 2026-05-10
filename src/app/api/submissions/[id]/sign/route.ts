import { NextRequest, NextResponse } from "next/server";
import { AuthError, requestFingerprint, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { notifyNextSigner } from "@/lib/notifyNextSigner";
import { notifySubmissionCompleted } from "@/lib/notifySubmissionCompleted";
import { computeSignatureHash } from "@/lib/signatures";
import { supabaseService } from "@/lib/supabase/server";
import type { FormDefinition, SignatureAssignments } from "@/lib/types";

export const runtime = "nodejs";

/**
 * Apply a signature to one signature field on a submission.
 *
 * Security:
 * - Verify the user is a member of the submission's org.
 * - Snapshot the user's name + email AT TIME of signing (don't read
 *   them later — they could change).
 * - Capture timestamp, IP, user agent, optional geolocation.
 * - Compute SHA-256 hash of the submission's current data + signer +
 *   timestamp. This hash is the tamper-evidence anchor — if the data
 *   is later modified, recomputed hash won't match.
 * - If this signature completes every required signature field on the
 *   form, transition the submission to status='completed'.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const body = (await req.json()) as {
      field_id?: string;
      signature_image?: string;
      geolocation?: { lat: number; lng: number; accuracy?: number };
      /** If true and this submission is in a batch, also sign the
       * same field on every sibling submission where the same user is
       * assigned. Saves Heli admin / OIM from signing 8 times in a row.
       * Each sibling gets its own signature row with its own
       * data_hash bound to its own submission data. */
      batch_apply?: boolean;
    };
    if (!body.field_id || typeof body.signature_image !== "string") {
      return NextResponse.json(
        { error: "field_id and signature_image required" },
        { status: 400 },
      );
    }
    if (!body.signature_image.startsWith("data:image/")) {
      return NextResponse.json(
        { error: "signature_image must be a data URL" },
        { status: 400 },
      );
    }

    const sb = supabaseService();

    const { data: submission, error: subErr } = await sb
      .from("submissions")
      .select(
        "id, org_id, status, data, form_id, form_version_id, signature_assignments, batch_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (subErr) throw subErr;
    if (!submission) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    const sRow = submission as {
      id: string;
      org_id: string;
      status: string;
      data: Record<string, unknown>;
      form_id: string;
      form_version_id: string;
      signature_assignments: SignatureAssignments | null;
      batch_id: string | null;
    };

    await requireMembership(sRow.org_id);

    if (sRow.status === "completed" || sRow.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot sign a ${sRow.status} submission` },
        { status: 409 },
      );
    }

    // If this signature field is assigned to a specific person OR to
    // a role roster, refuse signers outside that scope. Open-clipboard
    // semantics still apply when no assignment is set (legacy).
    const assignments = sRow.signature_assignments ?? {};
    const assignedTo = assignments[body.field_id];
    if (assignedTo) {
      const userEmail = (user.email ?? "").toLowerCase();
      if ((assignedTo as { kind?: string }).kind === "role") {
        const role = assignedTo as Extract<
          typeof assignedTo,
          { kind: "role" }
        >;
        const allowed = role.member_emails.map((e) => e.toLowerCase());
        if (!allowed.includes(userEmail)) {
          return NextResponse.json(
            {
              error: `This signature is reserved for the "${role.role_label}" role. Sign in as a member to complete it.`,
            },
            { status: 403 },
          );
        }
      } else {
        const assignedEmail = (
          assignedTo as Extract<typeof assignedTo, { email: string }>
        ).email.toLowerCase();
        if (userEmail !== assignedEmail) {
          return NextResponse.json(
            {
              error: `This signature is assigned to ${assignedEmail}. Sign in as that user to complete it.`,
            },
            { status: 403 },
          );
        }
      }
    }

    // Pull the form schema to validate the field_id is real and
    // genuinely a signature field, plus to count remaining required
    // signatures after this one.
    const { data: version, error: verErr } = await sb
      .from("form_versions")
      .select("schema")
      .eq("id", sRow.form_version_id)
      .maybeSingle();
    if (verErr) throw verErr;
    const schema = (version as { schema: FormDefinition } | null)?.schema;
    if (!schema) {
      return NextResponse.json(
        { error: "Form schema missing" },
        { status: 500 },
      );
    }

    const allSigFields = schema.sections
      .flatMap((s) => s.fields)
      .filter((f) => f.type === "signature");
    const target = allSigFields.find((f) => f.id === body.field_id);
    if (!target) {
      return NextResponse.json(
        { error: "field_id is not a signature field on this form" },
        { status: 400 },
      );
    }

    // Template-level required-role gate. If the form template tags
    // this signature as restricted to a specific role, the signer
    // must be a current member of that role — independent of who the
    // assignment names. Catches the "Brad changed companies, his
    // assignment is stale, but the form was submitted to him" case.
    // Also lets a form template guarantee "this section can only be
    // signed by an OIM" in the schema itself, so role membership
    // doesn't have to be re-litigated per batch.
    if (target.required_role_id) {
      const { data: roleRow } = await sb
        .from("org_roles")
        .select("name, members")
        .eq("id", target.required_role_id)
        .eq("org_id", sRow.org_id)
        .maybeSingle();
      if (!roleRow) {
        return NextResponse.json(
          {
            error:
              "This signature requires a role that no longer exists on this org. Re-add the role in Settings → Role rosters.",
          },
          { status: 409 },
        );
      }
      const role = roleRow as {
        name: string;
        members: { email: string }[];
      };
      const memberEmails = (role.members ?? []).map((m) =>
        m.email.toLowerCase(),
      );
      if (!memberEmails.includes((user.email ?? "").toLowerCase())) {
        return NextResponse.json(
          {
            error: `This signature is reserved for the "${role.name}" role. Only role members can sign — ask an admin to add you in Settings → Role rosters.`,
          },
          { status: 403 },
        );
      }
    }

    // Snapshot signer identity NOW.
    const signedAt = new Date().toISOString();
    const fp = await requestFingerprint();
    const dataHash = computeSignatureHash({
      submissionData: sRow.data,
      signerUserId: user.id,
      signedAt,
    });

    const { error: insErr } = await sb.from("submission_signatures").insert({
      submission_id: sRow.id,
      org_id: sRow.org_id,
      field_id: body.field_id,
      signer_user_id: user.id,
      signer_name: user.user_metadata?.full_name ?? user.email ?? "Unknown",
      signer_email: user.email ?? "",
      signature_image: body.signature_image,
      signed_at: signedAt,
      ip_address: fp.ip_address,
      user_agent: fp.user_agent,
      geolocation: body.geolocation ?? null,
      data_hash: dataHash,
    });
    if (insErr) throw insErr;

    // Did this signature complete every required signature on the form?
    const { data: existingSigs, error: sigsErr } = await sb
      .from("submission_signatures")
      .select("field_id")
      .eq("submission_id", sRow.id);
    if (sigsErr) throw sigsErr;
    const signedIds = new Set(
      ((existingSigs ?? []) as { field_id: string }[]).map((r) => r.field_id),
    );
    const requiredSigIds = allSigFields
      .filter((f) => f.required)
      .map((f) => f.id);
    const allRequiredSigned = requiredSigIds.every((fid) => signedIds.has(fid));

    if (allRequiredSigned) {
      await sb
        .from("submissions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", sRow.id);

      // Fire-and-forget the notification email. Never block signing
      // on email delivery — Resend down, missing env, zero recipients
      // configured, all of those are non-fatal. The email log table
      // captures success or failure for admins to inspect later.
      notifySubmissionCompleted(sRow.id).catch((err) => {
        console.error("[sign] notification email failed", err);
      });
    } else {
      // Not done yet — if there's a next assigned signer in the
      // chain, email them now. No-op if no remaining assignments.
      notifyNextSigner({
        submissionId: sRow.id,
        justSignedFieldId: body.field_id,
        justSignedByName:
          user.user_metadata?.full_name ?? user.email ?? undefined,
      }).catch((err) => {
        console.error("[sign] next-signer email failed", err);
      });

      if (sRow.status === "in_progress") {
        // We have at least one signature now; mark awaiting_signature.
        await sb
          .from("submissions")
          .update({ status: "awaiting_signature" })
          .eq("id", sRow.id);
      }
    }

    await writeAudit({
      orgId: sRow.org_id,
      actorUserId: user.id,
      action: "submission.signed",
      resourceType: "submission",
      resourceId: sRow.id,
      metadata: {
        field_id: body.field_id,
        all_required_signed: allRequiredSigned,
        data_hash: dataHash,
      },
    });

    // ----------------------------------------------------------
    // Optional batch apply: sign the same field on every sibling
    // submission in the same batch where this user is also the
    // assignee. Saves Heli admin / OIM from signing 5-8 times.
    //
    // Each sibling gets its own signature row with its own data_hash
    // bound to that sibling's submission data — tamper-evidence is
    // preserved per submission. The signer's identity, image,
    // timestamp, IP, and geolocation are identical across them
    // (it's literally the same human signing the same moment).
    // ----------------------------------------------------------
    const batchResults: {
      siblings_signed: number;
      siblings_skipped: { id: string; reason: string }[];
      siblings_completed: number;
    } = { siblings_signed: 0, siblings_skipped: [], siblings_completed: 0 };

    if (body.batch_apply && sRow.batch_id) {
      const { data: sibsRows } = await sb
        .from("submissions")
        .select(
          "id, org_id, status, data, signature_assignments, form_version_id",
        )
        .eq("batch_id", sRow.batch_id)
        .eq("org_id", sRow.org_id)
        .neq("id", sRow.id);
      const sibs = (sibsRows ?? []) as {
        id: string;
        org_id: string;
        status: string;
        data: Record<string, unknown>;
        signature_assignments: SignatureAssignments | null;
        form_version_id: string;
      }[];

      // Existing signatures on every sibling for this field — skip if
      // already signed.
      const sibIds = sibs.map((sib) => sib.id);
      const alreadySignedSet = new Set<string>();
      if (sibIds.length > 0) {
        const { data: existing } = await sb
          .from("submission_signatures")
          .select("submission_id")
          .in("submission_id", sibIds)
          .eq("field_id", body.field_id);
        for (const row of (existing ?? []) as { submission_id: string }[]) {
          alreadySignedSet.add(row.submission_id);
        }
      }

      for (const sib of sibs) {
        if (sib.status === "completed" || sib.status === "rejected") {
          batchResults.siblings_skipped.push({ id: sib.id, reason: sib.status });
          continue;
        }
        if (sib.form_version_id !== sRow.form_version_id) {
          batchResults.siblings_skipped.push({
            id: sib.id,
            reason: "different form version",
          });
          continue;
        }
        // Same field must exist as a signature on the sibling (will be
        // true if they share form_version_id — all forms in a batch do).
        // Must also include this user as a valid signer (specific
        // person OR role roster member).
        const sibAssign = (sib.signature_assignments ?? {})[body.field_id];
        if (!sibAssign) {
          batchResults.siblings_skipped.push({ id: sib.id, reason: "unassigned" });
          continue;
        }
        const me = (user.email ?? "").toLowerCase();
        const isAllowed =
          (sibAssign as { kind?: string }).kind === "role"
            ? (sibAssign as { member_emails: string[] }).member_emails
                .map((e) => e.toLowerCase())
                .includes(me)
            : (sibAssign as { email?: string }).email?.toLowerCase() === me;
        if (!isAllowed) {
          batchResults.siblings_skipped.push({
            id: sib.id,
            reason: "assigned to someone else",
          });
          continue;
        }
        if (alreadySignedSet.has(sib.id)) {
          batchResults.siblings_skipped.push({ id: sib.id, reason: "already signed" });
          continue;
        }

        // Compute hash for THIS sibling's data, not the source's.
        const sibHash = computeSignatureHash({
          submissionData: sib.data ?? {},
          signerUserId: user.id,
          signedAt,
        });

        const { error: sibInsErr } = await sb
          .from("submission_signatures")
          .insert({
            submission_id: sib.id,
            org_id: sib.org_id,
            field_id: body.field_id,
            signer_user_id: user.id,
            signer_name:
              user.user_metadata?.full_name ?? user.email ?? "Unknown",
            signer_email: user.email ?? "",
            signature_image: body.signature_image,
            signed_at: signedAt,
            ip_address: fp.ip_address,
            user_agent: fp.user_agent,
            geolocation: body.geolocation ?? null,
            data_hash: sibHash,
          });
        if (sibInsErr) {
          batchResults.siblings_skipped.push({
            id: sib.id,
            reason: `insert failed: ${sibInsErr.message}`,
          });
          continue;
        }
        batchResults.siblings_signed++;

        // Re-evaluate sibling completion. requiredSigIds is the same
        // across siblings (same form_version_id).
        const { data: sigsForSib } = await sb
          .from("submission_signatures")
          .select("field_id")
          .eq("submission_id", sib.id);
        const sigIdsForSib = new Set(
          ((sigsForSib ?? []) as { field_id: string }[]).map((r) => r.field_id),
        );
        const sibAllSigned = requiredSigIds.every((fid) =>
          sigIdsForSib.has(fid),
        );
        if (sibAllSigned) {
          await sb
            .from("submissions")
            .update({
              status: "completed",
              completed_at: new Date().toISOString(),
            })
            .eq("id", sib.id);
          batchResults.siblings_completed++;
          notifySubmissionCompleted(sib.id).catch((err) => {
            console.error("[sign-batch] completion email failed", err);
          });
        } else {
          if (sib.status === "in_progress") {
            await sb
              .from("submissions")
              .update({ status: "awaiting_signature" })
              .eq("id", sib.id);
          }
          notifyNextSigner({
            submissionId: sib.id,
            justSignedFieldId: body.field_id,
            justSignedByName:
              user.user_metadata?.full_name ?? user.email ?? undefined,
          }).catch((err) => {
            console.error("[sign-batch] next-signer email failed", err);
          });
        }
      }

      await writeAudit({
        orgId: sRow.org_id,
        actorUserId: user.id,
        action: "submission.batch_signed",
        resourceType: "submission",
        resourceId: sRow.batch_id,
        metadata: {
          field_id: body.field_id,
          siblings_signed: batchResults.siblings_signed,
          siblings_completed: batchResults.siblings_completed,
          siblings_skipped: batchResults.siblings_skipped,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      completed: allRequiredSigned,
      batch: body.batch_apply ? batchResults : undefined,
    });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
