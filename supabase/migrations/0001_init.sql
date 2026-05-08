-- Reel — single-user schema
-- Single-user mode: no auth.users dependency, no RLS. The app is gated
-- by APP_PASSWORD at the middleware layer, not at the DB layer.

create extension if not exists "pgcrypto";

create table if not exists characters (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null,
  name                     text not null,
  reference_image_url      text not null,
  voice_provider           text not null default 'elevenlabs',
  voice_id                 text not null,
  voice_stability          real not null default 0.5,
  voice_similarity_boost   real not null default 0.75,
  persona                  jsonb not null,
  aspect_ratio             text not null default '16:9',
  target_duration_sec      int not null default 600,
  created_at               timestamptz not null default now()
);
create index if not exists characters_created_idx on characters(created_at desc);

create table if not exists clips (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null,
  character_id        uuid not null references characters(id) on delete cascade,
  topic               text not null,
  status              text not null default 'queued'
                      check (status in ('queued','scripting','voicing','rendering','done','failed')),
  script              jsonb,
  audio_url           text,
  video_url           text,
  provider_job_id     text,
  error               text,
  created_at          timestamptz not null default now(),
  completed_at        timestamptz
);
create index if not exists clips_created_idx on clips(created_at desc);
create index if not exists clips_status_idx on clips(status, created_at);

-- Storage bucket for audio + video assets.
insert into storage.buckets (id, name, public)
values ('clip-assets', 'clip-assets', true)
on conflict (id) do nothing;

-- No RLS in single-user mode — middleware gates the whole app.
-- If you ever flip this to multi-tenant, re-enable RLS:
--   alter table characters enable row level security;
--   alter table clips      enable row level security;
-- and add policies keyed off auth.uid().
