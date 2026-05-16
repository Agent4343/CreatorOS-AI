import { captureError } from "@/lib/sentry";
import { sendEmail } from "@/lib/email";
import { sendSms } from "@/lib/sms";
import { supabaseService } from "@/lib/supabase/server";

/**
 * Durable outbound message queue.
 *
 * Two entry points:
 *
 *   enqueueEmail / enqueueSms — call sites use these instead of
 *   sendEmail/sendSms directly. Each call writes a row to
 *   outbound_messages (status='pending') and then *attempts* an
 *   immediate send. If the immediate send succeeds, the row is
 *   updated to 'sent'. If it fails, the row stays 'pending' with
 *   send_after pushed forward by the backoff schedule; the cron
 *   worker picks it up.
 *
 *   processOutboundBatch — called from /api/cron/process-outbound
 *   every minute. Picks up to N rows where status='pending' AND
 *   send_after <= now(), claims them by setting status='sending',
 *   sends, updates status. Failures increment attempts and re-arm
 *   send_after; once attempts >= max_attempts the row terminates
 *   as 'failed' for admin review.
 *
 * Why a "try immediate then enqueue" hybrid instead of pure queue:
 * latency. The common case is the provider is up — the user clicks
 * "sign", the next signer's email lands in 200 ms, life is good.
 * If we always queued + waited for the cron, every notification
 * would lag up to a minute. The queue is the durability layer for
 * when the immediate path fails.
 */

const BACKOFF_SECONDS = [30, 120, 480, 1800, 7200];
const CRON_BATCH_SIZE = 25;

type EnqueueResult = {
  /** Row id in outbound_messages — caller can show it in success / error
   * UI, link to the delivery-issues widget, etc. */
  id: string;
  /** True when the immediate send attempt succeeded. False means the
   * row is queued for retry (or terminal failed if max_attempts==0). */
  sent: boolean;
};

