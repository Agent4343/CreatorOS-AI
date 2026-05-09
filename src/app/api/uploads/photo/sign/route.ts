import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership } from "@/lib/auth";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Issue a signed URL for displaying a photo previously uploaded to
 * the form-photos bucket. The bucket is private; clients hit this to
 * resolve a stored path into a temporary URL.
 *
 * Membership is verified before signing so we can't be tricked into
 * issuing a URL for a path under another org's folder.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { path?: string; org_id?: string };
    if (!body.path || !body.org_id) {
      return NextResponse.json(
        { error: "path and org_id required" },
        { status: 400 },
      );
    }
    await requireMembership(body.org_id);

    // The path must start with <org_id>/ — otherwise reject. RLS would
    // also reject, but doing it here means we never issue an even-
    // theoretically-cross-org URL.
    if (!body.path.startsWith(`${body.org_id}/`)) {
      return NextResponse.json(
        { error: "Path is not under this org's folder" },
        { status: 403 },
      );
    }

    const sb = supabaseService();
    const { data, error } = await sb.storage
      .from("form-photos")
      .createSignedUrl(body.path, 60 * 10); // 10 minutes
    if (error || !data) throw error ?? new Error("Failed to sign URL");

    return NextResponse.json({ url: data.signedUrl });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
