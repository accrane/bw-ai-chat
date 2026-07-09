/**
 * Grants LOGIN to the app_api role using APP_DB_PASSWORD. Run once after
 * `pnpm db:start` / `pnpm db:reset` (migrations create the role NOLOGIN so no
 * password ever lives in checked-in SQL).
 */
import { adminPool } from '../src/db/pool.js';

const password = process.env.APP_DB_PASSWORD;
if (!password) {
  console.error('APP_DB_PASSWORD is not set');
  process.exit(1);
}

const client = await adminPool.connect();
try {
  // Identifier can't be parameterized; it's a constant. The password literal
  // is escaped via quote_literal to be safe.
  await client.query(
    `do $$ begin execute format('alter role app_api with login password %L', $bw$${password}$bw$); end $$;`,
  );
  console.log('app_api role can now log in.');
} finally {
  client.release();
  await adminPool.end();
}
