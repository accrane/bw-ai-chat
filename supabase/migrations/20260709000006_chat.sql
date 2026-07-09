-- Conversations and messages. A conversation belongs to one widget session
-- (the session_id minted with the widget JWT); messages record the retrieval
-- audit trail (source_chunk_ids), token usage, and whether the question was
-- answerable — the raw material for Phase 7 analytics.

create table conversations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  session_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index conversations_client_session_idx on conversations (client_id, session_id);

create trigger conversations_touch_updated_at
  before update on conversations
  for each row execute function touch_updated_at();

create table messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references conversations (id) on delete cascade,
  client_id uuid not null references clients (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source_chunk_ids uuid[] not null default '{}',
  input_tokens integer,
  output_tokens integer,
  model text,
  latency_ms integer,
  answered boolean not null default true,
  created_at timestamptz not null default now()
);

create index messages_conversation_idx on messages (conversation_id, created_at);
create index messages_client_idx on messages (client_id, created_at);

-- One cheap row per client per month makes budget enforcement a single read
-- instead of aggregating the messages table on every chat request.
create table usage_counters (
  client_id uuid not null references clients (id) on delete cascade,
  month date not null,
  tokens bigint not null default 0,
  primary key (client_id, month)
);
