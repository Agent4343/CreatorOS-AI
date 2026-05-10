import { z } from "zod";

// ============================================================
// Form schema — the JSON shape every form is stored as
// ============================================================

export const FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "datetime",
  "dropdown",
  "multi_select",
  "checkbox",
  "radio",
  "photo",
  "signature",
  "gps",
  "timestamp",
  "section_header",
  "divider",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export const FormFieldSchema: z.ZodType<FormField> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    type: z.enum(FIELD_TYPES),
    label: z.string(),
    description: z.string().optional(),
    required: z.boolean().optional(),
    /** Options for dropdown / multi_select / radio. */
    options: z.array(z.string()).optional(),
    /** photo / multi_select. */
    multiple: z.boolean().optional(),
    /** photo upload max count. */
    max: z.number().int().positive().optional(),
    /** Default value. "today" / "now" handled at render time. */
    default: z.union([z.string(), z.number(), z.boolean()]).optional(),
    /** Auto-capture (gps, timestamp). */
    auto: z.boolean().optional(),
    /** For signature fields, who is expected to sign. */
    signer_role: z.string().optional(),
    /** For signature fields: required-role gate. If set, only members
     * of this org role can sign this field — enforced at sign time
     * regardless of who the assignment names. UUID of an org role.
     * Unset = no role restriction (legacy / inductee fields). */
    required_role_id: z.string().uuid().optional(),
    /** Display-only fields. */
    placeholder: z.string().optional(),
  }),
);

export type FormField = {
  id: string;
  type: FieldType;
  label: string;
  description?: string;
  required?: boolean;
  options?: string[];
  multiple?: boolean;
  max?: number;
  default?: string | number | boolean;
  auto?: boolean;
  signer_role?: string;
  required_role_id?: string;
  placeholder?: string;
};

export const FormSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().optional(),
  fields: z.array(FormFieldSchema),
});
export type FormSection = z.infer<typeof FormSectionSchema>;

export const FormDefinitionSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sections: z.array(FormSectionSchema).min(1),
});
export type FormDefinition = z.infer<typeof FormDefinitionSchema>;

// ============================================================
// DB row shapes (loosely typed — Supabase generic schema)
// ============================================================

export type Org = {
  id: string;
  name: string;
  plan: "trial" | "starter" | "pro" | "enterprise";
  trial_ends_at: string | null;
  created_at: string;
};

export type OrgRole = "owner" | "admin" | "member" | "viewer";

export type Membership = {
  id: string;
  org_id: string;
  user_id: string;
  role: OrgRole;
  full_name: string | null;
  created_at: string;
};

export type Form = {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  schema: FormDefinition;
  current_version: number;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SubmissionStatus =
  | "in_progress"
  | "awaiting_signature"
  | "completed"
  | "rejected";

/**
 * Per-field signature assignment, one of two shapes:
 *
 * 1) A specific person (legacy + ad-hoc batches):
 *      { email, name?, role? }
 *
 * 2) A role roster — any member of the role can sign (the common
 *    case for offshore work where 'Heli admin' is a position, not
 *    a person):
 *      { kind: "role", role_id, role_label, member_emails, member_names }
 *
 * The `kind: "role"` discriminator is required for shape (2). Shape
 * (1) has no `kind` (or `kind: "user"`). Code that doesn't yet know
 * about roles still works with shape (1) rows.
 */
export type SignatureAssignment =
  | {
      kind?: "user";
      /** Email of the person this signature is assigned to. The sign
       * route refuses signatures from anyone else. */
      email: string;
      /** Display name (e.g. "Brad") shown in the runner + emails. */
      name?: string;
      /** Role label (e.g. "OIM", "Supervisor") shown in the inbox. */
      role?: string;
    }
  | {
      kind: "role";
      /** UUID of the org_roles row this assignment was snapshotted from. */
      role_id: string;
      /** Display label (e.g. "Heli admin") for UI + emails. */
      role_label: string;
      /** Snapshot of the role's member emails at batch-start time.
       * Sign-route checks `signer.email IN member_emails`. */
      member_emails: string[];
      /** Optional display names keyed by lowercased email. */
      member_names?: Record<string, string>;
    };

export type SignatureAssignments = Record<string, SignatureAssignment>;

/** Helper: true if the assignment is a role-based one. */
export function isRoleAssignment(
  a: SignatureAssignment | undefined,
): a is Extract<SignatureAssignment, { kind: "role" }> {
  return !!a && (a as { kind?: string }).kind === "role";
}

/** Returns the lowercased emails that can sign this assignment. */
export function assigneeEmails(a: SignatureAssignment): string[] {
  if (isRoleAssignment(a)) return a.member_emails.map((e) => e.toLowerCase());
  return a.email ? [a.email.toLowerCase()] : [];
}

/** A short label for the assignee — "Brad (OIM)" or "Any Heli admin". */
export function assigneeLabel(a: SignatureAssignment): string {
  if (isRoleAssignment(a)) return `Any ${a.role_label}`;
  const role = a.role ? ` (${a.role})` : "";
  return `${a.name ?? a.email}${role}`;
}

export type Submission = {
  id: string;
  org_id: string;
  form_id: string;
  form_version_id: string;
  status: SubmissionStatus;
  data: Record<string, unknown>;
  started_by: string;
  last_edited_by: string | null;
  last_edited_at: string | null;
  /** Set when the submission was created as part of a batch. All
   * submissions in the same batch share this UUID. */
  batch_id: string | null;
  /** Maps signature field_id → assigned signer. Empty for legacy
   * "anyone can sign" submissions. */
  signature_assignments: SignatureAssignments;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type SignatureRow = {
  id: string;
  submission_id: string;
  org_id: string;
  field_id: string;
  signer_user_id: string;
  signer_name: string;
  signer_email: string;
  signature_image: string;
  signed_at: string;
  ip_address: string | null;
  user_agent: string | null;
  geolocation: { lat: number; lng: number; accuracy?: number } | null;
  data_hash: string;
};

export type AuditLog = {
  id: string;
  org_id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};
