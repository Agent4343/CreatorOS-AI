-- FieldForm — durable outbound message queue for email + SMS.
--
-- Today every notification is fire-and-forget: notifyNextSigner and
-- notifySubmissionCompleted call Resend directly, log a result, and
-- move on. If Resend is down for two minutes, the people who should
-- have been pinged in that window never hear about their pending
-- signatures and the operator has no way to redrive.
--
-- The queue gives us:
--   - retries with exponential backoff (capped),
--   - an audit trail of what was sent, when, and what the provider
--     returned,
--   - one table that works for email + SMS so the cron worker
--     doesn't fork by channel.
--
-- Status machine: pending -> sending -> sent | failed.
-- Failed rows can be retried up to max_attempts; after that they're
-- terminal and require manual review.

create table if not exists outbound_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  -- The user who triggered the send (signed, started a batch, etc).
  -- Null for system-driven sends (cron sweeps, scheduled reminders).
  actor_user_id   uuid references auth.users(id),
  channel         text not null check (channel in ('email','sms')),
  -- Email: comma-separated addresses. SMS: a single E.164 number.
  -- One row per recipient keeps the retry surface small (a partial
  -- delivery doesn't poison the row).
  recipient       text not null,
  subject         text,                              -- email only
  body_html       text,                              -- email
  body_text       text,                              -- email plain fallback + SMS
  reply_to        text,
  -- Free-form for the worker to pivot on. Typically:
  --   { kind: "next_signer", submission_id, field_id }
  --   { kind: "completed", submission_id }
  --   { kind: "invite", batch_id, role }
  meta            jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                    check (status in ('pending','sending','sent','failed')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  -- Earliest time the worker may attempt the next send. Pushed
  -- forward on failure using exponential backoff: 30s, 2m, 8m, 30m,
  -- 2h.
  send_after      timestamptz not null default now(),
  last_error      text,
  provider_id     text,                              -- provider's message id once accepted
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

-- The worker picks rows in send_after order, oldest first, where
-- status is pending and attempts < max_attempts. This index makes
-- that query cheap.
create index if not exists outbound_messages_due_idx
  on outbound_messages (send_after)
  where status = 'pending';

-- An org-level read index for the "delivery issues" widget that an
-- admin uses to see what's failing.
create index if not exists outbound_messages_org_status_idx
  on outbound_messages (org_id, status, created_at desc);

alter table outbound_messages enable row level security;

-- Org members can read their own org's send history. Writes go via
-- service role from server-side code only.
create policy "outbound_messages_member_read" on outbound_messages
  for select using (
    exists (
      select 1 from memberships m
       where m.org_id = outbound_messages.org_id
         and m.user_id = auth.uid()
    )
  );
