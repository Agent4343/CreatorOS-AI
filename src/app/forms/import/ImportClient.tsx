"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormDefinition } from "@/lib/types";

type ImportMode = "accurate" | "fast";

export default function ImportClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
  const [mode, setMode] = useState<ImportMode>("accurate");
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<FormDefinition | null>(null);

  async function runImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError("Pick a paper form (PDF or photo) first.");
      return;
    }
    setImporting(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("org_id", orgId);
      fd.append("file", file);
      fd.append("mode", mode);
      if (hint.trim()) fd.append("hint", hint.trim());
      const res = await fetch("/api/forms/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      // Belt-and-braces: if the AI somehow returned a form with no
      // signature field, append a Sign-off section before the user
      // sees it.
      const schema = ensureSignature(data.schema);
      setDraft(schema);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setImporting(false);
    }
  }

  async function save() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, schema: draft }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Save failed");
      // Land in the editor — the import is rarely perfect; the user
      // almost always wants to tweak something before publishing.
      router.push(`/forms/${data.form.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Import a paper form</h1>
        <p className="mt-2 text-muted">
          Drop in a PDF or photo of a paper form. AI converts it to a digital
          form in 15–30 seconds. Review, edit, save.
        </p>
      </div>

      {!draft && (
        <section className="rounded-lg border border-ink/15 bg-white p-5 space-y-4">
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,image/png,image/jpeg,image/webp,image/gif"
            className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-ink file:px-4 file:py-2 file:text-bg"
          />
          <div>
            <label className="block text-sm font-medium">
              Optional context for the AI
            </label>
            <input
              type="text"
              value={hint}
              onChange={(e) => setHint(e.target.value)}
              placeholder="e.g. 'OSHA daily safety inspection for our concrete crew'"
              className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
            />
          </div>

          {/* Mode picker — same UX as a radio group, but full-width
              buttons so the trade-off is readable on a phone. Default
              is Accurate; Fast is for cost-sensitive bulk imports of
              clean PDFs. */}
          <div>
            <label className="block text-sm font-medium">Import mode</label>
            <div className="mt-1.5 grid gap-2 md:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("accurate")}
                className={
                  "flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors " +
                  (mode === "accurate"
                    ? "border-ink bg-ink/5"
                    : "border-ink/20 bg-white")
                }
              >
                <span className="text-sm font-medium">
                  Accurate
                  <span className="ml-2 font-mono text-[10px] text-muted">
                    Opus 4.7
                  </span>
                </span>
                <span className="mt-0.5 text-xs text-muted">
                  Best for phone photos, handwritten markup, faded
                  scans. ~$0.40–$1.50 per import.
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("fast")}
                className={
                  "flex flex-col items-start rounded-md border px-3 py-2 text-left transition-colors " +
                  (mode === "fast"
                    ? "border-ink bg-ink/5"
                    : "border-ink/20 bg-white")
                }
              >
                <span className="text-sm font-medium">
                  Fast
                  <span className="ml-2 font-mono text-[10px] text-muted">
                    Sonnet 4.6 · ~5× cheaper
                  </span>
                </span>
                <span className="mt-0.5 text-xs text-muted">
                  Best for digitally-clean PDFs. ~$0.10–$0.30 per
                  import. Slightly less reliable on bad scans.
                </span>
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={runImport}
            disabled={importing}
            className="rounded-md bg-accent px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
          >
            {importing ? "Reading the form…" : "Import"}
          </button>
          {error && (
            <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
              {error}
            </div>
          )}
        </section>
      )}

      {draft && (
        <section className="space-y-4">
          <div className="rounded-lg border border-ok/30 bg-ok/5 p-4">
            <h2 className="font-bold">{draft.name}</h2>
            {draft.description && (
              <p className="mt-1 text-sm text-muted">{draft.description}</p>
            )}
            <p className="mt-2 font-mono text-xs text-muted">
              {draft.sections.length} sections ·{" "}
              {draft.sections.reduce((n, s) => n + s.fields.length, 0)} fields
            </p>
          </div>

          {draft.sections.map((sec, i) => (
            <div
              key={sec.id}
              className="rounded-lg border border-ink/15 bg-white p-4"
            >
              <h3 className="font-bold">
                Section {i + 1}: {sec.title}
              </h3>
              <ul className="mt-2 space-y-1 font-mono text-xs">
                {sec.fields.map((f) => (
                  <li key={f.id}>
                    <span className="text-accent">[{f.type}]</span> {f.label}
                    {f.required && (
                      <span className="ml-1 text-err">*</span>
                    )}
                    {f.options && (
                      <span className="ml-2 text-muted">
                        ({f.options.join(" · ")})
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save form"}
            </button>
            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setHint("");
                if (fileRef.current) fileRef.current.value = "";
              }}
              className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink"
            >
              Try a different file
            </button>
          </div>

          {error && (
            <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
              {error}
            </div>
          )}

          <p className="text-xs text-muted">
            Save lands you on the form editor — drag/drop fields, change
            types, add or remove signatures, save another version anytime.
          </p>
        </section>
      )}
    </div>
  );
}

/**
 * If the imported schema has zero signature fields, append a Sign-off
 * section with one required signature. The AI prompt explicitly asks
 * for this; this is the safety net for the cases where Claude misses
 * a clearly sign-off-shaped form. A signature-less compliance form is
 * almost never what the user wants, even if the paper is technically
 * unsigned.
 */
function ensureSignature(schema: FormDefinition): FormDefinition {
  const hasSig = schema.sections.some((s) =>
    s.fields.some((f) => f.type === "signature"),
  );
  if (hasSig) return schema;
  return {
    ...schema,
    sections: [
      ...schema.sections,
      {
        id: `s_signoff_${Date.now()}`,
        title: "Sign-off",
        fields: [
          {
            id: `f_signature_${Date.now()}`,
            type: "signature",
            label: "Signature",
            required: true,
          },
        ],
      },
    ],
  };
}
