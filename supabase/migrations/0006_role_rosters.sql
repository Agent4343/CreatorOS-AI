-- FieldForm — role rosters.
--
-- Heli admin and OIM (and Supervisor) are *positions*, not specific
-- people. There are many people who hold each role on rotating
-- shifts. Whoever's on duty when an induction happens runs it and
-- signs. Without role rosters, batch admins have to look up and
-- type fresh emails every batch — error prone, slow.
--
-- Model: each org maintains named roles, each with a roster of
-- members (email + display name). When starting a batch, instead
-- of typing a specific person's email, the admin assigns the
-- signature field to a role: "any Heli admin can sign Section 1."
--
-- The signature_assignments JSONB on submissions can now store one
-- of two shapes per field_id:
--   { email, name?, role? }                  -- specific person (legacy)
--   { kind: "role", role_id, role_label,     -- any roster member
--     member_emails: [...], member_names: {email: name} }
--
-- Why cache member_emails on the submission? Two reasons:
--   1. Lock checks and signature validation run in hot paths and
--      shouldn't have to JOIN against role rosters every time.
--   2. Determinism: a batch started today shouldn't quietly change
--      who can sign if you edit the roster tomorrow. The roster is
--      snapshotted at batch-start time. Edit the roster → only
--      future batches see the change.
--
-- Audit: roster changes are written to audit_logs by the application
-- layer (writeAudit). We don't add triggers — the app needs to know
-- the actor and we already write audits there.

create table if not exists org_roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references orgs(id) on delete cascade,
  name text not null,
  description text,
  -- Members stored as a JSONB array of {email, name?}. Email is
  -- always lowercased. We use jsonb instead of a separate join table
  -- because (a) member counts are small (typically <30 per role),
  -- (b) no relational queries against members are needed, and (c)
  -- single-row reads are simpler.
  members jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique (org_id, name)
);

create index if not exists org_roles_org_idx on org_roles(org_id);

alter table org_roles enable row level security;

-- Read: any member of the org can list its roles (they need to see
-- the role labels in the UI even if they're not admins).
drop policy if exists org_roles_read on org_roles;
create policy org_roles_read on org_roles
  for select using (
    exists (
      select 1 from memberships
      where memberships.org_id = org_roles.org_id
        and memberships.user_id = auth.uid()
    )
  );

-- Write: only org admins can mutate the roster. Same pattern as
-- other admin-only mutations elsewhere in the schema.
drop policy if exists org_roles_admin_write on org_roles;
create policy org_roles_admin_write on org_roles
  for all using (
    exists (
      select 1 from memberships
      where memberships.org_id = org_roles.org_id
        and memberships.user_id = auth.uid()
        and memberships.role = 'admin'
    )
  );
