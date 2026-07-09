-- Knowledge base: documents (raw ingested content) and chunks (embedded
-- retrieval units). Raw text is kept on the document so re-chunking and
-- re-embedding never need the original source again.

create extension if not exists vector;

create table documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id) on delete cascade,
  source_type text not null
    check (source_type in ('manual', 'markdown', 'text', 'pdf', 'docx', 'wordpress')),
  source_id text not null,
  title text not null,
  url text,
  content text not null,
  content_hash text not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'ready', 'failed')),
  error text,
  token_count integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One document per external identity per client (e.g. a WordPress post id);
-- re-syncs update in place instead of duplicating.
create unique index documents_identity_idx
  on documents (client_id, source_type, source_id);
create index documents_client_id_idx on documents (client_id);

create trigger documents_touch_updated_at
  before update on documents
  for each row execute function touch_updated_at();

create table chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references documents (id) on delete cascade,
  -- Denormalized so RLS and vector search need no join to scope by tenant.
  client_id uuid not null references clients (id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  heading_path text[] not null default '{}',
  content_hash text not null,
  token_count integer not null,
  embedding vector(1536) not null,
  embedding_model text not null,
  created_at timestamptz not null default now()
);

create index chunks_document_id_idx on chunks (document_id);
create index chunks_client_id_idx on chunks (client_id);
create index chunks_embedding_idx on chunks using hnsw (embedding vector_cosine_ops);
