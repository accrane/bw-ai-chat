import pg from 'pg';
import { env } from '../config/env.js';

/** Privileged pool: seed scripts, admin operations. Never serves requests. */
export const adminPool = new pg.Pool({ connectionString: env.DATABASE_URL, max: 5 });

/** Unprivileged pool (app_api role, RLS enforced): all request handling. */
export const appPool = new pg.Pool({ connectionString: env.APP_DATABASE_URL, max: 10 });

export async function closePools(): Promise<void> {
  await Promise.allSettled([adminPool.end(), appPool.end()]);
}
