import {
  type FormDefinition,
  type FormSection,
  type SignatureAssignments,
  assigneeEmails,
  assigneeLabel,
  isRoleAssignment,
} from "./types";

export type SectionLockState =
  /** Open: no signer assignment in this section (or signature is open).
   * Anyone in the org can edit. Legacy behavior. */
  | { state: "open" }
  /** This section has a signature assigned to *someone else* (or to
   * a role I'm not in) and the signature has not yet landed. They
   * have exclusive write access. */
  | {
      state: "reserved_for_other";
      /** "Brad (OIM)" or "Any Heli admin" — render-ready. */
      assigneeLabel: string;
      /** True when assigned to a role rather than a specific person. */
      assignedToRole: boolean;
    }
  /** Assigned to me (directly or via role membership) and not yet
   * signed — I can edit. */
  | {
      state: "reserved_for_me";
      assigneeLabel: string;
      assignedToRole: boolean;
    }
  /** Signature in this section has been signed → section is frozen
   * for everyone, including the signer. The data hash binds the
   * submission state at sign time; allowing later edits would
   * silently break tamper-evidence. */
  | { state: "signed_locked"; signerName: string; signedAt: string }
  /** Section-level required role: the template restricts edit + sign
   * to members of a specific role and the current user isn't one. */
  | { state: "role_required"; requiredRoleName: string }
  /** Section is marked inductee_section and the current user's email
   * isn't the inductee assigned to this submission. */
  | { state: "inductee_required"; inducteeEmail: string | null }
  /** An earlier section with signatures hasn't been signed yet, so
   * this section is held closed until the prior step completes.
   * Sequential workflow gate — Heli admin → OIM → Supervisor →
   * Inductee runs in order, not in parallel. */
  | {
      state: "waiting_prior";
      priorSectionTitle: string;
      priorSectionIndex: number;
    };

/**
 * Derive the inductee's email for a submission by looking at the
 * first signature field inside the section marked
 * inductee_section: true and pulling out that field's assignment.
 * Returns null if no inductee section is defined, no signature in it,
 * or no assignment yet (e.g. legacy submission started before the
 * inductee flow existed).
 */
export function inducteeEmailFromSubmission(
  schema: FormDefinition,
  signatureAssignments: SignatureAssignments,
): string | null {
  for (const section of schema.sections) {
    if (!section.inductee_section) continue;
    for (const f of section.fields) {
      if (f.type !== "signature") continue;
      const a = signatureAssignments[f.id];
      if (!a || isRoleAssignment(a)) continue;
      const email = (a as { email?: string }).email;
      if (email) return email.toLowerCase();
    }
  }
  return null;
}

/**
 * True if some section before `index` has signature fields and at
 * least one of them isn't signed yet. The sequential workflow gate.
 * Sections with no signatures are skipped — they don't represent an
 * approval step.
 */
function isPriorStepIncomplete(
  sections: FormSection[],
  index: number,
  signedFields: { field_id: string }[],
): { priorTitle: string; priorIndex: number } | null {
  const signedIds = new Set(signedFields.map((s) => s.field_id));
  for (let i = 0; i < index; i++) {
    const sigs = sections[i].fields.filter((f) => f.type === "signature");
    if (sigs.length === 0) continue;
    const allSigned = sigs.every((f) => signedIds.has(f.id));
    if (!allSigned) {
      return { priorTitle: sections[i].title, priorIndex: i };
    }
  }
  return null;
}

/**
 * Compute the lock state for one section.
 *
 * Evaluation order (first match wins):
 *   1. Signed already → signed_locked (immutable, for everyone)
 *   2. Prior step not signed → waiting_prior (sequential gate)
 *   3. Section role required and user not in it → role_required
 *   4. Inductee section and user isn't the inductee → inductee_required
 *   5. Signature in section assigned to someone else → reserved_for_other
 *   6. Signature in section assigned to me → reserved_for_me
 *   7. Otherwise → open
 */
