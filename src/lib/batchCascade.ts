import type { supabaseService } from "@/lib/supabase/server";
import type {
  FormDefinition,
  FormSection,
  SignatureAssignment,
  SignatureAssignments,
} from "@/lib/types";
import { isRoleAssignment } from "@/lib/types";

/**
 * Sign-once-cascade for batch siblings.
 *
 * Heli admin starts a batch of N inductions. Their model: "I sign the
 * heli admin section once and it covers everyone. OIM signs their
 * section once. The supervisor for each crew signs once for that
 * crew. Each inductee signs their own form."
 *
 * For signatures the sign route already does this when batch_apply
 * is true. This helper handles the *non-signature* fields in the
 * same shared sections — checkbox lists, text descriptions, captured
 * values — so the heli admin doesn't have to retype the brief into
 * each sibling's copy of the form.
 *
 * Cascade rule: a non-signature field write propagates to a sibling
 * iff
 *   - the field belongs to a section that is NOT marked
 *     inductee_section, AND
 *   - that section contains a signature field, AND
 *   - the source's assignment for that signature equals the
 *     sibling's assignment for the same signature (same user email
 *     or same role_id), AND
 *   - the section's signature isn't already signed on the sibling
 *     (signed sections are immutable — propagating into them would
 *     invalidate the signature's data_hash).
 *
 * That gives us:
 *   heli admin section -> cascades to all (same admin assigned)
 *   OIM section -> cascades to all (same OIM assigned)
 *   supervisor section -> cascades within crew only
 *     (siblings with same supervisor; siblings with a different
 *     supervisor get a different assignment so are skipped)
 *   inductee section -> never cascades (inductee_section flag set)
 *
 * Failures are non-fatal — the source save already succeeded. We log
 * and move on rather than rolling back the source write.
 */

type ServiceClient = ReturnType<typeof supabaseService>;

export type CascadeResult = {
  /** Number of sibling submissions that received at least one field. */
  siblings_updated: number;
  /** Total field-writes performed across all siblings. */
  fields_written: number;
  /** Reasons siblings were skipped (debug aid). */
  skipped: { id: string; reason: string }[];
  /** True when the cascade short-circuited because the source was
   * cascaded recently. Caller can surface "queued for sync" to the
   * UI; the next save after the throttle window will land. */
  throttled?: boolean;
};

/** Minimum seconds between cascades for the same source submission.
 * 30s coalesces typical typing-rate auto-saves (every 5s) into one
 * cascade every 6 saves. Tunable per-environment via
 * CASCADE_THROTTLE_SECONDS. */
const CASCADE_THROTTLE_SECONDS = Math.max(
  0,
  Number(process.env.CASCADE_THROTTLE_SECONDS ?? 30),
);

/**
 * Find which fields in `newData` differ from `oldData`. Only non-
 * signature, non-display fields are eligible; signatures move via
 * the /sign route, dividers and headers have no value.
 *
 * Note: as of the reconciliation rewrite this is no longer used by
 * cascadeFieldChangesToSiblings — the cascade compares source vs
 * each sibling directly, which is correct under the throttle. The
 * function is kept exported because the unit tests exercise it
 * and because future call sites (e.g. an audit-trail "what
 * changed in this save?" feature) may want it.
 */
export function changedFieldIds(
  schema: FormDefinition,
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
): string[] {
  const eligible = new Set<string>();
  for (const sec of schema.sections) {
    for (const f of sec.fields) {
      if (f.type === "signature") continue;
      if (f.type === "section_header" || f.type === "divider") continue;
      eligible.add(f.id);
    }
  }
  const changed: string[] = [];
  for (const fid of Object.keys(newData)) {
    if (!eligible.has(fid)) continue;
    if (!deepEqual(newData[fid], oldData[fid])) changed.push(fid);
  }
  return changed;
}

/**
 * Returns the section that contains `fieldId`, or null if no section
 * does.
 */
