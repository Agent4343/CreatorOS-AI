-- Apply this in Supabase SQL Editor (one paste) to bring a project
-- up to date with the May 2026 batch dashboard / cascade / outbound
-- queue / audit chain work.
--
-- Each block is idempotent — running this twice is safe. The
-- individual files in supabase/migrations/ (0007 - 0011) are the
-- source of truth; this script just stitches them so an operator
-- doesn't have to paste five files in order.
--
-- The app is now defensive about most of these columns missing
-- (the PATCH route falls back to a wildcard select, the sign
-- route falls back to inline signature base64 when the storage
-- column isn't there). Applying these still gets you the perf and
-- compliance wins they were designed for.

-- ------------------------------------------------------------------
-- 0007: batch_label
-- ------------------------------------------------------------------
alter table submissions
  add column if not exists batch_label text;

-- ------------------------------------------------------------------
-- 0008: audit log hash chain + immutability
-- ------------------------------------------------------------------
create extension if not exists pgcrypto;

alter table audit_logs
  add column if not exists hash_prev text,
  add column if not exists hash_self text;

create index if not exists audit_logs_org_created_idx
  on audit_logs(org_id, created_at);

create or replace function audit_logs_chain_insert()
returns trigger
language plpgsql
as $$
declare
  prev_hash text;
  payload   text;
begin
  select hash_self
    into prev_hash
    from audit_logs
   where org_id = new.org_id
   order by created_at desc, id desc
   limit 1
   for update;

  new.hash_prev := coalesce(prev_hash, '');

  payload := concat_ws('|',
    new.org_id::text,
    coalesce(new.actor_user_id::text, ''),
    new.action,
    new.resource_type,
    coalesce(new.resource_id::text, ''),
    coalesce(new.ip_address, ''),
    coalesce(new.user_agent, ''),
    to_char(coalesce(new.created_at, now()) at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    new.hash_prev
  );

  new.hash_self := encode(digest(payload, 'sha256'), 'hex');
  return new;
end;
$$;

drop trigger if exists audit_logs_chain_insert_trg on audit_logs;
create trigger audit_logs_chain_insert_trg
before insert on audit_logs
for each row
execute function audit_logs_chain_insert();

revoke update, delete on audit_logs from anon, authenticated, service_role;

-- ------------------------------------------------------------------
-- 0009: cascade throttle
-- ------------------------------------------------------------------
alter table submissions
  add column if not exists last_cascade_at timestamptz;

-- ------------------------------------------------------------------
-- 0010: signature object storage
-- ------------------------------------------------------------------
alter table submission_signatures
  add column if not exists signature_image_path text;

do $$
begin
  -- Older rows had signature_image NOT NULL; drop that constraint
  -- so future rows can store only the storage path.
  if exists (
    select 1
      from information_schema.columns
     where table_name = 'submission_signatures'
       and column_name = 'signature_image'
       and is_nullable = 'NO'
  ) then
    alter table submission_signatures alter column signature_image drop not null;
  end if;
end$$;

-- ------------------------------------------------------------------
-- 0011: outbound_messages queue
-- ------------------------------------------------------------------
create table if not exists outbound_messages (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  actor_user_id   uuid references auth.users(id),
  channel         text not null check (channel in ('email','sms')),
  recipient       text not null,
  subject         text,
  body_html       text,
  body_text       text,
  reply_to        text,
  meta            jsonb not null default '{}'::jsonb,
  status          text not null default 'pending'
                    check (status in ('pending','sending','sent','failed')),
  attempts        integer not null default 0,
  max_attempts    integer not null default 5,
  send_after      timestamptz not null default now(),
  last_error      text,
  provider_id     text,
  sent_at         timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists outbound_messages_due_idx
  on outbound_messages (send_after)
  where status = 'pending';

create index if not exists outbound_messages_org_status_idx
  on outbound_messages (org_id, status, created_at desc);

alter table outbound_messages enable row level security;

do $$
begin
  if not exists (
    select 1
      from pg_policies
     where schemaname = 'public'
       and tablename = 'outbound_messages'
       and policyname = 'outbound_messages_member_read'
  ) then
    create policy "outbound_messages_member_read" on outbound_messages
      for select using (
        exists (
          select 1 from memberships m
           where m.org_id = outbound_messages.org_id
             and m.user_id = auth.uid()
        )
      );
  end if;
end$$;
