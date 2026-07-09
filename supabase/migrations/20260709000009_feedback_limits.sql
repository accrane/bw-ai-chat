-- Visitor feedback on assistant messages (+1 / -1), and the shared
-- fixed-window rate-limit counters that replace the in-memory limiter so
-- limits hold across multiple API instances.

alter table messages
  add column rating smallint check (rating in (-1, 1));

-- app_api may flip exactly one column, on rows its tenant policy exposes.
grant update (rating) on messages to app_api;

-- Operational data, not tenant data: keys are scoped strings
-- (e.g. "chat:<session>", "login:<ip>"). Cleaned up by the maintenance job.
create table rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null
);

grant select, insert, update, delete on rate_limits to app_api;
