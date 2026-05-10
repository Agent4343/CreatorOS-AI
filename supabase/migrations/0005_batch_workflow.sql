-- FieldForm — batch workflow: bulk-start submissions and route them
-- through a chain of named signers.
--
-- Use case: an induction session for 5+ workers. Heli admin creates
-- one batch ("Hebron Induction · May 10, 2026") with 5 inductees and
-- assigns each signature field to a specific person/role:
--   heli_admin_sig   → brad@hebron
--   oim_sig          → ash@hebron
--   supervisor_sig   → sam@hebron
--   inductee_sig     → <one per inductee>
-- The system creates 5 submissions sharing a batch_id. Each signer
-- sees "Waiting on you" submissions in their inbox; sign route
-- refuses if the signer isn't the assignee for that field.

alter table submissions
  -- Groups submissions started together (one per inductee in a batch).
  -- Null for ad-hoc submissions; a UUID shared across all submissions
  -- in the same batch.
  add column if not exists batch_id uuid,

  -- Maps signature field_id → {email, role, name?}. The sign route
  -- enforces that the signer's email matches assignments[field_id].email
  -- before accepting the signature. Empty default means open-clipboard
  -- semantics for legacy submissions (anyone in the org can sign anything).
  add column if not exists signature_assignments jsonb not null default '{}'::jsonb;

create index if not exists submissions_batch_idx
  on submissions(batch_id) where batch_id is not null;

-- Optional but cheap: GIN index lets the "Waiting on you" inbox query
-- efficiently filter by assignee email. The inbox query looks like:
--   where signature_assignments @> jsonb_build_object(<field_id>, jsonb_build_object('email', <user_email>))
create index if not exists submissions_assignments_idx
  on submissions using gin (signature_assignments);
