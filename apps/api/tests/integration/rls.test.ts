import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { withDbContext } from '../../src/db/context.js';
import { adminPool, closePools } from '../../src/db/pool.js';
import { createTestClient, deleteTestClient, type TestClient } from './helpers.js';

/**
 * Proves the row-level-security backstop: the unprivileged app_api role can
 * only see rows matching the transaction-local tenant context — even when the
 * query itself has no WHERE clause at all (the "buggy query" case).
 */

let a: TestClient;
let b: TestClient;

beforeAll(async () => {
  a = await createTestClient();
  b = await createTestClient();
  await adminPool.query(
    `insert into api_keys (client_id, name, key_hash, key_prefix)
     values ($1, 'a-key', 'hash-a', 'bw_sk_aaaaaa'), ($2, 'b-key', 'hash-b', 'bw_sk_bbbbbb')`,
    [a.id, b.id],
  );
});

afterAll(async () => {
  await deleteTestClient(a.id);
  await deleteTestClient(b.id);
  await closePools();
});

describe('row-level security', () => {
  it('returns nothing without any tenant context', async () => {
    const rows = await withDbContext({}, async (db) => {
      const res = await db.query('select id from clients');
      return res.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('an unscoped SELECT sees only the current tenant', async () => {
    const rows = await withDbContext({ tenantId: a.id }, async (db) => {
      const res = await db.query<{ id: string }>('select id from clients'); // no WHERE
      return res.rows;
    });
    expect(rows.map((r) => r.id)).toEqual([a.id]);
  });

  it('tenant A cannot read tenant B by primary key', async () => {
    const rows = await withDbContext({ tenantId: a.id }, async (db) => {
      const res = await db.query('select id from clients where id = $1', [b.id]);
      return res.rows;
    });
    expect(rows).toHaveLength(0);
  });

  it('api_keys are scoped to the tenant, even unfiltered', async () => {
    const rows = await withDbContext({ tenantId: a.id }, async (db) => {
      const res = await db.query<{ name: string }>('select name from api_keys'); // no WHERE
      return res.rows;
    });
    expect(rows.map((r) => r.name)).toEqual(['a-key']);
  });

  it('slug lookup exposes exactly one row', async () => {
    const rows = await withDbContext({ lookupSlug: a.slug }, async (db) => {
      const res = await db.query<{ slug: string }>('select slug from clients');
      return res.rows;
    });
    expect(rows.map((r) => r.slug)).toEqual([a.slug]);
  });

  it('app_api cannot write to tenant tables at all', async () => {
    await expect(
      withDbContext({ tenantId: a.id }, (db) =>
        db.query(`update clients set name = 'hacked' where id = $1`, [a.id]),
      ),
    ).rejects.toThrow(/permission denied/i);
  });

  it('sanity: the privileged connection sees both tenants', async () => {
    const res = await adminPool.query('select id from clients where id = any($1)', [[a.id, b.id]]);
    expect(res.rows).toHaveLength(2);
  });
});
