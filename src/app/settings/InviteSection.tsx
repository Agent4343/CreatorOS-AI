"use client";

import { useState } from "react";

type PendingInvite = {
  id: string;
  email: string;
  role: "admin" | "member" | "viewer";
  token: string;
  expires_at: string;
  created_at: string;
};

export default function InviteSection({
  orgId,
  initialPending,
}: {
  orgId: string;
  initialPending: PendingInvite[];
}) {
  const [pending, setPending] = useState<PendingInvite[]>(initialPending);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  async function createInvite() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_id: orgId, email: email.trim(), role }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setPending((p) => [body.invite, ...p]);
      setEmail("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setCreating(false);
    }
  }

  async function cancelInvite(id: string) {
    setError(null);
    try {
      const res = await fetch(`/api/invites/${id}`, { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed");
      setPending((p) => p.filter((i) => i.id !== id));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  async function copyLink(token: string, id: string) {
    const link = `${window.location.origin}/invites/accept?token=${encodeURIComponent(token)}`;
    try {
      await navigator.clipboard.writeText(link);
      setCopiedId(id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  return (
    <section className="rounded-lg border border-ink/15 bg-white p-5">
      <h2 className="text-lg font-bold">Invite teammates</h2>
      <p className="mt-1 text-sm text-muted">
        Generate an invite link and send it to your teammate however you
        prefer. The invite is bound to the email address — only that
        address can accept.
      </p>

      <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto_auto]">
        <input
          type="email"
          placeholder="teammate@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-md border border-ink/20 bg-white p-2 text-sm"
        />
        <select
          value={role}
          onChange={(e) =>
            setRole(e.target.value as "admin" | "member" | "viewer")
          }
          className="rounded-md border border-ink/20 bg-white p-2 text-sm"
        >
          <option value="admin">Admin</option>
          <option value="member">Member</option>
          <option value="viewer">Viewer</option>
        </select>
        <button
          onClick={createInvite}
          disabled={creating || !email.includes("@")}
          className="rounded-md bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50"
        >
          {creating ? "…" : "Create invite"}
        </button>
      </div>

      {error && (
        <div className="mt-2 rounded-md border border-err/40 bg-err/5 p-2 text-sm text-err">
          {error}
        </div>
      )}

      {pending.length > 0 && (
        <div className="mt-5 space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted">
            Pending invites
          </h3>
          {pending.map((inv) => (
            <div
              key={inv.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-ink/10 p-2 text-sm"
            >
              <div>
                <span className="font-medium">{inv.email}</span>
                <span className="ml-2 font-mono text-xs text-muted">
                  · {inv.role}
                </span>
                <span className="ml-2 font-mono text-xs text-muted">
                  · expires{" "}
                  {new Date(inv.expires_at).toLocaleDateString()}
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => copyLink(inv.token, inv.id)}
                  className="rounded-md border border-ink/20 px-3 py-1 text-xs text-ink"
                >
                  {copiedId === inv.id ? "copied" : "copy invite link"}
                </button>
                <button
                  type="button"
                  onClick={() => cancelInvite(inv.id)}
                  className="rounded-md border border-err/30 px-3 py-1 text-xs text-err"
                >
                  cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
