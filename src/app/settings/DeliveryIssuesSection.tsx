"use client";

import { useEffect, useState } from "react";

type Row = {
  id: string;
  channel: "email" | "sms";
  recipient: string;
  subject: string | null;
  status: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  send_after: string;
  created_at: string;
  meta: Record<string, unknown>;
};

/**
 * Delivery issues panel. Pulls every outbound_messages row whose
 * status is 'failed' (terminal) or 'pending' with attempts > 0
 * (currently retrying) for this org. An admin can see at a glance
 * what didn't land, why, and force a redrive.
 *
 * Why not auto-mailbox-style polling: the worker cron already
 * retries. This widget is for human-in-the-loop investigation when
 * something terminally failed (bad address, blocked content, etc).
 */
export default function DeliveryIssuesSection({ orgId }: { orgId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [redriving, setRedriving] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/orgs/${orgId}/delivery-issues`);
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Failed to load");
      setRows((body.rows as Row[]) ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId]);

  async function redrive(id: string) {
    setRedriving(id);
    try {
      const res = await fetch(`/api/orgs/${orgId}/delivery-issues/${id}/retry`, {
        method: "POST",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? "Retry failed");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Retry failed");
    } finally {
      setRedriving(null);
    }
  }

  return (
    <section className="rounded-lg border border-ink/15 bg-white p-5">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">Delivery issues</h2>
          <p className="mt-1 text-sm text-muted">
            Emails and SMSes that failed to send. The cron retries
            failed messages automatically with backoff; terminal
            failures (5+ attempts) show up here for review.
          </p>
        </div>
        <button
          type="button"
          onClick={refresh}
          disabled={loading}
          className="rounded-md border border-ink/20 px-3 py-1.5 text-xs disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && (
        <div className="mt-3 rounded-md border border-err/40 bg-err/5 p-2 text-sm text-err">
          {error}
        </div>
      )}

      {rows && rows.length === 0 && !loading && (
        <p className="mt-3 text-sm text-muted">
          No delivery issues. Everything's getting through.
        </p>
      )}

      {rows && rows.length > 0 && (
        <ul className="mt-3 space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-ink/10 bg-bg/60 p-3 text-sm"
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <span
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium ${
                    r.status === "failed"
                      ? "bg-err/15 text-err"
                      : "bg-warn/15 text-warn"
                  }`}
                >
                  {r.status} · {r.attempts}/{r.max_attempts} attempt
                  {r.attempts === 1 ? "" : "s"}
                </span>
                <span className="font-mono text-[11px] uppercase tracking-wider text-muted">
                  {r.channel}
                </span>
                <span className="font-mono text-xs">{r.recipient}</span>
                <span className="ml-auto font-mono text-[11px] text-muted">
                  {new Date(r.created_at).toLocaleString()}
                </span>
              </div>
              {r.subject && (
                <div className="mt-1 text-sm">
                  <strong>{r.subject}</strong>
                </div>
              )}
              {r.last_error && (
                <div className="mt-1 rounded-sm bg-err/5 p-1.5 font-mono text-[11px] text-err">
                  {r.last_error}
                </div>
              )}
              <div className="mt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => redrive(r.id)}
                  disabled={redriving === r.id}
                  className="rounded-md bg-ink px-3 py-1 text-xs font-medium text-bg disabled:opacity-50"
                >
                  {redriving === r.id ? "Retrying…" : "Retry now"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
