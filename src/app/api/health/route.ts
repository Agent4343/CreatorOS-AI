import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export async function GET() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, missing }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
  });
}