export function computeSectionLock(args: {
  section: FormSection;
  signatureAssignments: SignatureAssignments;
  signedFields: { field_id: string; signer_name?: string; signed_at?: string }[];
  currentUserEmail: string;
  /** All sections in declaration order — needed for the sequential
   * gate. If omitted, sequential gating is skipped (legacy callers). */
  allSections?: FormSection[];
  /** Index of `section` within allSections. Required when
   * allSections is set. */
  sectionIndex?: number;
  /** Set of role IDs the current user is a member of in this org.
   * Used to evaluate section.required_role_id. */
  userRoleIds?: Set<string>;
  /** Lookup from role_id → human role name, for error messages. */
  roleNameById?: Map<string, string>;
  /** Email of the inductee for this submission, if any.
   * Compare against currentUserEmail to gate inductee sections. */
  inducteeEmail?: string | null;
}): SectionLockState {
  const {
    section,
    signatureAssignments,
    signedFields,
    currentUserEmail,
    allSections,
    sectionIndex,
    userRoleIds,
    roleNameById,
    inducteeEmail,
  } = args;
  const sigFields = section.fields.filter((f) => f.type === "signature");
  const me = currentUserEmail.toLowerCase();

  // 1. Already signed → frozen for everyone.
  for (const f of sigFields) {
    const sig = signedFields.find((s) => s.field_id === f.id);
    if (sig) {
      return {
        state: "signed_locked",
        signerName: sig.signer_name ?? "—",
        signedAt: sig.signed_at ?? "",
      };
    }
  }

  // 2. Sequential gate — earlier section's signatures still pending.
  if (allSections && typeof sectionIndex === "number") {
    const prior = isPriorStepIncomplete(allSections, sectionIndex, signedFields);
    if (prior) {
      return {
        state: "waiting_prior",
        priorSectionTitle: prior.priorTitle,
        priorSectionIndex: prior.priorIndex,
      };
    }
  }

  // 3. Section-level required role.
  if (section.required_role_id) {
    if (!userRoleIds || !userRoleIds.has(section.required_role_id)) {
      const name =
        roleNameById?.get(section.required_role_id) ?? "required role";
      return { state: "role_required", requiredRoleName: name };
    }
  }

  // 4. Inductee-only section.
  if (section.inductee_section) {
    if (!inducteeEmail || inducteeEmail.toLowerCase() !== me) {
      return { state: "inductee_required", inducteeEmail: inducteeEmail ?? null };
    }
  }

  // 5/6. Existing per-signature assignment logic.
  for (const f of sigFields) {
    const a = signatureAssignments[f.id];
    if (!a) continue;
    const allowed = assigneeEmails(a);
    const assignedToRole = isRoleAssignment(a);
    if (allowed.includes(me)) {
      return {
        state: "reserved_for_me",
        assigneeLabel: assigneeLabel(a),
        assignedToRole,
      };
    }
    return {
      state: "reserved_for_other",
      assigneeLabel: assigneeLabel(a),
      assignedToRole,
    };
  }

  // 7. No restrictions.
  return { state: "open" };
}

/** Lock state for every section, indexed by section id. */
export function computeAllSectionLocks(args: {
  schema: FormDefinition;
  signatureAssignments: SignatureAssignments;
  signedFields: { field_id: string; signer_name?: string; signed_at?: string }[];
  currentUserEmail: string;
  userRoleIds?: Set<string>;
  roleNameById?: Map<string, string>;
  inducteeEmail?: string | null;
}): Record<string, SectionLockState> {
  const out: Record<string, SectionLockState> = {};
  args.schema.sections.forEach((section, idx) => {
    out[section.id] = computeSectionLock({
      section,
      signatureAssignments: args.signatureAssignments,
      signedFields: args.signedFields,
      currentUserEmail: args.currentUserEmail,
      allSections: args.schema.sections,
      sectionIndex: idx,
      userRoleIds: args.userRoleIds,
      roleNameById: args.roleNameById,
      inducteeEmail: args.inducteeEmail,
    });
  });
  return out;
}

/**
 * Returns true if the given user is allowed to write to fields in
 * the given section. Server-side gate.
 */
export function canWriteSection(state: SectionLockState): boolean {
  return state.state === "open" || state.state === "reserved_for_me";
}
