"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Tiny "new blank form" page. The full editor lives at /forms/[id]/edit
 * — this page just creates the form row with a sensible empty schema
 * and bounces the user there.
 */
export default function NewBlankClient({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (name.trim().length < 1) return;
    setLoading(true);
    setError(null);
    try {
      // Default schema: one section with one text field. The user can
      // add more in the editor immediately.
      const schema = {
        name: name.trim(),
        description: description.trim() || undefined,
        sections: [
          {
            id: `s_${Date.now()}`,
            title: "Section 1",
            fields: [
              {
                id: `f_${Date.now()}`,
                type: "text",
                label: "First field",
              },
            ],
          },
        ],
      };

      const res = await fetch("/api/forms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, schema }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/forms/${data.form.id}/edit`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <a href="/forms" className="font-mono text-xs">
          ← back to forms
        </a>
        <h1 className="mt-2 text-3xl font-bold tracking-tight">New blank form</h1>
        <p className="mt-1 text-sm text-muted">
          Most users find it faster to <a href="/forms/import">import a paper form</a>{" "}
          and let the AI build the schema. Use this for forms you want to design
          from scratch.
        </p>
      </div>

      <div>
        <label className="block text-sm font-medium">Form name</label>
        <input
          required
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Daily site safety inspection"
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">Description (optional)</label>
        <textarea
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What this form is for"
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
        />
      </div>

      <button
        onClick={create}
        disabled={loading || name.trim().length < 1}
        className="w-full rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
      >
        {loading ? "Creating…" : "Create and open editor"}
      </button>

      {error && (
        <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
          {error}
        </div>
      )}
    </div>
  );
}
