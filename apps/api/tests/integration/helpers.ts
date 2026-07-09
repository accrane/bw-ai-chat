import { randomUUID } from 'node:crypto';
import { adminPool } from '../../src/db/pool.js';

export interface TestClient {
  id: string;
  slug: string;
}

/** Inserts a throwaway client via the privileged pool; caller cleans up with deleteTestClient. */
export async function createTestClient(overrides?: {
  allowedDomains?: string[];
  status?: 'active' | 'paused';
  branding?: Record<string, unknown>;
  aiSettings?: Record<string, unknown>;
}): Promise<TestClient> {
  const slug = `test-${randomUUID().slice(0, 8)}`;
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into clients (slug, name, status, allowed_domains, branding, ai_settings)
     values ($1, $2, $3, $4, $5, $6) returning id`,
    [
      slug,
      `Test ${slug}`,
      overrides?.status ?? 'active',
      overrides?.allowedDomains ?? ['example.com', 'localhost'],
      overrides?.branding ?? {},
      overrides?.aiSettings ?? {},
    ],
  );
  return { id: rows[0]!.id, slug };
}

export async function deleteTestClient(id: string): Promise<void> {
  await adminPool.query('delete from clients where id = $1', [id]);
}
