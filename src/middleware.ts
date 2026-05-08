import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "reel_auth";
const PUBLIC_PATHS = new Set(["/login", "/api/auth", "/api/health"]);

/**
 * Single-user password gate. Set APP_PASSWORD in env. Anyone hitting
 * the app gets bounced to /login if their cookie doesn't match.
 *
 * Cookie value is the SHA-256 of APP_PASSWORD — that way we never
 * store the password, and a cookie leak is mitigated by rotating
 * APP_PASSWORD (which changes the expected hash, invalidating every
 * issued cookie). HTTP-only + secure flags on the cookie itself.
 */
export async function middleware(req: NextRequest) {
  const path = req.nextUrl.pathname;

  // Static + Next internals + a small allowlist
  if (
    path.startsWith("/_next") ||
    path === "/favicon.ico" ||
    path.match(/\.(svg|png|jpg|jpeg|gif|webp|mp4)$/)
  ) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.has(path)) return NextResponse.next();
  // /api/jobs/poll uses its own bearer auth; don't gate it with the cookie.
  if (path.startsWith("/api/jobs/")) return NextResponse.next();

  const password = process.env.APP_PASSWORD;
  if (!password) {
    // No password configured — fail closed. Friendly error.
    return NextResponse.json(
      { error: "APP_PASSWORD is not configured on the server" },
      { status: 503 },
    );
  }

  const expected = await hash(password);
  const cookie = req.cookies.get(COOKIE_NAME)?.value;

  if (cookie !== expected) {
    if (path.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const redirect = req.nextUrl.clone();
    redirect.pathname = "/login";
    redirect.searchParams.set("next", path);
    return NextResponse.redirect(redirect);
  }

  return NextResponse.next();
}

async function hash(s: string): Promise<string> {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(s),
  );
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
