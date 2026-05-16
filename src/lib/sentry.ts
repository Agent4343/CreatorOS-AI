import * as Sentry from "@sentry/nextjs";

/**
 * Thin wrapper over @sentry/nextjs so the rest of the app doesn't
 * have to know about Sentry's API surface or care whether it's
 * configured.
 *
 * No-ops when SENTRY_DSN is unset. Local dev and staging stay
 * quiet without any code changes; production gets full traces by
 * setting one env var.
 *
 * Use sites:
 *   - Catch handlers in API routes that silently swallow errors
 *     (cascade failures, email delivery failures).
 *   - Caught-but-recoverable conditions worth investigating
 *     (assignment shape we didn't anticipate, schema mismatch).
 *
 * Don't wrap every try/catch — Sentry already auto-captures
 * unhandled exceptions via @sentry/nextjs's request handler.
 * Use these helpers only for branches that catch + continue.
 */

const enabled = !!process.env.SENTRY_DSN;

if (enabled && !Sentry.getClient()) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
    // Default sample rates: capture every error, sample 10% of
    // transactions. Tune from the Sentry dashboard, not code.
    tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1),
    sendDefaultPii: false,
  });
}

/**
 * Report a caught error that didn't break the user flow but we
 * want to see in monitoring. Returns the Sentry event id (or null
 * when disabled) so the caller can include it in a user-facing
 * error message for support escalation.
 */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): string | null {
  if (!enabled) {
    console.error("[captureError]", err, context);
    return null;
  }
  return Sentry.captureException(err, { extra: context }) ?? null;
}

/**
 * Note a noteworthy event that isn't an error — a cascade that
 * propagated more than usual, a sibling skipped for an odd reason,
 * a rate limit approached.
 */
export function captureMessage(
  message: string,
  context?: Record<string, unknown>,
): void {
  if (!enabled) {
    console.warn("[captureMessage]", message, context);
    return;
  }
  Sentry.captureMessage(message, { extra: context });
}
