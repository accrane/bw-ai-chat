import type pg from 'pg';
import { appPool } from './pool.js';

/**
 * Tenant scoping for every request-serving query. Each unit of work runs in a
 * transaction on the unprivileged pool with transaction-local settings that
 * the RLS policies read. Repositories only ever see the scoped client, so
 * forgetting a WHERE tenant_id clause cannot leak rows across tenants.
 */
export interface DbContext {
  /** Scope all tenant tables to this client. */
  tenantId?: string;
  /** Permit resolving one client row by slug (widget endpoints). */
  lookupSlug?: string;
  /** Permit resolving one api_keys row by hash (key authentication). */
  lookupKeyHash?: string;
}

export async function withDbContext<T>(
  ctx: DbContext,
  fn: (db: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await appPool.connect();
  try {
    await client.query('begin');
    await client.query(
      `select set_config('app.tenant_id', $1, true),
              set_config('app.lookup_slug', $2, true),
              set_config('app.lookup_key_hash', $3, true)`,
      [ctx.tenantId ?? '', ctx.lookupSlug ?? '', ctx.lookupKeyHash ?? ''],
    );
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
