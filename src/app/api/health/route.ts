import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED = [
  "ANTHROPIC_API_KEY",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

// Optional but worth surfacing in /api/health so the deploy can see
// whether they're set. Not required for the app to start.
const OPTIONAL = [
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "STRIPE_PRICE_STARTER",
  "STRIPE_PRICE_PRO",
  "ADMIN_USER_IDS",
  "RESEND_API_KEY",
  "EMAIL_FROM",
  "APP_URL",
];

export async function GET() {
  const missing = REQUIRED.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    return NextResponse.json({ ok: false, missing }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    commit: process.env.RAILWAY_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
    optional_unset: OPTIONAL.filter((k) => !process.env[k]),
  });
}