function sectionContaining(
  schema: FormDefinition,
  fieldId: string,
): FormSection | null {
  for (const sec of schema.sections) {
    if (sec.fields.some((f) => f.id === fieldId)) return sec;
  }
  return null;
}

/**
 * Returns the first signature field in this section (the gating sig
 * for the section's owner). null if none — sections without a sig
 * have no clear "owner" so we don't cascade them.
 */
function gatingSignatureFieldId(section: FormSection): string | null {
  for (const f of section.fields) {
    if (f.type === "signature") return f.id;
  }
  return null;
}

/**
 * Same human / same role assigned on both sides? "Same human" is
 * an email match (case-insensitive); "same role" is a role_id match.
 * Mismatched kinds (one user, one role) never count as same.
 */
export function assignmentsMatch(
  a: SignatureAssignment | undefined,
  b: SignatureAssignment | undefined,
): boolean {
  if (!a || !b) return false;
  const aRole = isRoleAssignment(a);
  const bRole = isRoleAssignment(b);
  if (aRole !== bRole) return false;
  if (aRole && bRole) return a.role_id === b.role_id;
  const aEmail = (a as { email?: string }).email?.toLowerCase();
  const bEmail = (b as { email?: string }).email?.toLowerCase();
  return !!aEmail && aEmail === bEmail;
}

/**
 * Best-effort cascade. Caller passes the source row's pre-update
 * state, the request body, and the schema. We compute the diff,
 * group changes by section, and propagate to sibling rows where the
 * section is shared and unsigned.
 */
