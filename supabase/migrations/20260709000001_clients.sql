-- Tenant registry. `slug` is the public widget ID embedded on client sites;
-- branding/ai_settings are jsonb validated by zod schemas in @bw-ai-chat/shared.

create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table clients (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,62}$'),
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused')),
  allowed_domains text[] not null default '{}',
  branding jsonb not null default '{}'::jsonb,
  ai_settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger clients_touch_updated_at
  before update on clients
  for each row execute function touch_updated_at();
