-- Row-level security: the API serves requests as the unprivileged `app_api`
-- role, and every query is scoped by transaction-local settings
-- (app.tenant_id / app.lookup_slug / app.lookup_key_hash) set once per
-- request by the API's db context helper. Even a buggy query cannot cross
-- tenants. Admin/seed/migration work uses the privileged connection instead.
--
-- `app_api` is created NOLOGIN here (roles are cluster-level and survive
-- `supabase db reset`, hence the guard); `pnpm db:role` grants LOGIN with a
-- password from the environment.

do $$
begin
  if not exists (select from pg_roles where rolname = 'app_api') then
    create role app_api nologin;
  end if;
end;
$$;

grant usage on schema public to app_api;
grant select on clients to app_api;
grant select on api_keys to app_api;

alter table clients enable row level security;
alter table clients force row level security;
alter table api_keys enable row level security;
alter table api_keys force row level security;

-- Root tenant table: visible either as the current tenant, or via a one-shot
-- slug lookup (how the widget endpoints resolve client-id before a tenant
-- context exists).
create policy clients_read on clients
  for select to app_api
  using (
    id = nullif(current_setting('app.tenant_id', true), '')::uuid
    or slug = nullif(current_setting('app.lookup_slug', true), '')
  );

-- Child table: scoped by tenant, plus a hash lookup used by API-key
-- authentication (Phase 5+).
create policy api_keys_read on api_keys
  for select to app_api
  using (
    client_id = nullif(current_setting('app.tenant_id', true), '')::uuid
    or key_hash = nullif(current_setting('app.lookup_key_hash', true), '')
  );
