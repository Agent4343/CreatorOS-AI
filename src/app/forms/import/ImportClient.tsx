"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { FormDefinition } from "@/lib/types";

export default function ImportClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [hint, setHint] = useState("");
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
      if (hint.trim()) fd.append("hint", hint.trim());
      const res = await fetch("/api/forms/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Import failed");
      setDraft(data.schema);
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
      router.push(`/forms/${data.form.id}`);
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
        <section className="rounded-lg border border-ink/15 bg-white p-5 space-y-3">
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
            For this MVP we save the schema as-is. The full editor (drag-drop
            field reorder, type changes, conditional logic) is the next layer
            on top — for now you can delete the form and re-import if the
            schema needs changes.
          </p>
        </section>
      )}
    </div>
  );
}