export async function cascadeFieldChangesToSiblings(args: {
  sb: ServiceClient;
  sourceId: string;
  sourceOrgId: string;
  batchId: string;
  schema: FormDefinition;
  sourceAssignments: SignatureAssignments;
  /** Source row's data after the just-applied save. Reconciliation
   * compares this against each sibling's data field-by-field. */
  newData: Record<string, unknown>;
  actingUserId: string;
  /** Last time this source row was cascaded. When set and within the
   * throttle window, the cascade short-circuits. The next save
   * after the window passes will reconcile against each sibling's
   * actual state, so any accumulated drift from the skipped
   * cascades catches up in one pass. */
  lastCascadeAt?: string | null;
}): Promise<CascadeResult> {
  const {
    sb,
    sourceId,
    sourceOrgId,
    batchId,
    schema,
    sourceAssignments,
    newData,
    actingUserId,
    lastCascadeAt,
  } = args;

  const result: CascadeResult = {
    siblings_updated: 0,
    fields_written: 0,
    skipped: [],
  };

  // Throttle. If we cascaded for this source within the window,
  // skip — the source row was saved (updated_at advances normally);
  // the next save after the throttle window expires will catch up
  // and propagate any accumulated changes in one go.
  if (lastCascadeAt && CASCADE_THROTTLE_SECONDS > 0) {
    const ageMs = Date.now() - new Date(lastCascadeAt).getTime();
    if (ageMs < CASCADE_THROTTLE_SECONDS * 1000) {
      result.throttled = true;
      return result;
    }
  }

  // Build the set of shared-cascadable sections once. A section is
  // cascadable iff it has a signature field and is NOT marked
  // inductee_section. We enumerate the field ids inside each such
  // section so reconciliation compares source vs sibling per-field.
  //
  // Reconciliation (not diff) is important for correctness under
  // the cooldown: if a save is throttled, the diff between old and
  // new on this PATCH would be lost forever. Reconciling against
  // each sibling's actual state guarantees eventual consistency —
  // whenever the cooldown releases, whatever drift exists gets
  // closed, regardless of how many saves were skipped.
  const bySection = new Map<
    string,
    { gatingSigId: string; fieldIds: string[] }
  >();
  for (const sec of schema.sections) {
    if (sec.inductee_section) continue;
    const sigId = gatingSignatureFieldId(sec);
    if (!sigId) continue;
    const fieldIds: string[] = [];
    for (const f of sec.fields) {
      if (f.type === "signature") continue;
      if (f.type === "section_header" || f.type === "divider") continue;
      fieldIds.push(f.id);
    }
    if (fieldIds.length === 0) continue;
    bySection.set(sec.id, { gatingSigId: sigId, fieldIds });
  }
  if (bySection.size === 0) return result;

  // Pull every sibling in the batch (excluding source).
  const { data: sibsRows, error: sibErr } = await sb
    .from("submissions")
    .select("id, status, data, signature_assignments")
    .eq("batch_id", batchId)
    .eq("org_id", sourceOrgId)
    .neq("id", sourceId);
  if (sibErr) throw sibErr;
  const siblings = (sibsRows ?? []) as {
    id: string;
    status: string;
    data: Record<string, unknown> | null;
    signature_assignments: SignatureAssignments | null;
  }[];
  if (siblings.length === 0) return result;

  // Pre-load which gating-sig fields are already signed across all
  // siblings, in one query. Signed sections are immutable — we skip
  // them to preserve signature integrity.
  const allGatingSigIds = Array.from(
    new Set(Array.from(bySection.values()).map((v) => v.gatingSigId)),
  );
  const sibIds = siblings.map((s) => s.id);
  const signedKey = new Set<string>(); // `${submissionId}|${fieldId}`
  if (sibIds.length > 0 && allGatingSigIds.length > 0) {
    const { data: sigRows } = await sb
      .from("submission_signatures")
      .select("submission_id, field_id")
      .in("submission_id", sibIds)
      .in("field_id", allGatingSigIds);
    for (const r of (sigRows ?? []) as {
      submission_id: string;
      field_id: string;
    }[]) {
      signedKey.add(`${r.submission_id}|${r.field_id}`);
    }
  }

  const now = new Date().toISOString();

  for (const sib of siblings) {
    if (sib.status === "completed" || sib.status === "rejected") {
      result.skipped.push({ id: sib.id, reason: sib.status });
      continue;
    }
    const sibAssign = sib.signature_assignments ?? {};
    const sibData = sib.data ?? {};
    const updates: Record<string, unknown> = {};
    for (const [, { gatingSigId, fieldIds }] of bySection) {
      const sourceA = sourceAssignments[gatingSigId];
      const sibA = sibAssign[gatingSigId];
      if (!assignmentsMatch(sourceA, sibA)) continue;
      if (signedKey.has(`${sib.id}|${gatingSigId}`)) continue;
      // Reconciliation: only write the field if the source's
      // current value differs from the sibling's current value.
      // Idempotent — replaying the same cascade is a no-op.
      for (const fid of fieldIds) {
        const sourceVal = newData[fid];
        const sibVal = sibData[fid];
        if (deepEqual(sourceVal, sibVal)) continue;
        updates[fid] = sourceVal;
      }
    }
    if (Object.keys(updates).length === 0) continue;
    const merged = { ...sibData, ...updates };
    const { error: updErr } = await sb
      .from("submissions")
      .update({
        data: merged,
        updated_at: now,
        last_edited_by: actingUserId,
        last_edited_at: now,
      })
      .eq("id", sib.id);
    if (updErr) {
      result.skipped.push({
        id: sib.id,
        reason: `update failed: ${updErr.message}`,
      });
      continue;
    }
    result.siblings_updated++;
    result.fields_written += Object.keys(updates).length;
  }

  // Stamp the source so subsequent saves within the throttle window
  // short-circuit. Done unconditionally (even when 0 siblings got
  // written) so a no-op cascade still counts toward the cooldown —
  // otherwise a "nothing matched" cascade would re-evaluate every
  // 5 seconds for nothing.
  await sb
    .from("submissions")
    .update({ last_cascade_at: now })
    .eq("id", sourceId);

  return result;
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return a == null && b == null;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  if (typeof a === "object" && typeof b === "object") {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return false;
}
