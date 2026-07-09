-- Dashboard users (Bellaworks staff). Fully separate from widget sessions and
-- client API keys; admin operations run on the privileged connection, so no
-- app_api grants and no RLS here.

create table admins (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text not null default '',
  password_hash text not null,
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);
