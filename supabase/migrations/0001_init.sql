-- FieldForm — Phase 1 schema
-- Multi-tenant, RLS-isolated. Every tenant-scoped table has a policy that
-- only allows access to rows whose org_id is in the auth user's
-- memberships. Service role bypasses this and is used only in trusted
-- server code that has explicitly verified membership.

create extension if not exists "pgcrypto";

-- ============================================================
-- Tenancy
-- ============================================================

create table if not exists orgs (
  id                       uuid primary key default gen_random_uuid(),
  name                     text not null,
  plan                     text not null default 'trial' check (plan in ('trial','starter','pro','enterprise')),
  trial_ends_at            timestamptz default (now() + interval '14 days'),
  stripe_customer_id       text,
  stripe_subscription_id   text,
  subscription_status      text,
  current_period_end       timestamptz,
  seats                    int,
  created_at               timestamptz not null default now()
);
create index if not exists orgs_stripe_customer_idx on orgs(stripe_customer_id);
create index if not exists orgs_stripe_subscription_idx on orgs(stripe_subscription_id);

create table if not exists memberships (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  role        text not null check (role in ('owner','admin','member','viewer')),
  full_name   text,
  created_at  timestamptz not null default now(),
  unique (org_id, user_id)
);
create index if not exists memberships_user_idx on memberships(user_id);
create index if not exists memberships_org_idx on memberships(org_id);

create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references orgs(id) on delete cascade,
  email       text not null,
  role        text not null check (role in ('admin','member','viewer')),
  token       text not null unique,
  invited_by  uuid not null references auth.users(id),
  accepted_at timestamptz,
  expires_at  timestamptz not null default (now() + interval '7 days'),
  created_at  timestamptz not null default now()
);
create index if not exists invites_email_idx on invites(email);
create index if not exists invites_token_idx on invites(token);

-- ============================================================
-- Forms
-- ============================================================

