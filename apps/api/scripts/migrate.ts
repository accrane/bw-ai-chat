/**
 * Applies supabase/migrations/*.sql in filename order against DATABASE_URL,
 * tracking applied versions in public.schema_migrations. Production runs this
 * instead of the Supabase CLI (plain Postgres — no supabase stack required).
 *
 * Local development keeps using `pnpm db:reset` (Supabase CLI); don't run
 * this against a database the CLI already migrated.
 */
import { existsSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { adminPool } from '../src/db/pool.js';

function migrationsDir(): string {
  if (process.env.MIGRATIONS_DIR) return process.env.MIGRATIONS_DIR;
  // Works from both scripts/ (tsx) and dist/scripts/ (compiled).
  const here = path.dirname(fileURLToPath(import.meta.url));
  for (const up of ['../../..', '../../../..']) {
    const candidate = path.resolve(here, up, 'supabase/migrations');
    if (existsSync(candidate)) return candidate;
  }
  throw new Error('supabase/migrations not found; set MIGRATIONS_DIR');
}

const dir = migrationsDir();
const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
if (files.length === 0) throw new Error(`no .sql files in ${dir}`);

const client = await adminPool.connect();
try {
  // Serialize concurrent deploys; second runner waits, then sees rows.
  await client.query('select pg_advisory_lock(748291)');
  await client.query(
    `create table if not exists public.schema_migrations (
       version text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const { rows } = await client.query<{ version: string }>(
    'select version from public.schema_migrations',
  );
  const applied = new Set(rows.map((r) => r.version));

  let ran = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = await readFile(path.join(dir, file), 'utf8');
    console.log(`applying ${file}`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public.schema_migrations (version) values ($1)', [version]);
      await client.query('commit');
    } catch (err) {
      await client.query('rollback');
      throw new Error(`migration ${file} failed: ${(err as Error).message}`, { cause: err });
    }
    ran += 1;
  }
  console.log(ran === 0 ? 'database is up to date.' : `applied ${ran} migration(s).`);
} finally {
  await client.query('select pg_advisory_unlock(748291)').catch(() => {});
  client.release();
  await adminPool.end();
}
