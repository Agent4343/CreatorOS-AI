"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/generate";

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Wrong password");
      }
      router.push(next);
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
        <h1 className="text-3xl font-bold tracking-tight">Reel</h1>
        <p className="mt-2 text-sm text-muted">
          Single-user app. Enter the password configured on the server.
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            required
            autoFocus
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          disabled={loading || !password}
          className="w-full rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
        >
          {loading ? "Working…" : "Sign in"}
        </button>
        {error && (
          <div className="rounded-md border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
