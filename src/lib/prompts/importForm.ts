import type Anthropic from "@anthropic-ai/sdk";
import { client, MODEL, MODEL_FAST } from "../anthropic";
import { FIELD_TYPES, FormDefinition, FormDefinitionSchema } from "../types";

/**
 * Paper-to-digital form import. Reads an image or PDF of a paper
 * form/checklist and produces a structured FormDefinition the user
 * can review and tune in the builder.
 *
 * This is the wedge of the product (BIBLE §3). Quality of this
 * function's output determines whether onboarding takes 30 minutes
 * or three weeks. Iterate this prompt aggressively.
 */

const SYSTEM = `You are a form-digitization assistant. You read a photo or scan of a paper form, checklist, or inspection sheet, and produce a structured digital form schema that captures every field on the paper.

Your output drives an industrial / field-work app. Workers will fill out your output on phone or tablet. Be conservative — preserve every field on the paper, in the order it appears, and infer the right field type for each.

FIELD TYPES YOU CAN USE
- text — single line free-form (names, addresses, descriptions ≤80 chars)
- textarea — multi-line free-form (notes, observations, longer descriptions)
- number — numeric (counts, measurements, gauge readings)
- date — date only (e.g. "Date inspected:")
- datetime — date and time
- dropdown — single-select from a list (when paper has checkboxes for "one of these")
- multi_select — multi-select from a list
- checkbox — single yes/no toggle (use this for "[ ] OK" rows, individual yes/no items)
- radio — single-select with all options visible
- photo — upload one or more photos (use whenever the paper says "attach photo" or "photo of damage")
- signature — captured signature (use for any "Signature:" line, including printed-name + signature pairs — generate a separate text field for "Printed name" and a signature field for "Signature")
- gps — auto-captured GPS location (only when the paper explicitly asks for "Site location" / "GPS coordinates" / lat-lng)
- timestamp — auto-captured (only when the paper asks for "Time of inspection")
- section_header — a non-input header that visually separates groups
- divider — a visual separator (rare, prefer section_header)

INFER WELL
- "Date: ____" → date
- "Inspector signature: ____" → signature, with signer_role: "inspector"
- "Time started: ____" → text or datetime depending on context
- "[ ] Pass [ ] Fail" → radio with options ["Pass", "Fail"]
- Multiple [ ] items in a vertical list, each independently checkable → one checkbox per item
- "Notes:" with multiple lines of empty space → textarea
- Numbered field lines → keep order; use the number in the label if helpful

GROUP INTO SECTIONS
Detect natural sections in the paper (header info, body, sign-off). Output sections like "Site information", "Inspection items", "Hazards", "Sign-off", etc. If the paper has section headings, use them verbatim.

REQUIRED FIELDS
Mark required when:
- The paper has an asterisk, "(required)", or bold-marked label
- The field is a signature field
- It's the date / inspector name (always required for compliance)
- The form is meaningless without it

SIGNATURES — non-negotiable
Field-work and compliance forms always need at least one signature.
- If the paper has any "Signature:", "Signed by:", "Inspector:", "Reviewed by:" line → add a signature field with appropriate signer_role.
- If the paper has multiple sign-off lines for different roles (e.g. "Foreman:" and "Safety officer:") → one signature field per role.
- If the paper looks like an inspection / checklist / service ticket but has NO visible signature line → add a "Sign-off" section at the end with one required signature field labeled "Signature" and signer_role of the most likely role (e.g. "inspector" for inspections, "technician" for service tickets).
- ALL signature fields must have required: true.

NAMING
- Field IDs: snake_case derived from the label (e.g. "site_name").
- Form name: use the paper's actual title verbatim if visible. Otherwise infer.

DO NOT
- Invent fields the paper doesn't have.
- Skip fields that look incidental — preserve checkboxes, initials columns, every line.
- Collapse multiple distinct items into one multi-line text field.
- Output gps or timestamp unless the paper explicitly calls for them.

Return JSON only, matching the schema.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    description: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          title: { type: "string" },
          description: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                type: { type: "string", enum: [...FIELD_TYPES] },
                label: { type: "string" },
                description: { type: "string" },
                required: { type: "boolean" },
                options: { type: "array", items: { type: "string" } },
                multiple: { type: "boolean" },
                // Note: numeric / string / array constraints (minimum,
                // maxLength, minItems, etc.) are unsupported by Claude's
                // structured-output schema. We let the model produce the
                // shape; zod validates the constraints on parse below.
                max: { type: "integer" },
                signer_role: { type: "string" },
                placeholder: { type: "string" },
              },
              required: ["id", "type", "label"],
              additionalProperties: false,
            },
          },
        },
        required: ["id", "title", "fields"],
        additionalProperties: false,
      },
    },
  },
  required: ["name", "sections"],
  additionalProperties: false,
};

type ContentBlock = Anthropic.ContentBlockParam;

export type ImportMode = "accurate" | "fast";

export type ImportUsage = {
  model: string;
  mode: ImportMode;
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

export type ImportResult = {
  schema: FormDefinition;
  usage: ImportUsage;
};

/**
 * @param image     Base64-encoded data of the paper form image or PDF.
 * @param mediaType e.g. "image/png", "image/jpeg", "application/pdf".
 * @param userHint  Optional one-liner context from the uploader.
 * @param mode      "accurate" (Opus 4.7, default) or "fast" (Sonnet 4.6).
 *                  Sonnet is ~5× cheaper and noticeably faster; the
 *                  accuracy gap is small for digitally-clean PDFs and
 *                  larger for handwritten / poorly-lit phone photos.
 */
export async function importPaperForm(args: {
  image: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf";
  userHint?: string;
  mode?: ImportMode;
}): Promise<ImportResult> {
  const mode: ImportMode = args.mode ?? "accurate";
  const model = mode === "fast" ? MODEL_FAST : MODEL;

  const userText = args.userHint
    ? `# Context from the uploader\n\n${args.userHint}\n\nProduce the form schema now. JSON only.`
    : `Produce the form schema now. JSON only.`;

  const sourceBlocks: ContentBlock[] =
    args.mediaType === "application/pdf"
      ? [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: args.image,
            },
          },
          { type: "text", text: userText },
        ]
      : [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: args.mediaType,
              data: args.image,
            },
          },
          { type: "text", text: userText },
        ];

  // System prompt is the same on every import — mark it for caching so
  // repeated calls in the same 5-min window only pay full price for the
  // image. Cache write costs ~1.25×; reads ~0.1×. Below the model's
  // minimum cacheable prefix the marker is silently a no-op (no error,
  // no effect). The system prompt + schema instructions trend toward
  // the threshold as we iterate the prompt, so set this up once.
  const response = await client().messages.create({
    model,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
    system: [
      {
        type: "text",
        text: SYSTEM,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: sourceBlocks }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Import returned no text block");
  }
  const schema = FormDefinitionSchema.parse(JSON.parse(text.text));

  const u = response.usage;
  return {
    schema,
    usage: {
      model,
      mode,
      input_tokens: u.input_tokens ?? 0,
      output_tokens: u.output_tokens ?? 0,
      cache_read_input_tokens: u.cache_read_input_tokens ?? 0,
      cache_creation_input_tokens: u.cache_creation_input_tokens ?? 0,
    },
  };
}
