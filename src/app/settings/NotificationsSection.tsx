"use client";

import { useState } from "react";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Per-org notification recipient list. When a submission flips to
 * status=completed, every email on this list gets the compliance
 * artifact + a signed link to view the full record.
 *
 * Recipients don't need FieldForm accounts — the link carries an
 * HMAC-signed token. Admins manage this list; field workers don't.
 */
export default function NotificationsSection({
  orgId,
  initialEmails,
  initialEnabled,
}: {
  orgId: string;
  initialEmails: string[];
  initialEnabled: boolean;
}) {
  const [emails, setEmails] = useState<string[]>(initialEmails);
  const [enabled, setEnabled] = useState(initialEnabled);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function addEmail() {
    const e = draft.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) {
      setError(`"${e}" doesn't look like an email`);
      return;
    }
    if (emails.includes(e)) {
      setError("Already in the list");
      return;
    }
    setEmails([...emails, e]);
    setDraft("");
    setError(null);
  }

  function removeEmail(e: string) {
    setEmails(emails.filter((x) => x !== e));
  }

  async function save() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/orgs/${orgId}/notifications`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notification_emails: emails,
          notify_on_completion: enabled,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Save failed");
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-lg border border-ink/15 bg-white p-5">
      <h2 className="text-lg font-bold">Email notifications</h2>
      <p className="mt-1 text-sm text-muted">
        When a form is completed and signed, FieldForm emails everyone
        on this list a copy of the record + a signed link to view the
        full audit trail. Recipients don&apos;t need a FieldForm account.
      </p>

      <label className="mt-4 flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-4 w-4"
        />
        <span>Send email when a submission is completed</span>
      </label>

      <div className="mt-4">
        <label className="block text-sm font-medium">Recipients</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {emails.map((e) => (
            <span
              key={e}
              className="flex items-center gap-1.5 rounded-md border border-ink/15 bg-bg px-2 py-1 text-sm"
            >
              <span>{e}</span>
              <button
                type="button"
                onClick={() => removeEmail(e)}
                className="text-muted hover:text-err"
                aria-label={`Remove ${e}`}
              >
                ×
              </button>
            </span>
          ))}
          {emails.length === 0 && (
            <span className="text-sm text-muted">
              No recipients yet — emails won&apos;t be sent.
            </span>
          )}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            type="email"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addEmail();
              }
            }}
            placeholder="safety@yourcompany.com"
            className="flex-1 rounded-md border border-ink/20 bg-white p-2 text-sm"
          />
          <button
            type="button"
            onClick={addEmail}
            className="rounded-md border border-ink/20 px-3 py-2 text-sm"
          >
            Add
          </button>
        </div>
        <p className="mt-1.5 font-mono text-[11px] text-muted">
          Up to 25 recipients · Enter or comma to add
        </p>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="rounded-md bg-ink px-4 py-2 text-sm text-bg disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save settings"}
        </button>
        {saved && <span className="text-sm text-ok">✓ Saved</span>}
        {error && <span className="text-sm text-err">{error}</span>}
      </div>

      <p className="mt-4 rounded-md bg-bg p-3 text-xs text-muted">
        <strong>Setup checklist:</strong> emails will only actually
        deliver once your admin has set <code>RESEND_API_KEY</code> and
        a verified <code>EMAIL_FROM</code> address in the FieldForm
        deployment environment. Until then, completion events are
        logged to <code>submission_email_log</code> with reason
        &quot;skipped&quot; so you can verify the wiring without
        sending real mail.
      </p>
    </section>
  );
}
