import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getCurrentCreator, saveSourceContent } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const { body, kind } = (await req.json()) as {
      body: string;
      kind?: string;
    };

    if (!body || body.trim().length < 50) {
      return NextResponse.json(
        { error: "Content too short" },
        { status: 400 },
      );
    }

    const creator = await getCurrentCreator(user.id);
    if (!creator) {
      return NextResponse.json({ error: "Creator not found" }, { status: 404 });
    }

    const row = await saveSourceContent(creator.id, body, kind ?? "pasted");
    return NextResponse.json({ id: row.id });
  } catch (e) {
    if (e instanceof Response) return e;
    const message = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
