import { createHash } from "node:crypto";

/**
 * Compute the data integrity hash bound to a signature.
 *
 * Inputs are joined into a canonical string with sorted JSON keys, then
 * hashed with SHA-256. The hash is stored alongside the signature row.
 *
 * Verification: at any later time, recompute the hash from the stored
 * submission data + the same signer + the same signed_at. If the
 * recomputed hash differs from what's stored on the signature row, the
 * submission was tampered with after signing — the signature is invalid.
 */
export function computeSignatureHash(args: {
  submissionData: Record<string, unknown>;
  signerUserId: string;
  signedAt: string;
}): string {
  const canonical = canonicalize(args.submissionData);
  const blob = `${args.signerUserId}|${args.signedAt}|${canonical}`;
  return createHash("sha256").update(blob).digest("hex");
}

/**
 * Stable, deterministic JSON serialization. Object keys are sorted at
 * every level. Required for the integrity hash to be reproducible
 * regardless of key insertion order.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return (
    "{" +
    keys
      .map((k) => JSON.stringify(k) + ":" + canonicalize(obj[k]))
      .join(",") +
    "}"
  );
}
