-- Stripe subscription tracking

create table if not exists subscriptions (
  id                       uuid primary key default gen_random_uuid(),
  creator_id               uuid not null unique references creators(id) on delete cascade,
  stripe_customer_id       text not null,
  stripe_subscription_id   text,
  tier                     text,
  status                   text not null default 'incomplete',
  current_period_end       timestamptz,
  updated_at               timestamptz not null default now()
);
create index if not exists subscriptions_customer_idx on subscriptions(stripe_customer_id);

alter table subscriptions enable row level security;

create policy "subscriptions self read"
  on subscriptions for select using (
    creator_id in (select id from creators where user_id = auth.uid())
  );
-- Writes happen only via the service role from /api/stripe/webhook.
