/**
 * Single-user mode. All actual auth happens in middleware via the
 * APP_PASSWORD env var; by the time a route runs, the request is
 * already authorized. This file just provides a server-side check
 * that throws the same Response shape the rest of the app expects.
 */

import { cookies } from "next/headers";

const COOKIE_NAME = "reel_auth";

export async function requireUser() {
  const c = await cookies();
  const have = c.get(COOKIE_NAME)?.value;
  const password = process.env.APP_PASSWORD;
  if (!have || !password || have !== (await sha256(password))) {
    throw new Response("Unauthorized", { status: 401 });
  }
  // Single user — no real identity to return. We hand back a stable
  // sentinel so callers that pass it to the DB just see one user.
  return { id: "owner" };
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
