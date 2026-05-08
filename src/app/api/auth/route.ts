import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "reel_auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const password = process.env.APP_PASSWORD;
  if (!password) {
    return NextResponse.json(
      { error: "APP_PASSWORD is not configured on the server" },
      { status: 503 },
    );
  }

  const body = (await req.json()) as { password?: string };
  if (body.password !== password) {
    return NextResponse.json({ error: "Wrong password" }, { status: 401 });
  }

  const expected = await sha256(password);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
  return res;
}

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
