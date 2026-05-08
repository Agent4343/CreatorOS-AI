-- Reel — Phase 1 schema

create extension if not exists "pgcrypto";

create table if not exists characters (
  id                       uuid primary key default gen_random_uuid(),
  user_id                  uuid not null references auth.users(id) on delete cascade,
  name                     text not null,
  reference_image_url      text not null,
  voice_provider           text not null default 'elevenlabs',
  voice_id                 text not null,
  voice_stability          real not null default 0.5,
  voice_similarity_boost   real not null default 0.75,
  persona                  jsonb not null,
  aspect_ratio             text not null default '9:16',
  target_duration_sec      int not null default 30,
  created_at               timestamptz not null default now()
);
create index if not exists characters_user_idx on characters(user_id, created_at desc);

create table if not exists clips (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  character_id    uuid not null references characters(id) on delete cascade,
  topic           text not null,
  status          text not null default 'queued'
                  check (status in ('queued','scripting','voicing','rendering','done','failed')),
  script          jsonb,
  audio_url       text,
  video_url       text,
  hedra_job_id    text,
  error           text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz
);
create index if not exists clips_user_idx on clips(user_id, created_at desc);
create index if not exists clips_status_idx on clips(status, created_at);

-- Storage bucket for audio + video assets. Created here so the app
-- doesn't have to bootstrap it on first run.
insert into storage.buckets (id, name, public)
values ('clip-assets', 'clip-assets', true)
on conflict (id) do nothing;

-- RLS
alter table characters enable row level security;
alter table clips      enable row level security;

create policy "characters self read"
  on characters for select using (user_id = auth.uid());
create policy "characters self write"
  on characters for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "clips self read"
  on clips for select using (user_id = auth.uid());
create policy "clips self write"
  on clips for all using (user_id = auth.uid()) with check (user_id = auth.uid());
