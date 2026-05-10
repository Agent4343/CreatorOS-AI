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
  | { state: "signed_locked"; signerName: string; signedAt: string };

/**
 * Compute the lock state for one section.
 *
 * Looks at the signature fields in the section. If any is signed →
 * the section is locked. If any is assigned to someone, that person
 * owns the section until they sign. Otherwise open.
 *
 * If a section has *multiple* signature fields with different
 * assignees, we lock for everyone except the first unsigned assignee
 * — they should sign first, then the section locks.
 */
export function computeSectionLock(args: {
  section: FormSection;
  signatureAssignments: SignatureAssignments;
  signedFields: { field_id: string; signer_name?: string; signed_at?: string }[];
  currentUserEmail: string;
}): SectionLockState {
  const { section, signatureAssignments, signedFields, currentUserEmail } = args;
  const sigFields = section.fields.filter((f) => f.type === "signature");
  if (sigFields.length === 0) return { state: "open" };

  // Any signed signature in this section → fully locked.
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

  // No signatures signed yet. Look for the first assignment.
  for (const f of sigFields) {
    const a = signatureAssignments[f.id];
    if (!a) continue;
    const me = currentUserEmail.toLowerCase();
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

  // No assignment, no signature → open clipboard.
  return { state: "open" };
}

/** Lock state for every section, indexed by section id. */
export function computeAllSectionLocks(args: {
  schema: FormDefinition;
  signatureAssignments: SignatureAssignments;
  signedFields: { field_id: string; signer_name?: string; signed_at?: string }[];
  currentUserEmail: string;
}): Record<string, SectionLockState> {
  const out: Record<string, SectionLockState> = {};
  for (const section of args.schema.sections) {
    out[section.id] = computeSectionLock({
      section,
      signatureAssignments: args.signatureAssignments,
      signedFields: args.signedFields,
      currentUserEmail: args.currentUserEmail,
    });
  }
  return out;
}

/**
 * Returns true if the given user is allowed to write to fields in
 * the given section. Server-side gate.
 */
export function canWriteSection(state: SectionLockState): boolean {
  return state.state === "open" || state.state === "reserved_for_me";
}
