-- CreatorOS AI — Phase 1 schema
-- Run with: supabase db push  (or paste into Supabase SQL editor)

create extension if not exists "pgcrypto";

create table if not exists creators (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null unique references auth.users(id) on delete cascade,
  display_name  text,
  niche         text,
  created_at    timestamptz not null default now()
);

create table if not exists voice_profiles (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  profile     jsonb not null,
  version     int not null default 1,
  created_at  timestamptz not null default now()
);
create index if not exists voice_profiles_creator_idx
  on voice_profiles(creator_id, created_at desc);

create table if not exists source_content (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  body        text not null,
  kind        text not null default 'pasted',
  created_at  timestamptz not null default now()
);
create index if not exists source_content_creator_idx
  on source_content(creator_id, created_at desc);

create table if not exists workflows (
  id          uuid primary key default gen_random_uuid(),
  creator_id  uuid not null references creators(id) on delete cascade,
  name        text not null,
  recipe      jsonb not null,
  created_at  timestamptz not null default now()
);

create table if not exists generations (
  id                uuid primary key default gen_random_uuid(),
  creator_id        uuid not null references creators(id) on delete cascade,
  source_id         uuid references source_content(id) on delete set null,
  voice_profile_id  uuid references voice_profiles(id) on delete set null,
  assets            jsonb not null,
  approved          boolean not null default false,
  created_at        timestamptz not null default now()
);
create index if not exists generations_creator_idx
  on generations(creator_id, created_at desc);

-- Row Level Security
alter table creators        enable row level security;
alter table voice_profiles  enable row level security;
alter table source_content  enable row level security;
alter table workflows       enable row level security;
alter table generations     enable row level security;

create policy "creators self read"
  on creators for select using (user_id = auth.uid());

create policy "creators self write"
  on creators for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "voice_profiles by creator"
  on voice_profiles for all using (
    creator_id in (select id from creators where user_id = auth.uid())
  );

create policy "source_content by creator"
  on source_content for all using (
    creator_id in (select id from creators where user_id = auth.uid())
  );

create policy "workflows by creator"
  on workflows for all using (
    creator_id in (select id from creators where user_id = auth.uid())
  );

create policy "generations by creator"
  on generations for all using (
    creator_id in (select id from creators where user_id = auth.uid())
  );
