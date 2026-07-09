import type { NextFunction, Request, Response } from 'express';
import { withDbContext } from '../db/context.js';
import { hashApiKey } from '../lib/crypto.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface AuthedTenant {
  clientId: string;
}

export const authedTenant = (res: Response): AuthedTenant =>
  (res.locals as { tenant: AuthedTenant }).tenant;

/**
 * Server-to-server auth: `Authorization: Bearer bw_sk_…`. The single lookup
 * query also stamps last_used_at (the only column app_api may update, on the
 * only row the RLS lookup policy exposes).
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    throw unauthorized('missing_api_key', 'Provide an API key: Authorization: Bearer bw_sk_…');
  }
  const key = header.slice('Bearer '.length).trim();
  if (!key.startsWith('bw_sk_')) {
    throw unauthorized('invalid_api_key', 'API keys start with bw_sk_.');
  }

  const keyHash = hashApiKey(key);
  const keyRow = await withDbContext({ lookupKeyHash: keyHash }, async (db) => {
    const { rows } = await db.query<{ client_id: string }>(
      `update api_keys set last_used_at = now()
        where key_hash = $1 and revoked_at is null
       returning client_id`,
      [keyHash],
    );
    return rows[0] ?? null;
  });
  if (!keyRow) throw unauthorized('invalid_api_key', 'Unknown or revoked API key.');

  const client = await withDbContext({ tenantId: keyRow.client_id }, async (db) => {
    const { rows } = await db.query<{ status: string }>(
      `select status from clients where id = $1`,
      [keyRow.client_id],
    );
    return rows[0] ?? null;
  });
  if (!client) throw unauthorized('invalid_api_key', 'Unknown or revoked API key.');
  if (client.status !== 'active') throw forbidden('client_paused', 'This client is paused.');

  (res.locals as { tenant?: AuthedTenant }).tenant = { clientId: keyRow.client_id };
  next();
}
