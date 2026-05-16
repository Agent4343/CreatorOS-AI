"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Cancel this batch" — marks every still-open submission in the
 * batch as rejected in one call. Two-step confirm (open panel ->
 * type reason -> confirm) so it can't be misfired by a stray click.
 */
export default function CancelBatchButton({ batchId }: { batchId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/batches/${batchId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() || undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Cancel failed");
      router.refresh();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-err/40 px-3 py-1.5 text-sm font-medium text-err hover:bg-err/5"
      >
        Cancel batch
      </button>
    );
  }

  return (
    <div className="w-full max-w-md rounded-md border border-err/40 bg-white p-3 text-sm">
      <div className="font-bold text-err">Cancel this batch?</div>
      <p className="mt-1 text-xs text-muted">
        Every in-progress submission in this batch will be marked
        cancelled. Completed ones stay as-is. Inductees will not be
        emailed an apology — let them know yourself.
      </p>
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (optional, recorded in audit)"
        className="mt-2 w-full rounded-md border border-ink/20 p-1.5 text-sm"
      />
      {error && (
        <div className="mt-2 rounded-md border border-err/40 bg-err/5 p-2 text-xs text-err">
          {error}
        </div>
      )}
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={confirm}
          disabled={submitting}
          className="rounded-md bg-err px-3 py-1.5 text-sm font-bold text-bg disabled:opacity-50"
        >
          {submitting ? "Cancelling…" : "Yes, cancel batch"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setReason("");
            setError(null);
          }}
          className="rounded-md border border-ink/20 px-3 py-1.5 text-sm"
        >
          Keep batch
        </button>
      </div>
    </div>
  );
}
