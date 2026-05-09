"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/orgs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, full_name: fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed");
      router.push("/dashboard");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Set up your workspace</h1>
        <p className="mt-2 text-sm text-muted">
          One per business. You're the owner. Invite teammates from Settings later.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Business name</label>
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Acme Construction"
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Your name</label>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Used on signatures and audit trail"
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
          />
        </div>
        <button
          disabled={loading || name.trim().length < 2}
          className="w-full rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create workspace"}
        </button>
        {error && (
          <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
