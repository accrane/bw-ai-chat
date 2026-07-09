-- Knowledge tables are read AND written under tenant context: the ingestion
-- worker runs through the same unprivileged role, so even worker bugs cannot
-- touch another tenant's knowledge base.

grant select, insert, update, delete on documents to app_api;
grant select, insert, update, delete on chunks to app_api;

alter table documents enable row level security;
alter table documents force row level security;
alter table chunks enable row level security;
alter table chunks force row level security;

create policy documents_tenant on documents
  for all to app_api
  using (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy chunks_tenant on chunks
  for all to app_api
  using (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

-- API-key auth stamps last_used_at in the same lookup query; only that column
-- is writable, and only on the row being authenticated.
grant update (last_used_at) on api_keys to app_api;

create policy api_keys_touch on api_keys
  for update to app_api
  using (key_hash = nullif(current_setting('app.lookup_key_hash', true), ''))
  with check (key_hash = nullif(current_setting('app.lookup_key_hash', true), ''));