export async function enqueueEmail(args: {
  orgId: string;
  actorUserId?: string | null;
  to: string;
  subject: string;
  html: string;
  text?: string;
  replyTo?: string;
  meta?: Record<string, unknown>;
  /** Override default retry count — typically 5. Set to 0 for one-shot
   * "best effort" sends that shouldn't clutter the retry queue. */
  maxAttempts?: number;
}): Promise<EnqueueResult> {
  const sb = supabaseService();
  const { data: row, error } = await sb
    .from("outbound_messages")
    .insert({
      org_id: args.orgId,
      actor_user_id: args.actorUserId ?? null,
      channel: "email",
      recipient: args.to,
      subject: args.subject,
      body_html: args.html,
      body_text: args.text ?? null,
      reply_to: args.replyTo ?? null,
      meta: args.meta ?? {},
      max_attempts: args.maxAttempts ?? 5,
      status: "sending",
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = (row as { id: string }).id;
  const sent = await attemptSend({
    id,
    channel: "email",
    recipient: args.to,
    subject: args.subject,
    body_html: args.html,
    body_text: args.text ?? null,
    reply_to: args.replyTo ?? null,
    attempts: 0,
    max_attempts: args.maxAttempts ?? 5,
  });
  return { id, sent };
}

export async function enqueueSms(args: {
  orgId: string;
  actorUserId?: string | null;
  /** E.164 format, e.g. "+61491570006". */
  to: string;
  body: string;
  meta?: Record<string, unknown>;
  maxAttempts?: number;
}): Promise<EnqueueResult> {
  const sb = supabaseService();
  const { data: row, error } = await sb
    .from("outbound_messages")
    .insert({
      org_id: args.orgId,
      actor_user_id: args.actorUserId ?? null,
      channel: "sms",
      recipient: args.to,
      body_text: args.body,
      meta: args.meta ?? {},
      max_attempts: args.maxAttempts ?? 5,
      status: "sending",
    })
    .select("id")
    .single();
  if (error) throw error;
  const id = (row as { id: string }).id;
  const sent = await attemptSend({
    id,
    channel: "sms",
    recipient: args.to,
    subject: null,
    body_html: null,
    body_text: args.body,
    reply_to: null,
    attempts: 0,
    max_attempts: args.maxAttempts ?? 5,
  });
  return { id, sent };
}

/** Internal: attempt a single send for a queue row. Updates the row
 * to reflect the outcome. Returns true on success, false on
 * (re-queued or terminal) failure. */
async function attemptSend(row: {
  id: string;
  channel: "email" | "sms";
  recipient: string;
  subject: string | null;
  body_html: string | null;
  body_text: string | null;
  reply_to: string | null;
  attempts: number;
  max_attempts: number;
}): Promise<boolean> {
  const sb = supabaseService();

  let providerId: string | null = null;
  let errorMsg: string | null = null;
  try {
    if (row.channel === "email") {
      const result = await sendEmail({
        to: [row.recipient],
        subject: row.subject ?? "",
        html: row.body_html ?? row.body_text ?? "",
        replyTo: row.reply_to ?? undefined,
      });
      if ("ok" in result && result.ok) providerId = result.id || null;
      else if ("ok" in result && !result.ok) errorMsg = result.error;
      else if ("skipped" in result) errorMsg = `skipped: ${result.reason}`;
    } else {
      const result = await sendSms({
        to: row.recipient,
        body: row.body_text ?? "",
      });
      if ("ok" in result && result.ok) providerId = result.id || null;
      else if ("ok" in result && !result.ok) errorMsg = result.error;
      else if ("skipped" in result) errorMsg = `skipped: ${result.reason}`;
    }
  } catch (e) {
    errorMsg = e instanceof Error ? e.message : "send threw";
  }

  if (!errorMsg) {
    await sb
      .from("outbound_messages")
      .update({
        status: "sent",
        attempts: row.attempts + 1,
        provider_id: providerId,
        sent_at: new Date().toISOString(),
        last_error: null,
      })
      .eq("id", row.id);
    return true;
  }

  // Failure path. Either re-arm for retry with backoff, or
  // terminate as 'failed' if we've exhausted attempts.
  const nextAttempts = row.attempts + 1;
  if (nextAttempts >= row.max_attempts) {
    await sb
      .from("outbound_messages")
      .update({
        status: "failed",
        attempts: nextAttempts,
        last_error: errorMsg,
      })
      .eq("id", row.id);
    captureError(new Error(`outbound terminal failure: ${errorMsg}`), {
      where: "outbound.attemptSend",
      message_id: row.id,
      channel: row.channel,
    });
    return false;
  }

  const backoff =
    BACKOFF_SECONDS[Math.min(nextAttempts - 1, BACKOFF_SECONDS.length - 1)];
  const sendAfter = new Date(Date.now() + backoff * 1000).toISOString();
  await sb
    .from("outbound_messages")
    .update({
      status: "pending",
      attempts: nextAttempts,
      send_after: sendAfter,
      last_error: errorMsg,
    })
    .eq("id", row.id);
  return false;
}

/**
 * Cron entry point. Claims up to CRON_BATCH_SIZE rows that are due
 * for retry and attempts each one. Returns a summary for the cron
 * caller to log.
 *
 * Concurrency: we use a two-step claim (select then update where
 * status still pending) to avoid two cron runs both grabbing the
 * same row. Supabase doesn't expose SKIP LOCKED via PostgREST, so
 * this is the closest portable approach. Two parallel workers
 * would race once per batch and the loser would do redundant work,
 * which is harmless.
 */
export async function processOutboundBatch(): Promise<{
  attempted: number;
  succeeded: number;
  failed: number;
}> {
  const sb = supabaseService();
  const now = new Date().toISOString();
  const { data: dueRows, error } = await sb
    .from("outbound_messages")
    .select(
      "id, channel, recipient, subject, body_html, body_text, reply_to, attempts, max_attempts, status",
    )
    .eq("status", "pending")
    .lte("send_after", now)
    .order("send_after", { ascending: true })
    .limit(CRON_BATCH_SIZE);
  if (error) throw error;

  let succeeded = 0;
  let failed = 0;
  const rows = (dueRows ?? []) as Array<{
    id: string;
    channel: "email" | "sms";
    recipient: string;
    subject: string | null;
    body_html: string | null;
    body_text: string | null;
    reply_to: string | null;
    attempts: number;
    max_attempts: number;
    status: string;
  }>;

  for (const r of rows) {
    // Claim by transitioning pending -> sending. If another worker
    // already claimed it (count==0), skip. count: "exact" on the
    // update returns the affected row count without an extra select.
    const { count } = await sb
      .from("outbound_messages")
      .update({ status: "sending" }, { count: "exact" })
      .eq("id", r.id)
      .eq("status", "pending");
    if ((count ?? 0) === 0) continue;
    const ok = await attemptSend(r);
    if (ok) succeeded++;
    else failed++;
  }
  return { attempted: rows.length, succeeded, failed };
}
