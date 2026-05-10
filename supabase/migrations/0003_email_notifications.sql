-- FieldForm — email notifications for completed submissions.
-- When a submission flips to status='completed', we email a fixed
-- distribution list (configured per-org). The recipients click a
-- signed link that lets them view the print/PDF page without an
-- account — the link is HMAC-signed and expires.

-- Per-org notification config.
alter table orgs
  add column if not exists notification_emails  text[] not null default '{}',
  add column if not exists notify_on_completion boolean not null default true;

-- Idempotency log: ensures we never email the same submission twice
-- even if the sign route is retried (network glitch, double-click).
-- Also useful as an audit trail of who got what.
create table if not exists submission_email_log (
  id            uuid primary key default gen_random_uuid(),
  submission_id uuid not null references submissions(id) on delete cascade,
  org_id        uuid not null references orgs(id)        on delete cascade,
  kind          text not null,                  -- 'completion' for now
  recipients    text[] not null,
  provider_id   text,                           -- Resend message id
  sent_at       timestamptz not null default now(),
  error         text,                           -- non-null = send failed
  unique (submission_id, kind)                  -- one completion email per submission
);

create index if not exists submission_email_log_org_idx
  on submission_email_log(org_id, sent_at desc);

alter table submission_email_log enable row level security;

-- Org members can see the log for their org.
create policy submission_email_log_select_member
  on submission_email_log
  for select
  using (is_org_member(org_id));

-- Inserts go through the service role; no policy lets a regular
-- user insert directly.
