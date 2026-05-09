import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseAuthed, supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

/**
 * Start a new submission against a form. Picks the form's current
 * version automatically. Returns the new submission so the client can
 * navigate to /submissions/[id] to fill it in.
 */
export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as { form_id?: string; org_id?: string };
    if (!body.form_id || !body.org_id) {
      return NextResponse.json(
        { error: "form_id and org_id required" },
        { status: 400 },
      );
    }
    await requireMembership(body.org_id);

    // Load the form's current version through the service role so we
    // can resolve the current_version → form_versions.id atomically
    // even if the user only has member-level read.
    const sb = supabaseService();
    const { data: form, error: formErr } = await sb
      .from("forms")
      .select("id, org_id, current_version, archived")
      .eq("id", body.form_id)
      .eq("org_id", body.org_id)
      .maybeSingle();
    if (formErr) throw formErr;
    if (!form) {
      return NextResponse.json({ error: "Form not found" }, { status: 404 });
    }
    if ((form as { archived: boolean }).archived) {
      return NextResponse.json(
        { error: "Form is archived" },
        { status: 409 },
      );
    }

    const { data: version, error: verErr } = await sb
      .from("form_versions")
      .select("id")
      .eq("form_id", body.form_id)
      .eq("version_number", (form as { current_version: number }).current_version)
      .maybeSingle();
    if (verErr || !version) {
      return NextResponse.json(
        { error: "Form version missing" },
        { status: 500 },
      );
    }

    const { data: submission, error: subErr } = await sb
      .from("submissions")
      .insert({
        org_id: body.org_id,
        form_id: body.form_id,
        form_version_id: (version as { id: string }).id,
        status: "in_progress",
        data: {},
        started_by: user.id,
      })
      .select()
      .single();
    if (subErr || !submission) {
      throw subErr ?? new Error("Failed to create submission");
    }

    await writeAudit({
      orgId: body.org_id,
      actorUserId: user.id,
      action: "submission.created",
      resourceType: "submission",
      resourceId: (submission as { id: string }).id,
      metadata: { form_id: body.form_id },
    });

    return NextResponse.json({ submission });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const orgId = req.nextUrl.searchParams.get("org_id");
    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }
    const sb = await supabaseAuthed();
    const { data, error } = await sb
      .from("submissions")
      .select("id, form_id, status, started_by, created_at, completed_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    return NextResponse.json({ submissions: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
