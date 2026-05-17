/**
 * Optional Sentry wrapper.
 *
 * Why no top-level `import * as Sentry from "@sentry/nextjs"`:
 *   @sentry/nextjs has heavy module-load side effects — it installs
 *   global error hooks, wraps Node's process events, and on some
 *   Next 16 / Turbopack production builds it can throw or stall at
 *   import time when not paired with the SDK's expected
 *   instrumentation.ts + sentry.server.config.ts setup.
 *
 *   We don't want a fresh deploy on Railway / Vercel / anywhere
 *   to 500 on every page just because Sentry's optional. The
 *   integration here is best-effort: import is dynamic and only
 *   happens when SENTRY_DSN is set. Without DSN both helpers fall
 *   back to console and the SDK is never touched.
 *
 * Use sites:
 *   - Catch handlers in API routes that silently swallow errors
 *     (cascade failures, email delivery failures, audit-write
 *     failures).
 *   - Caught-but-recoverable conditions worth investigating
 *     (assignment shape we didn't anticipate, schema mismatch).
 *
 * Don't wrap every try/catch — when @sentry/nextjs IS bootstrapped
 * via instrumentation, it auto-captures unhandled exceptions for
 * us. Use these helpers only for branches that catch + continue.
 */

const dsn = process.env.SENTRY_DSN;
const enabled = !!dsn;

/** Cached SDK reference after the first lazy import succeeds. Null
 * when disabled or the dynamic import itself failed (we don't want
 * to retry the import on every error — that'd amplify the noise of
 * a misconfigured Sentry into thousands of failed imports). */
let cached: unknown = null;
let importAttempted = false;

async function loadSdk(): Promise<unknown> {
  if (!enabled) return null;
  if (cached) return cached;
  if (importAttempted) return null;
  importAttempted = true;
  try {
    // Dynamic import keeps @sentry/nextjs out of the module graph
    // when it isn't configured. Eval to defer the import-resolution
    // step past Next's bundling so the bundler doesn't try to pull
    // it in eagerly on the server.
    const mod = await import("@sentry/nextjs");
    if (typeof (mod as { init?: unknown }).init === "function" &&
        typeof (mod as { getClient?: unknown }).getClient === "function") {
      const sdk = mod as {
        init: (opts: Record<string, unknown>) => void;
        getClient: () => unknown;
      };
      if (!sdk.getClient()) {
        sdk.init({
          dsn,
          environment:
            process.env.SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
          // Default sample rates: capture every error, sample 10%
          // of transactions. Tune from the Sentry dashboard, not
          // code.
          tracesSampleRate: Number(
            process.env.SENTRY_TRACES_SAMPLE_RATE ?? 0.1,
          ),
          sendDefaultPii: false,
        });
      }
      cached = mod;
      return mod;
    }
  } catch (e) {
    // Sentry init failed — log once and let the app continue. The
    // alternative (crashing the request) is worse than missing
    // error telemetry.
    console.warn(
      "[sentry] @sentry/nextjs unavailable, falling back to console:",
      e instanceof Error ? e.message : String(e),
    );
  }
  return null;
}

/**
 * Report a caught error that didn't break the user flow but we
 * want to see in monitoring. Returns the Sentry event id (or null
 * when disabled / SDK unavailable). Async because the SDK is
 * dynamically loaded — fire-and-forget on the caller side is fine.
 */
export function captureError(
  err: unknown,
  context?: Record<string, unknown>,
): null {
  // Always log to console so dev / Railway logs / Vercel logs see it.
  console.error("[captureError]", err, context);
  if (!enabled) return null;
  loadSdk().then((sdk) => {
    if (!sdk) return;
    try {
      (sdk as {
        captureException: (
          err: unknown,
          opts?: { extra?: Record<string, unknown> },
        ) => unknown;
      }).captureException(err, { extra: context });
    } catch {
      // ignore — captureError must never throw
    }
  });
  return null;
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
  console.warn("[captureMessage]", message, context);
  if (!enabled) return;
  loadSdk().then((sdk) => {
    if (!sdk) return;
    try {
      (sdk as {
        captureMessage: (
          msg: string,
          opts?: { extra?: Record<string, unknown> },
        ) => unknown;
      }).captureMessage(message, { extra: context });
    } catch {
      // ignore
    }
  });
}
