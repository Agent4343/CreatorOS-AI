-- FieldForm — billing fields on orgs.
-- Per BIBLE §9: per-user/month pricing. Stripe handles the
-- subscription lifecycle; we mirror just the fields we need to gate
-- access and show plan state in the UI.

alter table orgs
  add column if not exists stripe_customer_id     text,
  add column if not exists stripe_subscription_id text,
  add column if not exists subscription_status    text,
  add column if not exists current_period_end     timestamptz,
  add column if not exists seats                  int;

create index if not exists orgs_stripe_customer_idx
  on orgs(stripe_customer_id);
create index if not exists orgs_stripe_subscription_idx
  on orgs(stripe_subscription_id);
