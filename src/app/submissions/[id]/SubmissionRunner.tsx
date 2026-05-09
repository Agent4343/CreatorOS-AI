"use client";

import { useEffect, useRef, useState } from "react";
import type {
  FormDefinition,
  FormField,
  SubmissionStatus,
} from "@/lib/types";
import PhotoField from "./PhotoField";
import SignaturePad from "./SignaturePad";

type SubmissionShape = {
  id: string;
  org_id: string;
  status: SubmissionStatus;
  data: Record<string, unknown>;
  form_name: string;
};

type SignedField = {
  field_id: string;
  signer_name: string;
  signed_at: string;
};

export default function SubmissionRunner({
  submission,
  schema,
  signedFields,
  canEdit,
  currentUserId,
}: {
  submission: SubmissionShape;
  schema: FormDefinition;
  signedFields: SignedField[];
  canEdit: boolean;
  currentUserId: string;
}) {
  const [data, setData] = useState<Record<string, unknown>>(submission.data);
  const [status, setStatus] = useState<SubmissionStatus>(submission.status);
  const [signed, setSigned] = useState<SignedField[]>(signedFields);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirtyRef = useRef(false);

  // Auto-save every 5 sec when dirty. Important in field environments
  // where the worker may close the page abruptly.
  useEffect(() => {
    if (status === "completed" || status === "rejected") return;
    const t = setInterval(() => {
      if (dirtyRef.current) save();
    }, 5000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  function set(fieldId: string, value: unknown) {
    setData((d) => ({ ...d, [fieldId]: value }));
    dirtyRef.current = true;
  }

  async function save() {
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/submissions/${submission.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ data }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setSavedAt(new Date().toLocaleTimeString());
      dirtyRef.current = false;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function applySignature(fieldId: string, signatureImage: string) {
    setError(null);
    try {
      // Save current data first so the signature's data_hash binds to it.
      if (dirtyRef.current) await save();

      const geo = await tryGeolocation();
      const res = await fetch(`/api/submissions/${submission.id}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          field_id: fieldId,
          signature_image: signatureImage,
          geolocation: geo,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Sign failed");
      setSigned((s) => [
        ...s,
        {
          field_id: fieldId,
          signer_name: "you",
          signed_at: new Date().toISOString(),
        },
      ]);
      if (body.completed) setStatus("completed");
      else if (status === "in_progress") setStatus("awaiting_signature");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign failed");
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <a href="/submissions" className="font-mono text-xs">
            ← back to submissions
          </a>
          <h1 className="mt-2 text-2xl font-bold tracking-tight">
            {submission.form_name}
          </h1>
          <p className="font-mono text-xs text-muted">
            Status: <StatusTag status={status} />
            {savedAt && <> · saved {savedAt}</>}
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="rounded-md border border-ink/20 px-4 py-2 text-sm text-ink"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        )}
      </div>

      {!canEdit && (
        <div className="rounded-md border border-ink/15 bg-white p-3 text-sm text-muted">
          Read-only — submission is {status}.
        </div>
      )}

      {schema.sections.map((sec) => (
        <section
          key={sec.id}
          className="rounded-lg border border-ink/15 bg-white p-4"
        >
          <h2 className="text-lg font-bold">{sec.title}</h2>
          {sec.description && (
            <p className="mt-1 text-sm text-muted">{sec.description}</p>
          )}
          <div className="mt-3 space-y-4">
            {sec.fields.map((f) => (
              <FieldRenderer
                key={f.id}
                field={f}
                value={data[f.id]}
                onChange={(v) => set(f.id, v)}
                canEdit={canEdit}
                signed={signed.find((s) => s.field_id === f.id)}
                onSign={(img) => applySignature(f.id, img)}
                currentUserId={currentUserId}
                orgId={submission.org_id}
                submissionId={submission.id}
              />
            ))}
          </div>
        </section>
      ))}

      {error && (
        <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
          {error}
        </div>
      )}
    </div>
  );
}

function StatusTag({ status }: { status: SubmissionStatus }) {
  const cls =
    status === "completed"
      ? "text-ok"
      : status === "rejected"
        ? "text-err"
        : status === "awaiting_signature"
          ? "text-warn"
          : "text-muted";
  return <span className={cls}>{status}</span>;
}

function FieldRenderer({
  field,
  value,
  onChange,
  canEdit,
  signed,
  onSign,
  orgId,
  submissionId,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  canEdit: boolean;
  signed?: SignedField;
  onSign: (img: string) => void;
  currentUserId: string;
  orgId: string;
  submissionId: string;
}) {
  const disabled = !canEdit || !!signed;
  const labelEl = (
    <label className="block text-sm font-medium">
      {field.label}
      {field.required && <span className="ml-1 text-err">*</span>}
      {field.description && (
        <span className="ml-2 text-xs text-muted">{field.description}</span>
      )}
    </label>
  );

  switch (field.type) {
    case "section_header":
      return <h3 className="text-sm font-bold uppercase tracking-wider">{field.label}</h3>;
    case "divider":
      return <hr className="border-ink/10" />;
    case "text":
      return (
        <div>
          {labelEl}
          <input
            type="text"
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={field.placeholder}
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm disabled:bg-bg"
          />
        </div>
      );
    case "textarea":
      return (
        <div>
          {labelEl}
          <textarea
            rows={4}
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm disabled:bg-bg"
          />
        </div>
      );
    case "number":
      return (
        <div>
          {labelEl}
          <input
            type="number"
            disabled={disabled}
            value={(value as number | string) ?? ""}
            onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm disabled:bg-bg"
          />
        </div>
      );
    case "date":
      return (
        <div>
          {labelEl}
          <input
            type="date"
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 rounded-md border border-ink/20 bg-white p-2 text-sm disabled:bg-bg"
          />
        </div>
      );
    case "datetime":
      return (
        <div>
          {labelEl}
          <input
            type="datetime-local"
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 rounded-md border border-ink/20 bg-white p-2 text-sm disabled:bg-bg"
          />
        </div>
      );
    case "dropdown":
      return (
        <div>
          {labelEl}
          <select
            disabled={disabled}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm disabled:bg-bg"
          >
            <option value="">— select —</option>
            {(field.options ?? []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </div>
      );
    case "multi_select": {
      const selected = (value as string[] | undefined) ?? [];
      return (
        <div>
          {labelEl}
          <div className="mt-1 flex flex-wrap gap-2">
            {(field.options ?? []).map((opt) => {
              const on = selected.includes(opt);
              return (
                <button
                  key={opt}
                  type="button"
                  disabled={disabled}
                  onClick={() =>
                    onChange(
                      on ? selected.filter((s) => s !== opt) : [...selected, opt],
                    )
                  }
                  className={
                    "rounded-md px-3 py-1 text-xs " +
                    (on
                      ? "bg-ink text-bg"
                      : "border border-ink/20 text-ink")
                  }
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      );
    }
    case "checkbox":
      return (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            disabled={disabled}
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
          />
          <span>
            {field.label}
            {field.required && <span className="ml-1 text-err">*</span>}
          </span>
        </label>
      );
    case "radio":
      return (
        <div>
          {labelEl}
          <div className="mt-1 flex flex-wrap gap-3">
            {(field.options ?? []).map((opt) => (
              <label key={opt} className="flex items-center gap-1 text-sm">
                <input
                  type="radio"
                  name={field.id}
                  disabled={disabled}
                  checked={value === opt}
                  onChange={() => onChange(opt)}
                />
                {opt}
              </label>
            ))}
          </div>
        </div>
      );
    case "photo":
      return (
        <PhotoField
          field={field}
          orgId={orgId}
          submissionId={submissionId}
          value={value as string[] | undefined}
          onChange={(paths) => onChange(paths)}
          disabled={disabled}
        />
      );
    case "gps":
      return (
        <div>
          {labelEl}
          <button
            type="button"
            disabled={disabled}
            onClick={async () => {
              const g = await tryGeolocation();
              if (g) onChange(g);
            }}
            className="mt-1 rounded-md border border-ink/20 px-3 py-1.5 text-xs"
          >
            {value
              ? `${(value as { lat: number; lng: number }).lat.toFixed(5)}, ${(value as { lat: number; lng: number }).lng.toFixed(5)}`
              : "Capture location"}
          </button>
        </div>
      );
    case "timestamp":
      return (
        <div>
          {labelEl}
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(new Date().toISOString())}
            className="mt-1 rounded-md border border-ink/20 px-3 py-1.5 text-xs"
          >
            {value ? new Date(value as string).toLocaleString() : "Capture timestamp"}
          </button>
        </div>
      );
    case "signature":
      return (
        <div>
          {labelEl}
          {signed ? (
            <div className="mt-1 rounded-md border border-ok/40 bg-ok/5 p-3 text-sm">
              ✓ Signed by {signed.signer_name} on{" "}
              {new Date(signed.signed_at).toLocaleString()}
            </div>
          ) : canEdit ? (
            <SignaturePad onSign={onSign} />
          ) : (
            <div className="mt-1 text-sm text-muted">Not signed yet.</div>
          )}
        </div>
      );
    default:
      return <div className="text-sm text-muted">Field type {field.type} not yet supported.</div>;
  }
}

async function tryGeolocation(): Promise<
  { lat: number; lng: number; accuracy?: number } | null
> {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (p) =>
        resolve({
          lat: p.coords.latitude,
          lng: p.coords.longitude,
          accuracy: p.coords.accuracy,
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 5000 },
    );
  });
}
