import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseAuthed, supabaseService } from "@/lib/supabase/server";
import { FormDefinitionSchema } from "@/lib/types";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    await requireUser();
    const orgId = req.nextUrl.searchParams.get("org_id");
    if (!orgId) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }
    // Authed client → RLS scopes to orgs the user is in. Belt-and-braces:
    // also call requireMembership before reading.
    const sb = await supabaseAuthed();
    const { data, error } = await sb
      .from("forms")
      .select("*")
      .eq("org_id", orgId)
      .eq("archived", false)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ forms: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = (await req.json()) as {
      org_id?: string;
      schema?: unknown;
    };
    if (!body.org_id) {
      return NextResponse.json({ error: "org_id required" }, { status: 400 });
    }
    await requireRole(body.org_id, "admin");

    const definition = FormDefinitionSchema.parse(body.schema);

    const sb = supabaseService();
    const { data: form, error: formErr } = await sb
      .from("forms")
      .insert({
        org_id: body.org_id,
        name: definition.name,
        description: definition.description ?? null,
        schema: definition,
        current_version: 1,
        created_by: user.id,
      })
      .select()
      .single();
    if (formErr || !form) throw formErr ?? new Error("Failed to create form");

    const { error: verErr } = await sb.from("form_versions").insert({
      form_id: (form as { id: string }).id,
      org_id: body.org_id,
      version_number: 1,
      schema: definition,
      created_by: user.id,
    });
    if (verErr) throw verErr;

    await writeAudit({
      orgId: body.org_id,
      actorUserId: user.id,
      action: "form.created",
      resourceType: "form",
      resourceId: (form as { id: string }).id,
      metadata: { name: definition.name },
    });

    return NextResponse.json({ form });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
