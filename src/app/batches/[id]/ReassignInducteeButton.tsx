"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Compact "fix inductee" affordance for a single batch row. The
 * heli admin clicks the current name → an inline editor opens with
 * the existing values pre-filled. Saves rewrite the signature
 * assignment and the inductee name field in one call. Refuses if
 * the inductee already signed (server-side gate).
 */
export default function ReassignInducteeButton({
  submissionId,
  currentName,
  currentEmail,
}: {
  submissionId: string;
  currentName: string;
  currentEmail: string | null;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(currentName);
  const [email, setEmail] = useState(currentEmail ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    if (!name.trim() || !EMAIL_RE.test(email.trim())) {
      setError("Name + valid email required");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/submissions/${submissionId}/reassign-inductee`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: name.trim(),
            email: email.trim().toLowerCase(),
          }),
        },
      );
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Reassign failed");
      setOpen(false);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reassign failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-[11px] text-muted hover:text-accent"
        title="Reassign this row to a different inductee"
      >
        edit
      </button>
    );
  }

  return (
    <div className="mt-1 space-y-1 rounded-md border border-ink/15 bg-white p-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Full name"
        className="w-full rounded-md border border-ink/20 p-1 text-xs"
      />
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="email"
        className="w-full rounded-md border border-ink/20 p-1 text-xs"
      />
      {error && <div className="text-[11px] text-err">{error}</div>}
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={save}
          disabled={submitting}
          className="rounded-md bg-ink px-2 py-1 text-[11px] font-bold text-bg disabled:opacity-50"
        >
          {submitting ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setName(currentName);
            setEmail(currentEmail ?? "");
            setError(null);
          }}
          className="rounded-md border border-ink/20 px-2 py-1 text-[11px]"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