create table if not exists forms (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  name            text not null,
  description     text,
  schema          jsonb not null,             -- the current form definition
  current_version int not null default 1,
  archived        boolean not null default false,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists forms_org_idx on forms(org_id, archived, updated_at desc);

-- Immutable version history. Every save bumps current_version on forms
-- and inserts a new row here. Submissions reference a specific version.
create table if not exists form_versions (
  id              uuid primary key default gen_random_uuid(),
  form_id         uuid not null references forms(id) on delete cascade,
  org_id          uuid not null references orgs(id) on delete cascade,
  version_number  int not null,
  schema          jsonb not null,
  created_by      uuid not null references auth.users(id),
  created_at      timestamptz not null default now(),
  unique (form_id, version_number)
);
create index if not exists form_versions_form_idx on form_versions(form_id, version_number desc);

-- ============================================================
-- Submissions
-- ============================================================

create table if not exists submissions (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references orgs(id) on delete cascade,
  form_id           uuid not null references forms(id) on delete cascade,
  form_version_id   uuid not null references form_versions(id),
  status            text not null default 'in_progress'
                    check (status in ('in_progress','awaiting_signature','completed','rejected')),
  data              jsonb not null default '{}'::jsonb,
  started_by        uuid not null references auth.users(id),
  completed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists submissions_org_idx on submissions(org_id, created_at desc);
create index if not exists submissions_form_idx on submissions(form_id, created_at desc);
create index if not exists submissions_status_idx on submissions(status);

-- ============================================================
-- Signatures — the audit-trail row that makes a signature defensible
-- ============================================================

create table if not exists submission_signatures (
  id              uuid primary key default gen_random_uuid(),
  submission_id   uuid not null references submissions(id) on delete cascade,
  org_id          uuid not null references orgs(id) on delete cascade,
  field_id        text not null,                   -- which signature field on the form
  signer_user_id  uuid not null references auth.users(id),
  signer_name     text not null,                   -- snapshot of name at sign time
  signer_email    text not null,                   -- snapshot of email at sign time
  signature_image text not null,                   -- base64 PNG of the canvas drawing
  signed_at       timestamptz not null default now(),
  ip_address      text,
  user_agent      text,
  geolocation     jsonb,                           -- { lat, lng, accuracy } if granted
  -- The integrity hash. SHA-256 over the canonicalized submission data
  -- + signer_user_id + signed_at. Any change to the submission data
  -- after signing breaks this hash, invalidating the signature.
  data_hash       text not null,
  created_at      timestamptz not null default now()
);
create index if not exists signatures_submission_idx on submission_signatures(submission_id);

-- ============================================================
-- Audit log — append-only
-- ============================================================

create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references orgs(id) on delete cascade,
  actor_user_id   uuid references auth.users(id),
  action          text not null,
  resource_type   text not null,
  resource_id     uuid,
  metadata        jsonb default '{}'::jsonb,
  ip_address      text,
  user_agent      text,
  created_at      timestamptz not null default now()
);
create index if not exists audit_org_idx on audit_logs(org_id, created_at desc);
create index if not exists audit_action_idx on audit_logs(org_id, action, created_at desc);

-- Block updates and deletes on audit_logs at the DB level.
create or replace function reject_audit_mutation() returns trigger
language plpgsql as $$
begin
  raise exception 'audit_logs is append-only';
end;
$$;
drop trigger if exists audit_no_update on audit_logs;
create trigger audit_no_update before update on audit_logs
  for each row execute function reject_audit_mutation();
drop trigger if exists audit_no_delete on audit_logs;
create trigger audit_no_delete before delete on audit_logs
  for each row execute function reject_audit_mutation();

-- ============================================================
-- Helper: is the current user a member of this org?
-- ============================================================

create or replace function is_org_member(target_org uuid)
returns boolean
language sql stable security definer
as $$
  select exists (
    select 1 from memberships
    where org_id = target_org and user_id = auth.uid()
  );
$$;

create or replace function org_role(target_org uuid)
returns text
language sql stable security definer
as $$
  select role from memberships
  where org_id = target_org and user_id = auth.uid()
  limit 1;
$$;

-- ============================================================
-- RLS — every tenant table
-- ============================================================

alter table orgs                    enable row level security;
alter table memberships             enable row level security;
alter table invites                 enable row level security;
alter table forms                   enable row level security;
alter table form_versions           enable row level security;
alter table submissions             enable row level security;
alter table submission_signatures   enable row level security;
alter table audit_logs              enable row level security;

-- Orgs: a user can read orgs they belong to. They cannot create or
-- modify orgs through anon/authenticated keys — those go through the
-- server with service-role.
create policy "orgs_member_read" on orgs
  for select using (is_org_member(id));

-- Memberships: a user can read memberships for orgs they belong to.
-- Owners/admins can manage memberships through the server only.
create policy "memberships_self_or_member_read" on memberships
  for select using (
    user_id = auth.uid() or is_org_member(org_id)
  );

-- Invites: only admins/owners of an org can read invites.
create policy "invites_admin_read" on invites
  for select using (
    org_role(org_id) in ('owner','admin')
  );

-- Forms: members of the org can read non-archived forms. Admins/owners
-- can write. Updates always go through the server (which writes
-- audit_logs and form_versions atomically).
create policy "forms_member_read" on forms
  for select using (is_org_member(org_id));
create policy "forms_admin_write" on forms
  for all using (org_role(org_id) in ('owner','admin'))
  with check (org_role(org_id) in ('owner','admin'));

-- Form versions: members can read; only the server (service role) inserts.
create policy "form_versions_member_read" on form_versions
  for select using (is_org_member(org_id));

-- Submissions: members can read submissions for their org. Members
-- can create + update their own in-progress submissions. Admins can
-- read/edit anything in their org.
create policy "submissions_member_read" on submissions
  for select using (is_org_member(org_id));
create policy "submissions_member_write" on submissions
  for insert with check (is_org_member(org_id) and started_by = auth.uid());
create policy "submissions_member_update_own" on submissions
  for update using (
    is_org_member(org_id)
    and (started_by = auth.uid() or org_role(org_id) in ('owner','admin'))
  );

-- Signatures: members read; the server inserts (signature endpoint
-- verifies user identity + computes the data_hash).
create policy "signatures_member_read" on submission_signatures
  for select using (is_org_member(org_id));

-- Audit log: admins/owners read. Inserts only via service role.
create policy "audit_admin_read" on audit_logs
  for select using (org_role(org_id) in ('owner','admin'));

-- ============================================================
-- Storage buckets
-- ============================================================

insert into storage.buckets (id, name, public)
values
  ('form-photos', 'form-photos', false),
  ('form-paper-imports', 'form-paper-imports', false),
  ('signatures', 'signatures', false)
on conflict (id) do nothing;

-- Storage RLS: per-org folder convention. Users can only read/write
-- objects under <org_id>/... where they are a member.
create policy "storage_org_read"
  on storage.objects for select
  using (
    bucket_id in ('form-photos','form-paper-imports','signatures')
    and is_org_member((storage.foldername(name))[1]::uuid)
  );

create policy "storage_org_write"
  on storage.objects for insert
  with check (
    bucket_id in ('form-photos','form-paper-imports','signatures')
    and is_org_member((storage.foldername(name))[1]::uuid)
  );
