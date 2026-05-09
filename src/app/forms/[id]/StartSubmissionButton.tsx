"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function StartSubmissionButton({
  formId,
  orgId,
}: {
  formId: string;
  orgId: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/submissions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ form_id: formId, org_id: orgId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push(`/submissions/${data.submission.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={start}
        disabled={loading}
        className="rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
      >
        {loading ? "Starting…" : "Start a submission"}
      </button>
      {error && (
        <div className="mt-2 text-sm text-err">{error}</div>
      )}
    </div>
  );
}
