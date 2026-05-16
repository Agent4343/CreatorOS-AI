/**
 * Thin wrapper around an SMS provider.
 *
 * Provider: Twilio (largest market share, mature Node SDK, good
 * deliverability in AU/CA/US where most operators are).
 *
 * Configured via env vars:
 *   TWILIO_ACCOUNT_SID
 *   TWILIO_AUTH_TOKEN
 *   TWILIO_FROM_NUMBER  (E.164, e.g. "+61491570006")
 *
 * If any are unset, send() returns { skipped } — same contract as
 * the email wrapper. Lets dev / staging stay quiet without code
 * changes and means production failures are obvious in
 * /api/health.
 *
 * Why no Twilio SDK dep here: keeping the bundle slim. We hit
 * Twilio's REST API directly with fetch, which is two HTTP calls
 * worth of code and means deployments aren't gated on a 60 MB SDK
 * upgrade.
 */

export type SendSmsResult =
  | { ok: true; id: string }
  | { ok: false; error: string }
  | { skipped: true; reason: string };

function creds(): {
  sid: string;
  token: string;
  from: string;
} | null {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_NUMBER;
  if (!sid || !token || !from) return null;
  return { sid, token, from };
}

export async function sendSms(args: {
  /** E.164 format: "+61491570006". Twilio rejects anything else
   * outright; we surface that as the provider error. */
  to: string;
  body: string;
}): Promise<SendSmsResult> {
  const c = creds();
  if (!c) {
    return {
      skipped: true,
      reason: "TWILIO_ACCOUNT_SID / AUTH_TOKEN / FROM_NUMBER not set",
    };
  }
  if (!/^\+[1-9]\d{6,14}$/.test(args.to)) {
    return { ok: false, error: `not E.164: ${args.to}` };
  }
  if (!args.body || args.body.length > 1600) {
    // 1600 is Twilio's documented hard limit. Longer messages would
    // silently truncate or fail with an opaque code.
    return { ok: false, error: "body must be 1-1600 chars" };
  }

  // Twilio REST: POST /2010-04-01/Accounts/{SID}/Messages.json
  // Auth: HTTP Basic with SID:token.
  const url = `https://api.twilio.com/2010-04-01/Accounts/${c.sid}/Messages.json`;
  const auth = Buffer.from(`${c.sid}:${c.token}`).toString("base64");
  const params = new URLSearchParams({
    To: args.to,
    From: c.from,
    Body: args.body,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    const body = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
    };
    if (!res.ok) {
      return {
        ok: false,
        error:
          body.message ?? `twilio ${res.status}${body.code ? ` (${body.code})` : ""}`,
      };
    }
    return { ok: true, id: body.sid ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "fetch failed" };
  }
}
