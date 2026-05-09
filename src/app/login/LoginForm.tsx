"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Mode = "signin" | "signup";

export default function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);
    const sb = supabaseBrowser();
    try {
      if (mode === "signin") {
        const { error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        router.push(next);
        router.refresh();
      } else {
        const { error } = await sb.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent("/onboarding")}`,
          },
        });
        if (error) throw error;
        setInfo("Check your inbox to confirm your email.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {mode === "signin" ? "Sign in" : "Create account"}
        </h1>
        <p className="mt-2 text-sm text-muted">
          {mode === "signin"
            ? "Welcome back."
            : "Start a 14-day trial. No card required."}
        </p>
      </div>

      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Password</label>
          <input
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button
          disabled={loading}
          className="w-full rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
        >
          {loading
            ? "Working…"
            : mode === "signin"
              ? "Sign in"
              : "Create account"}
        </button>
        {error && (
          <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
            {error}
          </div>
        )}
        {info && (
          <div className="rounded-md border border-ink/20 bg-white p-3 text-sm">
            {info}
          </div>
        )}
      </form>

      <div className="text-center text-xs text-muted">
        <button
          type="button"
          onClick={() => setMode(mode === "signup" ? "signin" : "signup")}
          className="underline"
        >
          {mode === "signup"
            ? "Already have an account? Sign in"
            : "New here? Create an account"}
        </button>
      </div>
    </div>
  );
}
