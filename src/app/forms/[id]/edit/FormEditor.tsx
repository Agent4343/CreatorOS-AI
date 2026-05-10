"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  FIELD_TYPES,
  FieldType,
  Form,
  FormDefinition,
  FormField,
  FormSection,
} from "@/lib/types";

type DraftField = FormField;
type DraftSection = FormSection;
type Draft = FormDefinition;

const DEFAULT_FIELD_LABEL: Record<FieldType, string> = {
  text: "Text answer",
  textarea: "Long text answer",
  number: "Number",
  date: "Date",
  datetime: "Date and time",
  dropdown: "Select one",
  multi_select: "Select many",
  checkbox: "Yes / no",
  radio: "Pick one",
  photo: "Photo",
  signature: "Signature",
  gps: "Site location",
  timestamp: "Timestamp",
  section_header: "Section heading",
  divider: "Divider",
};

export default function FormEditor({ form }: { form: Form }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(form.schema);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);

  const dirty = JSON.stringify(draft) !== JSON.stringify(form.schema);

  function update<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function updateSection(idx: number, patch: Partial<DraftSection>) {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)),
    }));
  }

  function moveSection(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= draft.sections.length) return;
    setDraft((d) => {
      const next = [...d.sections];
      [next[idx], next[target]] = [next[target], next[idx]];
      return { ...d, sections: next };
    });
  }

  function addSection() {
    setDraft((d) => ({
      ...d,
      sections: [
        ...d.sections,
        {
          id: `s_${Date.now()}`,
          title: "New section",
          fields: [],
        },
      ],
    }));
  }

  /**
   * Convenience for the most common pattern: a final section with a
   * required signature. Saves four clicks vs. add section → name it →
   * add field → pick signature → mark required.
   */
  function addSignoffSection() {
    const ts = Date.now();
    setDraft((d) => ({
      ...d,
      sections: [
        ...d.sections,
        {
          id: `s_signoff_${ts}`,
          title: "Sign-off",
          fields: [
            {
              id: `f_signature_${ts}`,
              type: "signature",
              label: "Signature",
              required: true,
            },
          ],
        },
      ],
    }));
  }

  function deleteSection(idx: number) {
    if (draft.sections.length <= 1) return;
    setDraft((d) => ({
      ...d,
      sections: d.sections.filter((_, i) => i !== idx),
    }));
  }

  function updateField(
    sIdx: number,
    fIdx: number,
    patch: Partial<DraftField>,
  ) {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i !== sIdx
          ? s
          : { ...s, fields: s.fields.map((f, j) => (j === fIdx ? { ...f, ...patch } : f)) },
      ),
    }));
  }

  function moveField(sIdx: number, fIdx: number, dir: -1 | 1) {
    const target = fIdx + dir;
    setDraft((d) => {
      const sec = d.sections[sIdx];
      if (target < 0 || target >= sec.fields.length) return d;
      const fields = [...sec.fields];
      [fields[fIdx], fields[target]] = [fields[target], fields[fIdx]];
      return {
        ...d,
        sections: d.sections.map((s, i) => (i === sIdx ? { ...s, fields } : s)),
      };
    });
  }

  function addField(sIdx: number, type: FieldType) {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i !== sIdx
          ? s
          : {
              ...s,
              fields: [
                ...s.fields,
                {
                  id: `f_${Date.now()}`,
                  type,
                  label: DEFAULT_FIELD_LABEL[type],
                  ...(type === "dropdown" || type === "multi_select" || type === "radio"
                    ? { options: ["Option 1", "Option 2"] }
                    : {}),
                  ...(type === "signature" ? { required: true } : {}),
                },
              ],
            },
      ),
    }));
  }

  function deleteField(sIdx: number, fIdx: number) {
    setDraft((d) => ({
      ...d,
      sections: d.sections.map((s, i) =>
        i !== sIdx ? s : { ...s, fields: s.fields.filter((_, j) => j !== fIdx) },
      ),
    }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/forms/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: draft }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setSavedVersion(body.version);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <a href={`/forms/${form.id}`} className="font-mono text-xs">
            ← back to form
          </a>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">Edit form</h1>
          <p className="font-mono text-xs text-muted">
            Currently v{form.current_version}
            {savedVersion && (
              <span className="text-ok"> · saved as v{savedVersion}</span>
            )}
          </p>
        </div>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
        >
          {saving ? "Saving…" : dirty ? "Save changes" : "No changes"}
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
          {error}
        </div>
      )}

      <section className="rounded-lg border border-ink/15 bg-white p-4 space-y-3">
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
            Form name
          </label>
          <input
            value={draft.name}
            onChange={(e) => update("name", e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs font-semibold uppercase tracking-wider text-muted">
            Description (optional)
          </label>
          <textarea
            rows={2}
            value={draft.description ?? ""}
            onChange={(e) => update("description", e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
          />
        </div>
      </section>

      {draft.sections.map((sec, sIdx) => (
        <section
          key={sec.id}
          className="rounded-lg border border-ink/15 bg-white p-4 space-y-3"
        >
          <div className="flex items-baseline justify-between">
            <div className="flex-1">
              <input
                value={sec.title}
                onChange={(e) => updateSection(sIdx, { title: e.target.value })}
                className="w-full rounded-md border border-ink/20 bg-white p-2 text-base font-bold"
              />
            </div>
            <div className="ml-2 flex gap-1">
              <button
                onClick={() => moveSection(sIdx, -1)}
                disabled={sIdx === 0}
                className="rounded-md border border-ink/20 px-2 py-1 text-xs disabled:opacity-30"
                aria-label="Move section up"
              >
                ↑
              </button>
              <button
                onClick={() => moveSection(sIdx, 1)}
                disabled={sIdx === draft.sections.length - 1}
                className="rounded-md border border-ink/20 px-2 py-1 text-xs disabled:opacity-30"
                aria-label="Move section down"
              >
                ↓
              </button>
              <button
                onClick={() => deleteSection(sIdx)}
                disabled={draft.sections.length <= 1}
                className="rounded-md border border-err/30 px-2 py-1 text-xs text-err disabled:opacity-30"
              >
                delete section
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {sec.fields.map((f, fIdx) => (
              <FieldEditor
                key={f.id}
                field={f}
                onChange={(patch) => updateField(sIdx, fIdx, patch)}
                onDelete={() => deleteField(sIdx, fIdx)}
                onMove={(dir) => moveField(sIdx, fIdx, dir)}
                isFirst={fIdx === 0}
                isLast={fIdx === sec.fields.length - 1}
              />
            ))}
          </div>

          <div className="space-y-2 border-t border-ink/10 pt-3">
            {/* Most-common adds first, full-size and labeled. */}
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => addField(sIdx, "signature")}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-bg hover:opacity-90"
              >
                + Signature
              </button>
              <button
                onClick={() => addField(sIdx, "text")}
                className="rounded-md border border-ink/30 px-3 py-1.5 text-xs text-ink hover:border-ink/60"
              >
                + Text
              </button>
              <button
                onClick={() => addField(sIdx, "checkbox")}
                className="rounded-md border border-ink/30 px-3 py-1.5 text-xs text-ink hover:border-ink/60"
              >
                + Checkbox
              </button>
              <button
                onClick={() => addField(sIdx, "photo")}
                className="rounded-md border border-ink/30 px-3 py-1.5 text-xs text-ink hover:border-ink/60"
              >
                + Photo
              </button>
              <button
                onClick={() => addField(sIdx, "date")}
                className="rounded-md border border-ink/30 px-3 py-1.5 text-xs text-ink hover:border-ink/60"
              >
                + Date
              </button>
              <button
                onClick={() => addField(sIdx, "dropdown")}
                className="rounded-md border border-ink/30 px-3 py-1.5 text-xs text-ink hover:border-ink/60"
              >
                + Dropdown
              </button>
            </div>
            {/* Full type list, smaller, for the long tail. */}
            <details>
              <summary className="cursor-pointer text-[11px] font-semibold uppercase tracking-wider text-muted">
                More field types
              </summary>
              <div className="mt-2 flex flex-wrap gap-1">
                {FIELD_TYPES.filter(
                  (t) =>
                    !["signature", "text", "checkbox", "photo", "date", "dropdown"].includes(t),
                ).map((t) => (
                  <button
                    key={t}
                    onClick={() => addField(sIdx, t)}
                    className="rounded-md border border-ink/20 px-2 py-1 text-[11px] text-ink hover:border-accent"
                  >
                    + {t}
                  </button>
                ))}
              </div>
            </details>
          </div>
        </section>
      ))}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={addSection}
          className="rounded-md border border-dashed border-ink/30 px-4 py-3 text-sm text-muted hover:border-ink/60"
        >
          + Add section
        </button>
        <button
          onClick={addSignoffSection}
          className="rounded-md border border-dashed border-accent/50 px-4 py-3 text-sm text-accent hover:border-accent"
        >
          + Add Sign-off section (signature included)
        </button>
      </div>
    </div>
  );
}

function FieldEditor({
  field,
  onChange,
  onDelete,
  onMove,
  isFirst,
  isLast,
}: {
  field: FormField;
  onChange: (patch: Partial<FormField>) => void;
  onDelete: () => void;
  onMove: (dir: -1 | 1) => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const hasOptions =
    field.type === "dropdown" ||
    field.type === "multi_select" ||
    field.type === "radio";

  return (
    <div className="rounded-md border border-ink/10 bg-bg p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={field.type}
          onChange={(e) =>
            onChange({ type: e.target.value as FieldType })
          }
          className="rounded-md border border-ink/20 bg-white px-2 py-1 font-mono text-xs"
        >
          {FIELD_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <input
          value={field.label}
          onChange={(e) => onChange({ label: e.target.value })}
          placeholder="Field label"
          className="flex-1 min-w-[200px] rounded-md border border-ink/20 bg-white p-1.5 text-sm"
        />
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={!!field.required}
            onChange={(e) => onChange({ required: e.target.checked })}
          />
          required
        </label>
        <button
          onClick={() => onMove(-1)}
          disabled={isFirst}
          className="rounded-md border border-ink/20 px-2 py-1 text-xs disabled:opacity-30"
        >
          ↑
        </button>
        <button
          onClick={() => onMove(1)}
          disabled={isLast}
          className="rounded-md border border-ink/20 px-2 py-1 text-xs disabled:opacity-30"
        >
          ↓
        </button>
        <button
          onClick={onDelete}
          className="rounded-md border border-err/30 px-2 py-1 text-xs text-err"
        >
          ✕
        </button>
      </div>

      {field.description !== undefined && field.description !== "" && (
        <input
          value={field.description}
          onChange={(e) => onChange({ description: e.target.value })}
          placeholder="Help text (optional)"
          className="w-full rounded-md border border-ink/20 bg-white p-1.5 text-xs"
        />
      )}

      {hasOptions && (
        <OptionsEditor
          options={field.options ?? []}
          onChange={(options) => onChange({ options })}
        />
      )}

      {field.type === "signature" && (
        <input
          value={field.signer_role ?? ""}
          onChange={(e) =>
            onChange({ signer_role: e.target.value || undefined })
          }
          placeholder="Signer role (e.g. 'foreman') — optional"
          className="w-full rounded-md border border-ink/20 bg-white p-1.5 text-xs"
        />
      )}
    </div>
  );
}

function OptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (next: string[]) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted">
        Options
      </div>
      {options.map((opt, i) => (
        <div key={i} className="flex gap-1">
          <input
            value={opt}
            onChange={(e) =>
              onChange(options.map((o, j) => (j === i ? e.target.value : o)))
            }
            className="flex-1 rounded-md border border-ink/20 bg-white p-1.5 text-xs"
          />
          <button
            type="button"
            onClick={() => onChange(options.filter((_, j) => j !== i))}
            className="rounded-md border border-err/30 px-2 py-1 text-xs text-err"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...options, `Option ${options.length + 1}`])}
        className="text-xs text-accent underline"
      >
        + add option
      </button>
    </div>
  );
}
