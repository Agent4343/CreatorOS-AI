import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { importPaperForm, type ImportMode } from "@/lib/prompts/importForm";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "application/pdf",
]);

/**
 * Paper-to-digital. Accepts a multipart upload of an image or PDF;
 * returns a draft FormDefinition the caller can review and save via
 * POST /api/forms.
 *
 * No DB write here — this is a pure transformation. The audit row
 * goes in when the user saves the resulting form.
 */
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const orgId = form.get("org_id");
    if (typeof orgId !== "string") {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }
    await requireRole(orgId, "admin");

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "file (image or PDF) required" },
        { status: 400 },
      );
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: `File too large (max ${MAX_BYTES / 1024 / 1024} MB)` },
        { status: 413 },
      );
    }
    if (!ALLOWED_TYPES.has(file.type)) {
      return NextResponse.json(
        { error: `Unsupported type: ${file.type}` },
        { status: 415 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const hint = form.get("hint");
    const userHint = typeof hint === "string" ? hint : undefined;

    const modeRaw = form.get("mode");
    const mode: ImportMode =
      typeof modeRaw === "string" && modeRaw === "fast" ? "fast" : "accurate";

    const { schema: definition, usage } = await importPaperForm({
      image: base64,
      mediaType: file.type as
        | "image/png"
        | "image/jpeg"
        | "image/gif"
        | "image/webp"
        | "application/pdf",
      userHint,
      mode,
    });

    // Audit the import attempt itself — it's a consequential AI call.
    // Token counts go in the metadata so admins can spot-check
    // cost / cache behaviour from the audit log.
    await writeAudit({
      orgId,
      actorUserId: null,
      action: "form.imported",
      resourceType: "form",
      metadata: {
        source_filename: file.name,
        source_type: file.type,
        source_size_bytes: file.size,
        sections: definition.sections.length,
        fields: definition.sections.reduce(
          (n, s) => n + s.fields.length,
          0,
        ),
        ai: usage,
      },
    });

    return NextResponse.json({ schema: definition, usage });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
