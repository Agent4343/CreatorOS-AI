import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { createOrgWithOwner, listUserOrgs } from "@/lib/orgs";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireUser();
    const orgs = await listUserOrgs(user.id);
    return NextResponse.json({ orgs });
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
    const body = (await req.json()) as { name?: string; full_name?: string };
    const name = (body.name ?? "").trim();
    if (name.length < 2) {
      return NextResponse.json({ error: "Name too short" }, { status: 400 });
    }
    const org = await createOrgWithOwner({
      name,
      ownerUserId: user.id,
      ownerName: body.full_name,
    });
    await writeAudit({
      orgId: org.id,
      actorUserId: user.id,
      action: "org.created",
      resourceType: "org",
      resourceId: org.id,
      metadata: { name },
    });
    return NextResponse.json({ org });
  } catch (e) {
    if (e instanceof AuthError) return e;
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Unknown error" },
      { status: 500 },
    );
  }
}
