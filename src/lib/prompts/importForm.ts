import type Anthropic from "@anthropic-ai/sdk";
import { client, MODEL } from "../anthropic";
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
    name: { type: "string", minLength: 1, maxLength: 200 },
    description: { type: "string", maxLength: 2000 },
    sections: {
      type: "array",
      minItems: 1,
      items: {
        type: "object",
        properties: {
          id: { type: "string", minLength: 1 },
          title: { type: "string" },
          description: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string", minLength: 1 },
                type: { type: "string", enum: [...FIELD_TYPES] },
                label: { type: "string" },
                description: { type: "string" },
                required: { type: "boolean" },
                options: { type: "array", items: { type: "string" } },
                multiple: { type: "boolean" },
                max: { type: "integer", minimum: 1 },
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

/**
 * @param image  Base64-encoded data of the paper form image or PDF.
 * @param mediaType  e.g. "image/png", "image/jpeg", "application/pdf".
 * @param userHint  Optional one-liner context from the uploader.
 */
export async function importPaperForm(args: {
  image: string;
  mediaType: "image/png" | "image/jpeg" | "image/gif" | "image/webp" | "application/pdf";
  userHint?: string;
}): Promise<FormDefinition> {
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

  const response = await client().messages.create({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: RESPONSE_SCHEMA },
    },
    system: SYSTEM,
    messages: [{ role: "user", content: sourceBlocks }],
  });

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Import returned no text block");
  }
  return FormDefinitionSchema.parse(JSON.parse(text.text));
}
