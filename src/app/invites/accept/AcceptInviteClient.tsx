"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function AcceptInviteClient() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const sb = supabaseBrowser();
    sb.auth
      .getUser()
      .then((res: { data: { user: unknown | null } }) =>
        setSignedIn(!!res.data.user),
      );
  }, []);

  if (!token) {
    return (
      <div className="rounded-md border border-err/40 bg-err/5 p-4 text-sm text-err">
        No invite token in URL.
      </div>
    );
  }

  if (signedIn === null) {
    return <div className="text-sm text-muted">Checking your session…</div>;
  }

  if (!signedIn) {
    const next = `/invites/accept?token=${encodeURIComponent(token)}`;
    return (
      <div className="mx-auto max-w-md space-y-4">
        <h1 className="text-2xl font-bold">You've been invited</h1>
        <p className="text-sm text-muted">
          Sign in (or create a free account using the email the invite was sent
          to) to join the workspace.
        </p>
        <a
          href={`/login?next=${encodeURIComponent(next)}`}
          className="inline-block rounded-md bg-ink px-4 py-2 text-sm text-bg no-underline"
        >
          Continue to sign in
        </a>
      </div>
    );
  }

  async function accept() {
    setLoading(true);
    setError(null);
    setInfo(null);
    try {
      const res = await fetch("/api/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, full_name: fullName.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setInfo("You're in. Redirecting…");
      setTimeout(() => {
        router.push("/dashboard");
        router.refresh();
      }, 600);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <h1 className="text-2xl font-bold">Accept your invite</h1>
      <p className="text-sm text-muted">
        Joining will give you access to the workspace this invite was created
        for. You can leave any workspace from settings.
      </p>
      <div>
        <label className="block text-sm font-medium">
          Your name (used on signatures and audit trail)
        </label>
        <input
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Optional"
          className="mt-1 w-full rounded-md border border-ink/20 bg-white p-2 text-sm"
        />
      </div>
      <button
        onClick={accept}
        disabled={loading}
        className="w-full rounded-md bg-ink px-5 py-3 text-sm font-medium text-bg disabled:opacity-50"
      >
        {loading ? "Joining…" : "Accept invite"}
      </button>
      {error && (
        <div className="rounded-md border border-err/40 bg-err/5 p-3 text-sm text-err">
          {error}
        </div>
      )}
      {info && (
        <div className="rounded-md border border-ok/40 bg-ok/5 p-3 text-sm text-ok">
          {info}
        </div>
      )}
    </div>
  );
}
