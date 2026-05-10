import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireMembership, requireRole, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { supabaseService } from "@/lib/supabase/server";

export const runtime = "nodejs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Member = { email: string; name?: string };

/**
 * List roles for an org. Any member can read — UI needs to render
 * role labels in lock banners and the inbox even for non-admins.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireUser();
    const { id } = await params;
    await requireMembership(id);
    const sb = supabaseService();
    const { data, error } = await sb
      .from("org_roles")
      .select("id, name, description, members, created_at")
      .eq("org_id", id)
      .order("name");
    if (error) throw error;
    return NextResponse.json({ roles: data ?? [] });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

/**
 * Create a new role. Body: { name, description?, members: [{email, name?}] }
 *
 * Admin-only — creating/editing rosters changes who can sign
 * compliance documents. Members are normalised to lowercased emails;
 * duplicates within the same role are dropped.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireRole(id, "admin");

    const body = (await req.json()) as {
      name?: string;
      description?: string;
      members?: Member[];
    };
    const name = (body.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "name required" }, { status: 400 });
    }
    const members = normaliseMembers(body.members);
    const sb = supabaseService();
    const { data, error } = await sb
      .from("org_roles")
      .insert({
        org_id: id,
        name,
        description: body.description?.trim() || null,
        members,
        created_by: user.id,
      })
      .select("id, name, description, members, created_at")
      .single();
    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: `A role named "${name}" already exists` },
          { status: 409 },
        );
      }
      throw error;
    }

    await writeAudit({
      orgId: id,
      actorUserId: user.id,
      action: "org_role.created",
      resourceType: "org_role",
      resourceId: data.id,
      metadata: { name, member_count: members.length },
    });

    return NextResponse.json({ role: data });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}

export function normaliseMembers(input: unknown): Member[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const out: Member[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== "object") continue;
    const r = raw as { email?: unknown; name?: unknown };
    const email = String(r.email ?? "").trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    const name = typeof r.name === "string" ? r.name.trim() : "";
    out.push({ email, name: name || undefined });
  }
  return out;
}
