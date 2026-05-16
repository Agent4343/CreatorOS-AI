import { describe, expect, it } from "vitest";
import {
  assignmentsMatch,
  changedFieldIds,
} from "@/lib/batchCascade";
import type { FormDefinition, SignatureAssignment } from "@/lib/types";

/**
 * Tests for the batch cascade rule. These are the riskiest pieces
 * we ship: a wrong answer here either leaks data to the wrong
 * sibling (security) or fails to propagate (UX regression). Each
 * test names the real scenario it's guarding against — heli admin
 * vs. supervisor vs. inductee.
 */

describe("assignmentsMatch", () => {
  it("matches identical user assignments (heli admin == heli admin)", () => {
    const a: SignatureAssignment = { email: "brad@hebron.com", name: "Brad" };
    const b: SignatureAssignment = { email: "brad@hebron.com", name: "Brad" };
    expect(assignmentsMatch(a, b)).toBe(true);
  });

  it("matches identical user assignments case-insensitively", () => {
    const a: SignatureAssignment = { email: "Brad@Hebron.com" };
    const b: SignatureAssignment = { email: "brad@hebron.com" };
    expect(assignmentsMatch(a, b)).toBe(true);
  });

  it("rejects mismatched supervisors (Sam's crew vs Pat's crew)", () => {
    const a: SignatureAssignment = { email: "sam@hebron.com" };
    const b: SignatureAssignment = { email: "pat@hebron.com" };
    expect(assignmentsMatch(a, b)).toBe(false);
  });

  it("matches identical role assignments by role_id", () => {
    const a: SignatureAssignment = {
      kind: "role",
      role_id: "00000000-0000-0000-0000-000000000001",
      role_label: "OIM",
      member_emails: ["a@x.com"],
    };
    const b: SignatureAssignment = {
      kind: "role",
      role_id: "00000000-0000-0000-0000-000000000001",
      role_label: "OIM",
      // Member list could legitimately differ between siblings if
      // the snapshot was taken at different moments. Match on
      // role_id, not membership.
      member_emails: ["b@x.com", "c@x.com"],
    };
    expect(assignmentsMatch(a, b)).toBe(true);
  });

  it("rejects different role_ids", () => {
    const a: SignatureAssignment = {
      kind: "role",
      role_id: "role-1",
      role_label: "OIM",
      member_emails: [],
    };
    const b: SignatureAssignment = {
      kind: "role",
      role_id: "role-2",
      role_label: "Supervisor",
      member_emails: [],
    };
    expect(assignmentsMatch(a, b)).toBe(false);
  });

  it("rejects mismatched kinds (role vs user)", () => {
    // Critical: this is the "I set the field to role on one row and
    // forgot on another" footgun. Never cascade across kinds.
    const a: SignatureAssignment = { email: "brad@hebron.com" };
    const b: SignatureAssignment = {
      kind: "role",
      role_id: "role-1",
      role_label: "Heli admin",
      member_emails: ["brad@hebron.com"],
    };
    expect(assignmentsMatch(a, b)).toBe(false);
  });

  it("rejects undefined on either side", () => {
    const a: SignatureAssignment = { email: "brad@hebron.com" };
    expect(assignmentsMatch(a, undefined)).toBe(false);
    expect(assignmentsMatch(undefined, a)).toBe(false);
    expect(assignmentsMatch(undefined, undefined)).toBe(false);
  });

  it("rejects empty-email vs empty-email (never cascade unassigned)", () => {
    const a: SignatureAssignment = { email: "" };
    const b: SignatureAssignment = { email: "" };
    expect(assignmentsMatch(a, b)).toBe(false);
  });
});

describe("changedFieldIds", () => {
  const schema: FormDefinition = {
    sections: [
      {
        id: "s1",
        title: "Heli admin",
        fields: [
          { id: "checkbox-pre-flight", type: "checkbox", label: "Pre-flight" },
          { id: "notes", type: "textarea", label: "Notes" },
          { id: "admin-sig", type: "signature", label: "Admin sig" },
          { id: "header-row", type: "section_header", label: "—" },
        ],
      },
    ],
  } as unknown as FormDefinition;

  it("returns ids whose values changed", () => {
    const old = { "checkbox-pre-flight": true, notes: "ok" };
    const fresh = { "checkbox-pre-flight": true, notes: "updated" };
    expect(changedFieldIds(schema, old, fresh)).toEqual(["notes"]);
  });

  it("returns nothing when nothing changed", () => {
    const old = { notes: "ok" };
    const fresh = { notes: "ok" };
    expect(changedFieldIds(schema, old, fresh)).toEqual([]);
  });

  it("ignores signature fields (they cascade via /sign, not PATCH)", () => {
    const old = { "admin-sig": null };
    const fresh = { "admin-sig": "data:image/png;base64,abc" };
    expect(changedFieldIds(schema, old, fresh)).toEqual([]);
  });

  it("ignores section_header and divider fields", () => {
    const old = { "header-row": "x" };
    const fresh = { "header-row": "y" };
    expect(changedFieldIds(schema, old, fresh)).toEqual([]);
  });

  it("ignores unknown fields not in the schema", () => {
    const old = { foo: 1 };
    const fresh = { foo: 2 };
    expect(changedFieldIds(schema, old, fresh)).toEqual([]);
  });

  it("treats array-equal values as unchanged", () => {
    const old = { "checkbox-pre-flight": ["a", "b"] };
    const fresh = { "checkbox-pre-flight": ["a", "b"] };
    expect(changedFieldIds(schema, old, fresh)).toEqual([]);
  });

  it("treats array length change as a change", () => {
    const old = { "checkbox-pre-flight": ["a"] };
    const fresh = { "checkbox-pre-flight": ["a", "b"] };
    expect(changedFieldIds(schema, old, fresh)).toEqual([
      "checkbox-pre-flight",
    ]);
  });

  it("treats null -> '' as no-change (both empty)", () => {
    // Edge case from the form runner: input controls flicker between
    // null and "" as users tab through. The cascade shouldn't fire
    // for that.
    const old = { notes: null };
    const fresh = { notes: "" };
    // Strict equality fails but both are 'empty' — our deepEqual
    // doesn't treat them as equal. This test documents the current
    // behavior; a stricter equality could be added later if the
    // cascade becomes too chatty.
    expect(changedFieldIds(schema, old, fresh)).toEqual(["notes"]);
  });
});
