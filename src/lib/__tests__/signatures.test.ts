import { describe, expect, it } from "vitest";
import { canonicalize, computeSignatureHash } from "@/lib/signatures";

/**
 * The hash binds a signature to the data state at signing time —
 * the audit-grade trust anchor of the whole product. Two
 * properties matter:
 *
 *  1. Determinism: identical input → identical hash, regardless of
 *     JSON key insertion order. Without this, verification fails
 *     spuriously when the data was re-serialized.
 *  2. Sensitivity: any change to the data → different hash. This
 *     is what makes tampering detectable.
 */

describe("canonicalize", () => {
  it("emits identical strings regardless of key order", () => {
    const a = canonicalize({ b: 1, a: 2, c: 3 });
    const b = canonicalize({ a: 2, c: 3, b: 1 });
    expect(a).toBe(b);
  });

  it("recurses into nested objects (deep key sort)", () => {
    const a = canonicalize({ outer: { z: 1, a: 2 } });
    const b = canonicalize({ outer: { a: 2, z: 1 } });
    expect(a).toBe(b);
  });

  it("preserves array order (arrays are ordered by definition)", () => {
    const a = canonicalize({ list: ["x", "y", "z"] });
    const b = canonicalize({ list: ["z", "y", "x"] });
    expect(a).not.toBe(b);
  });

  it("emits valid JSON shape (round-trips through JSON.parse)", () => {
    const out = canonicalize({ a: 1, b: { c: [1, 2] }, d: null });
    expect(() => JSON.parse(out)).not.toThrow();
  });

  it("handles null and primitive scalars", () => {
    expect(canonicalize(null)).toBe("null");
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("hello")).toBe('"hello"');
  });
});

describe("computeSignatureHash", () => {
  const baseArgs = {
    submissionData: { name: "Marcus", checked: true },
    signerUserId: "user-abc",
    signedAt: "2026-05-11T12:00:00Z",
  };

  it("is deterministic for identical inputs", () => {
    const h1 = computeSignatureHash(baseArgs);
    const h2 = computeSignatureHash(baseArgs);
    expect(h1).toBe(h2);
  });

  it("is insensitive to data key order (canonicalisation works end-to-end)", () => {
    const h1 = computeSignatureHash({
      ...baseArgs,
      submissionData: { name: "Marcus", checked: true },
    });
    const h2 = computeSignatureHash({
      ...baseArgs,
      submissionData: { checked: true, name: "Marcus" },
    });
    expect(h1).toBe(h2);
  });

  it("changes when data changes (tamper detection)", () => {
    const h1 = computeSignatureHash(baseArgs);
    const h2 = computeSignatureHash({
      ...baseArgs,
      submissionData: { ...baseArgs.submissionData, name: "Ashley" },
    });
    expect(h1).not.toBe(h2);
  });

  it("changes when signer changes (identity binding)", () => {
    const h1 = computeSignatureHash(baseArgs);
    const h2 = computeSignatureHash({ ...baseArgs, signerUserId: "user-xyz" });
    expect(h1).not.toBe(h2);
  });

  it("changes when timestamp changes (replay protection)", () => {
    const h1 = computeSignatureHash(baseArgs);
    const h2 = computeSignatureHash({
      ...baseArgs,
      signedAt: "2026-05-11T12:00:01Z",
    });
    expect(h1).not.toBe(h2);
  });

  it("emits a 64-char hex sha256", () => {
    const h = computeSignatureHash(baseArgs);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
  });
});
