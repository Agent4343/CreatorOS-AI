import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Signed read-only links to a submission's print view.
 *
 * Use case: when a submission completes, we email recipients (e.g.
 * the safety officer at safety@hebron.com) a link to view the
 * compliance artifact. Those recipients aren't necessarily
 * org members — they may not even have a FieldForm account. So
 * we sign the link with HMAC and validate it server-side instead
 * of going through Supabase auth.
 *
 * The token encodes the submission id and an expiry (default 90
 * days). Anyone who has the token can read the submission until
 * it expires; anyone who doesn't can't, even if they guess the id.
 */

function secret(): string {
  // Dedicated env var if set, else derive from the service role key
  // — both have the same trust level (server-only) and using the
  // service key as fallback means one less env var the user has to
  // configure. The HMAC seed never leaves the server either way.
  const s =
    process.env.EMAIL_LINK_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!s) {
    throw new Error(
      "EMAIL_LINK_SECRET or SUPABASE_SERVICE_ROLE_KEY required for signed links",
    );
  }
  return s;
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/=+$/, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(s: string): Buffer {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  return Buffer.from(padded, "base64");
}

export function signSubmissionToken(
  submissionId: string,
  ttlSeconds = 60 * 60 * 24 * 90,
): string {
  const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
  const payload = `${submissionId}.${expiresAt}`;
  const sig = createHmac("sha256", secret()).update(payload).digest();
  return `${payload}.${b64url(sig)}`;
}

export function verifySubmissionToken(
  token: string,
): { submissionId: string; expiresAt: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [submissionId, expiresAtStr, sigB64] = parts;
  const expiresAt = Number(expiresAtStr);
  if (!Number.isFinite(expiresAt)) return null;
  if (expiresAt < Math.floor(Date.now() / 1000)) return null;

  const expected = createHmac("sha256", secret())
    .update(`${submissionId}.${expiresAt}`)
    .digest();
  let provided: Buffer;
  try {
    provided = fromB64url(sigB64);
  } catch {
    return null;
  }
  if (provided.length !== expected.length) return null;
  if (!timingSafeEqual(provided, expected)) return null;
  return { submissionId, expiresAt };
}

/**
 * Build the absolute URL the email recipient clicks. APP_URL is the
 * canonical Railway / production domain; falls back to localhost for
 * dev so the smoke test works without extra config.
 */
export function buildPrintLink(submissionId: string): string {
  const base =
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    "http://localhost:3000";
  const token = signSubmissionToken(submissionId);
  return `${base.replace(/\/$/, "")}/submissions/${submissionId}/print?token=${encodeURIComponent(token)}`;
}
