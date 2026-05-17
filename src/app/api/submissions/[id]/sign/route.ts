import { NextRequest, NextResponse } from "next/server";
import { AuthError, requestFingerprint, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { notifyNextSigner } from "@/lib/notifyNextSigner";
import { notifySubmissionCompleted } from "@/lib/notifySubmissionCompleted";
import { computeSignatureHash } from "@/lib/signatures";
import { uploadSignaturePng } from "@/lib/signatureStorage";
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
      /** Optimistic-lock token. A signature attests to the data the
       * user *saw* at sign time — so if the row has been edited
       * since the runner loaded it, we refuse the signature with a
       * 409 instead of binding a hash to data the signer didn't
       * actually consent to. */
      expected_updated_at?: string;
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
        "id, org_id, status, data, form_id, form_version_id, signature_assignments, batch_id, updated_at",
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
      updated_at: string;
    };

    await requireMembership(sRow.org_id);

    if (sRow.status === "completed" || sRow.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot sign a ${sRow.status} submission` },
        { status: 409 },
      );
    }

    // Optimistic-lock on the data being signed. A signature is a
    // legal attestation to the data state at the moment of signing;
    // if someone else changed the row since this client loaded it,
    // signing now would bind a data_hash to data the signer didn't
    // see and didn't consent to. Refuse, return the new state, let
    // the runner re-render and re-prompt.
    if (
      body.expected_updated_at &&
      body.expected_updated_at !== sRow.updated_at
    ) {
      return NextResponse.json(
        {
          error:
            "Form was edited after you loaded it. Reload and re-check the data before signing.",
          conflict: true,
          current_updated_at: sRow.updated_at,
        },
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
    // The role can come from either the field itself or the
    // containing section; the section-level rule is the typical case
    // (a whole "OIM" section gates its signature without needing the
    // field marked too).
    const containingSection = schema.sections.find((s) =>
      s.fields.some((f) => f.id === body.field_id),
    );

    // Required-field gate. Signing a section attests to the data in
    // that section — and "this is correct" can't be true if a
    // required field is blank. Refuse the signature with a 422 that
    // names the missing fields so the runner can highlight them.
    // Auto-save runs every 5 sec, so by the time sign is clicked the
    // submission row should be in sync with what the user sees; we
    // read sRow.data here rather than trusting the client.
    if (containingSection) {
      const missing: string[] = [];
      for (const f of containingSection.fields) {
        if (!f.required) continue;
        if (
          f.type === "section_header" ||
          f.type === "divider" ||
          f.type === "signature"
        ) {
          continue;
        }
        const v = (sRow.data ?? {})[f.id];
        const empty =
          v == null || v === "" || (Array.isArray(v) && v.length === 0);
        if (empty) missing.push(f.label || f.id);
      }
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Required field${missing.length === 1 ? "" : "s"} not filled in: ${missing.join(", ")}.`,
            missing_fields: missing,
            section_id: containingSection.id,
          },
          { status: 422 },
        );
      }
    }

    const effectiveRequiredRoleId =
      target.required_role_id ?? containingSection?.required_role_id;
    if (effectiveRequiredRoleId) {
      const { data: roleRow } = await sb
        .from("org_roles")
        .select("name, members")
        .eq("id", effectiveRequiredRoleId)
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

    // Inductee-section gate. Only the inductee whose email is on
    // this submission can sign in the inductee section. We resolve
    // that email by looking at the assignment of the signature
    // field within an inductee_section (the batch route puts the
    // inductee's email there).
    if (containingSection?.inductee_section) {
      let inducteeEmail: string | null = null;
      for (const sec of schema.sections) {
        if (!sec.inductee_section) continue;
        for (const f of sec.fields) {
          if (f.type !== "signature") continue;
          const a = assignments[f.id];
          if (!a) continue;
          if ((a as { kind?: string }).kind === "role") continue;
          inducteeEmail = (a as { email?: string }).email?.toLowerCase() ?? null;
          if (inducteeEmail) break;
        }
        if (inducteeEmail) break;
      }
      if (inducteeEmail && (user.email ?? "").toLowerCase() !== inducteeEmail) {
        return NextResponse.json(
          {
            error: `Only ${inducteeEmail} (the inductee) can sign "${containingSection.title}".`,
          },
          { status: 403 },
        );
      }
    }

    // Sequential workflow gate. If the form template uses section-
    // level gating (Heli admin → OIM → Supervisor → Inductee), each
    // section opens only when the prior one is signed. Refuse a
    // signature on section N when any earlier section that has
    // signatures hasn't been fully signed yet — otherwise OIM could
    // sign section 2 before Heli admin signs section 1, breaking the
    // intended approval chain.
    if (containingSection) {
      const sectionIdx = schema.sections.findIndex(
        (s) => s.id === containingSection.id,
      );
      const { data: priorSigsRows } = await sb
        .from("submission_signatures")
        .select("field_id")
        .eq("submission_id", sRow.id);
      const signedSet = new Set(
        ((priorSigsRows ?? []) as { field_id: string }[]).map(
          (r) => r.field_id,
        ),
      );
      for (let i = 0; i < sectionIdx; i++) {
        const prior = schema.sections[i];
        const priorSigs = prior.fields.filter((f) => f.type === "signature");
        if (priorSigs.length === 0) continue;
        const allSigned = priorSigs.every((f) => signedSet.has(f.id));
        if (!allSigned) {
          return NextResponse.json(
            {
              error: `"${prior.title}" must be signed before "${containingSection.title}" can be signed.`,
            },
            { status: 409 },
          );
        }
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

    // Pre-generate the row id so we can upload to storage at a
    // stable path BEFORE inserting the row. If the row insert fails
    // we orphan a blob, which we clean up below; the inverse order
    // (insert then upload then update) leaves an orphaned row with
    // no image, which is harder to detect.
    const signatureId = crypto.randomUUID();
    const imagePath = await uploadSignaturePng({
      orgId: sRow.org_id,
      submissionId: sRow.id,
      signatureId,
      dataUrl: body.signature_image,
    });

    const { error: insErr } = await sb.from("submission_signatures").insert({
      id: signatureId,
      submission_id: sRow.id,
      org_id: sRow.org_id,
      field_id: body.field_id,
      signer_user_id: user.id,
      signer_name: user.user_metadata?.full_name ?? user.email ?? "Unknown",
      signer_email: user.email ?? "",
      signature_image_path: imagePath,
      signed_at: signedAt,
      ip_address: fp.ip_address,
      user_agent: fp.user_agent,
      geolocation: body.geolocation ?? null,
      data_hash: dataHash,
    });
    if (insErr) {
      // Best-effort cleanup. If the storage delete also fails the
      // worst outcome is a stranded PNG no row points at; a periodic
      // janitor can prune those.
      await sb.storage
        .from("signatures")
        .remove([imagePath])
        .catch(() => undefined);
      throw insErr;
    }

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

        // Upload a per-sibling copy of the PNG. We could share one
        // blob across siblings but the storage cost is trivial and
        // a per-sibling object lets us delete one sibling's data
        // without touching another's.
        const sibSignatureId = crypto.randomUUID();
        let sibImagePath: string;
        try {
          sibImagePath = await uploadSignaturePng({
            orgId: sib.org_id,
            submissionId: sib.id,
            signatureId: sibSignatureId,
            dataUrl: body.signature_image,
          });
        } catch (uploadErr) {
          batchResults.siblings_skipped.push({
            id: sib.id,
            reason: `upload failed: ${uploadErr instanceof Error ? uploadErr.message : String(uploadErr)}`,
          });
          continue;
        }

        const { error: sibInsErr } = await sb
          .from("submission_signatures")
          .insert({
            id: sibSignatureId,
            submission_id: sib.id,
            org_id: sib.org_id,
            field_id: body.field_id,
            signer_user_id: user.id,
            signer_name:
              user.user_metadata?.full_name ?? user.email ?? "Unknown",
            signer_email: user.email ?? "",
            signature_image_path: sibImagePath,
            signed_at: signedAt,
            ip_address: fp.ip_address,
            user_agent: fp.user_agent,
            geolocation: body.geolocation ?? null,
            data_hash: sibHash,
          });
        if (sibInsErr) {
          await sb.storage
            .from("signatures")
            .remove([sibImagePath])
            .catch(() => undefined);
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
