"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  FormDefinition,
  FormField,
  SignatureAssignments,
} from "@/lib/types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Inductee = { name: string; email: string };

/**
 * "Start a batch" — create N submissions in one go, with role-based
 * signature assignment so the form auto-routes through Heli admin →
 * OIM → Supervisor → Inductee. Each inductee gets their own copy
 * sharing a batch_id.
 *
 * Admin-only. The endpoint enforces the same.
 */
export default function BatchStartButton({
  formId,
  orgId,
  schema,
}: {
  formId: string;
  orgId: string;
  schema: FormDefinition;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Pull every signature field + every text field — those are what the
  // user can route or pre-fill with the inductee's name.
  const sigFields = useMemo<FormField[]>(
    () =>
      schema.sections
        .flatMap((s) => s.fields)
        .filter((f) => f.type === "signature"),
    [schema],
  );
  const textFields = useMemo<FormField[]>(
    () =>
      schema.sections
        .flatMap((s) => s.fields)
        .filter((f) => f.type === "text" || f.type === "textarea"),
    [schema],
  );

  // The "inductee signature" field — most forms only have one signature
  // and that one IS the inductee's. If multiple, default to the last.
  const [inducteeSigFieldId, setInducteeSigFieldId] = useState<string>(() =>
    sigFields.length > 0 ? sigFields[sigFields.length - 1].id : "",
  );
  // Pre-fill inductee name into a text field — usually labelled
  // "NAME (PRINT)" or similar. Default to the first text field.
  const [inducteeNameFieldId, setInducteeNameFieldId] = useState<string>(() =>
    textFields[0]?.id ?? "",
  );

  // Per-signature assignments for the non-inductee signers (OIM,
  // Supervisor, Heli admin). Keyed by field_id; the inductee field is
  // excluded from this map (it's per-inductee, set below).
  const [sharedAssignments, setSharedAssignments] = useState<SignatureAssignments>({});

  // Inductee list.
  const [inductees, setInductees] = useState<Inductee[]>([
    { name: "", email: "" },
  ]);

  function addInductee() {
    setInductees([...inductees, { name: "", email: "" }]);
  }
  function updateInductee(i: number, key: keyof Inductee, value: string) {
    setInductees(
      inductees.map((ind, idx) =>
        idx === i ? { ...ind, [key]: value } : ind,
      ),
    );
  }
  function removeInductee(i: number) {
    setInductees(inductees.filter((_, idx) => idx !== i));
  }

  function setAssignment(
    fieldId: string,
    key: "email" | "name" | "role",
    value: string,
  ) {
    setSharedAssignments((cur) => ({
      ...cur,
      [fieldId]: { ...(cur[fieldId] ?? { email: "" }), [key]: value },
    }));
  }

  async function submit() {
    setError(null);
    if (inductees.length === 0) {
      setError("Add at least one inductee");
      return;
    }
    for (const [i, ind] of inductees.entries()) {
      if (!ind.name.trim()) return setError(`Inductee #${i + 1}: name required`);
      if (!EMAIL_RE.test(ind.email.trim())) {
        return setError(`Inductee #${i + 1}: valid email required`);
      }
    }
    // Validate every assignment that has any data has a real email.
    for (const [fid, a] of Object.entries(sharedAssignments)) {
      if (a.email && !EMAIL_RE.test(a.email.trim())) {
        const f = sigFields.find((x) => x.id === fid);
        return setError(`Assignment for "${f?.label ?? fid}": invalid email`);
      }
    }

    setSubmitting(true);
    try {
      // Strip empty assignments (no email).
      const cleaned: SignatureAssignments = {};
      for (const [fid, a] of Object.entries(sharedAssignments)) {
        if (a.email?.trim() && fid !== inducteeSigFieldId) {
          cleaned[fid] = {
            email: a.email.trim().toLowerCase(),
            name: a.name?.trim() || undefined,
            role: a.role?.trim() || undefined,
          };
        }
      }

      const res = await fetch("/api/submissions/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          org_id: orgId,
          form_id: formId,
          inductees: inductees.map((i) => ({
            name: i.name.trim(),
            email: i.email.trim().toLowerCase(),
          })),
          shared_assignments: cleaned,
          inductee_signature_field_id: inducteeSigFieldId || undefined,
          inductee_name_field_id: inducteeNameFieldId || undefined,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Batch start failed");
      // Land on the submissions list filtered to this batch's form;
      // each submission shows up under "In progress · ready to finish".
      router.push(`/submissions?form_id=${formId}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (sigFields.length === 0) {
    // Form has no signature fields — batch flow doesn't really apply.
    return null;
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-md border border-ink/30 bg-white px-4 py-2 text-sm font-medium text-ink"
      >
        {open ? "Cancel batch" : "Start batch · multiple inductees"}
      </button>

      {open && (
        <div className="mt-3 space-y-5 rounded-lg border border-ink/15 bg-bg p-4">
          <div className="text-xs text-muted">
            Creates one submission per inductee, sharing the same
            assignees for the non-inductee signature fields. Each
            assignee gets an email when it&apos;s their turn to sign.
          </div>

          {/* Per-inductee config: which signature field is the inductee's,
              and which text field gets the inductee's name. */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              Inductee mapping
            </h3>
            <label className="block text-sm">
              <span className="mr-2 text-muted">Inductee signature field:</span>
              <select
                value={inducteeSigFieldId}
                onChange={(e) => setInducteeSigFieldId(e.target.value)}
                className="rounded-md border border-ink/20 bg-white px-2 py-1 text-sm"
              >
                <option value="">— none —</option>
                {sigFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mr-2 text-muted">
                Pre-fill inductee name into:
              </span>
              <select
                value={inducteeNameFieldId}
                onChange={(e) => setInducteeNameFieldId(e.target.value)}
                className="rounded-md border border-ink/20 bg-white px-2 py-1 text-sm"
              >
                <option value="">— none —</option>
                {textFields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {/* Assignments for non-inductee signature fields */}
          {sigFields.filter((f) => f.id !== inducteeSigFieldId).length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
                Other signers (assigned to one person each)
              </h3>
              {sigFields
                .filter((f) => f.id !== inducteeSigFieldId)
                .map((f) => {
                  const a = sharedAssignments[f.id] ?? { email: "" };
                  return (
                    <div
                      key={f.id}
                      className="rounded-md border border-ink/15 bg-white p-3"
                    >
                      <div className="text-sm font-medium">{f.label}</div>
                      <div className="mt-1.5 grid gap-2 md:grid-cols-3">
                        <input
                          type="text"
                          value={a.role ?? ""}
                          onChange={(e) =>
                            setAssignment(f.id, "role", e.target.value)
                          }
                          placeholder="Role (e.g. OIM)"
                          className="rounded-md border border-ink/20 p-1.5 text-sm"
                        />
                        <input
                          type="text"
                          value={a.name ?? ""}
                          onChange={(e) =>
                            setAssignment(f.id, "name", e.target.value)
                          }
                          placeholder="Name"
                          className="rounded-md border border-ink/20 p-1.5 text-sm"
                        />
                        <input
                          type="email"
                          value={a.email ?? ""}
                          onChange={(e) =>
                            setAssignment(f.id, "email", e.target.value)
                          }
                          placeholder="Email"
                          className="rounded-md border border-ink/20 p-1.5 text-sm"
                        />
                      </div>
                    </div>
                  );
                })}
              <p className="text-[11px] text-muted">
                Leave a row blank to keep that signature open
                (anyone in your org can sign it).
              </p>
            </div>
          )}

          {/* Inductee list */}
          <div className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted">
              Inductees ({inductees.length})
            </h3>
            {inductees.map((ind, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted">
                  #{i + 1}
                </span>
                <input
                  type="text"
                  value={ind.name}
                  onChange={(e) => updateInductee(i, "name", e.target.value)}
                  placeholder="Full name"
                  className="flex-1 rounded-md border border-ink/20 p-1.5 text-sm"
                />
                <input
                  type="email"
                  value={ind.email}
                  onChange={(e) => updateInductee(i, "email", e.target.value)}
                  placeholder="email@example.com"
                  className="flex-1 rounded-md border border-ink/20 p-1.5 text-sm"
                />
                {inductees.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeInductee(i)}
                    className="text-xs text-muted hover:text-err"
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              onClick={addInductee}
              className="rounded-md border border-ink/20 px-3 py-1.5 text-xs"
            >
              + Add another inductee
            </button>
          </div>

          {error && (
            <div className="rounded-md border border-err/40 bg-err/5 p-2 text-sm text-err">
              {error}
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={submit}
              disabled={submitting}
              className="rounded-md bg-ink px-5 py-2.5 text-sm font-bold text-bg disabled:opacity-50"
            >
              {submitting
                ? "Creating…"
                : `Create ${inductees.length} submission${inductees.length === 1 ? "" : "s"}`}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md border border-ink/20 px-4 py-2 text-sm"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
