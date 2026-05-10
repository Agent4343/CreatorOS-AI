-- FieldForm — submission handoff support.
-- Field workers often start a checklist, get pulled away, and need a
-- teammate to finish it (shift change, equipment failure, called to
-- a fire). Paper-clipboard semantics: anyone in the crew can pick up
-- the form and continue.

-- Track the last person who edited so the runner can show "Last
-- edited by Brad · 8 minutes ago" to the next worker picking it up.
alter table submissions
  add column if not exists last_edited_by uuid references auth.users(id),
  add column if not exists last_edited_at timestamptz;

-- Loosen the update policy: any org member (not just the starter or
-- an admin) can write to an in-progress submission. Identity is still
-- captured through last_edited_by + audit_logs, and signatures bind
-- the final state to specific signers, so the compliance trail isn't
-- weakened.
drop policy if exists "submissions_member_update_own" on submissions;
create policy "submissions_member_update" on submissions
  for update using (is_org_member(org_id));
