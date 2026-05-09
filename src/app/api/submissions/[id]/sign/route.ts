import { NextRequest, NextResponse } from "next/server";
import { AuthError, requestFingerprint, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { computeSignatureHash } from "@/lib/signatures";
import { supabaseService } from "@/lib/supabase/server";
import type { FormDefinition } from "@/lib/types";

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
      .select("id, org_id, status, data, form_id, form_version_id")
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
    };

    await requireMembership(sRow.org_id);

    if (sRow.status === "completed" || sRow.status === "rejected") {
      return NextResponse.json(
        { error: `Cannot sign a ${sRow.status} submission` },
        { status: 409 },
      );
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
    } else if (sRow.status === "in_progress") {
      // We have at least one signature now; mark awaiting_signature.
      await sb
        .from("submissions")
        .update({ status: "awaiting_signature" })
        .eq("id", sRow.id);
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

    return NextResponse.json({
      ok: true,
      completed: allRequiredSigned,
    });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
