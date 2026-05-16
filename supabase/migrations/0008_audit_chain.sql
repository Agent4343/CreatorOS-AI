-- FieldForm — audit log integrity: per-org hash chain + DB-level
-- immutability.
--
-- Threat we're closing: an attacker (or a curious admin) with
-- database access could UPDATE or DELETE rows in audit_logs and
-- erase their tracks. Today the audit log is a regular table; the
-- service-role client can rewrite it freely.
--
-- Two layers of defence:
--
--   1. Revoke UPDATE and DELETE on audit_logs from every role.
--      Inserts still work (service-role client uses INSERT). A row,
--      once written, cannot be modified through normal SQL paths.
--      Postgres superuser can still bypass — that's the threat
--      model boundary we accept (someone with cluster admin can
--      always destroy data).
--
--   2. Hash-chain rows per org. Each row stores hash_prev (the
--      previous row's hash_self in the same org) and hash_self
--      (SHA-256 over hash_prev + row content). Tampering becomes
--      detectable by recomputing the chain — any altered row
--      breaks the chain forward of itself.
--
--      Computed by a BEFORE INSERT trigger so the app can't lie
--      about either value. The trigger reads the latest row for
--      this org under SERIALIZABLE-style locking to prevent two
--      concurrent inserts both claiming the same hash_prev.

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
  -- Lock the org's audit_logs rows briefly so two concurrent
  -- inserts can't both observe the same "previous" hash. The
  -- FOR UPDATE on the parent table (a no-op for non-locking
  -- readers) is enough to serialize inserts within an org.
  select hash_self
    into prev_hash
    from audit_logs
   where org_id = new.org_id
   order by created_at desc, id desc
   limit 1
   for update;

  new.hash_prev := coalesce(prev_hash, '');

  -- Canonical payload: structural fields only. Metadata is omitted
  -- because Postgres jsonb's text representation isn't guaranteed
  -- to be byte-identical across servers/versions (key order is
  -- implementation-defined). Including it would produce spurious
  -- chain breaks on backups/replicas. Tampering with the metadata
  -- jsonb without breaking REVOKE is still impossible via SQL; the
  -- chain catches tampering of the structural fields (who did what,
  -- when, to which resource).
  payload := concat_ws('|',
    new.org_id::text,
    coalesce(new.actor_user_id::text, ''),
    new.action,
    new.resource_type,
    coalesce(new.resource_id::text, ''),
    coalesce(new.ip_address, ''),
    coalesce(new.user_agent, ''),
    -- ISO 8601 with millisecond precision in UTC so the verifier
    -- (Node.js, using Date.toISOString()) produces a byte-identical
    -- string. Postgres' default ::text representation is
    -- locale/version-dependent — don't trust it for hashing.
    to_char(coalesce(new.created_at, now()) at time zone 'UTC',
            'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    new.hash_prev
  );

  new.hash_self := encode(digest(payload, 'sha256'), 'hex');
  return new;
end;
$$;

-- pgcrypto provides digest(). Standard on Supabase but harmless to
-- declare here too.
create extension if not exists pgcrypto;

drop trigger if exists audit_logs_chain_insert_trg on audit_logs;
create trigger audit_logs_chain_insert_trg
before insert on audit_logs
for each row
execute function audit_logs_chain_insert();

-- Immutability. After this, even the service-role client gets
-- "permission denied" if it tries to UPDATE or DELETE an audit row.
revoke update, delete on audit_logs from anon, authenticated, service_role;
