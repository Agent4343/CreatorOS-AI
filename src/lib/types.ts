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
