-- Secret server-to-server keys (WordPress plugin, dashboard API).
-- Only a SHA-256 hash is stored; the plaintext (bw_sk_...) is shown once at
-- creation. key_prefix exists purely so the dashboard can display "bw_sk_ab12…".

create table api_keys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  name text not null,
  key_hash text not null unique,
  key_prefix text not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create index api_keys_client_id_idx on api_keys (client_id);
