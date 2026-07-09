grant select, insert, update on conversations to app_api;
grant select, insert on messages to app_api;
grant select, insert, update on usage_counters to app_api;

alter table conversations enable row level security;
alter table conversations force row level security;
alter table messages enable row level security;
alter table messages force row level security;
alter table usage_counters enable row level security;
alter table usage_counters force row level security;

create policy conversations_tenant on conversations
  for all to app_api
  using (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy messages_tenant on messages
  for all to app_api
  using (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid);

create policy usage_counters_tenant on usage_counters
  for all to app_api
  using (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid)
  with check (client_id = nullif(current_setting('app.tenant_id', true), '')::uuid);
