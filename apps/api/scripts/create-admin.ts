/** Creates or updates a dashboard admin: pnpm create-admin <email> <password> [name] */
import { adminPool } from '../src/db/pool.js';
import { hashPassword } from '../src/lib/password.js';

const [email, password, name = ''] = process.argv.slice(2);
if (!email || !password) {
  console.error('usage: pnpm create-admin <email> <password> [name]');
  process.exit(1);
}
if (password.length < 10) {
  console.error('password must be at least 10 characters');
  process.exit(1);
}

const hash = await hashPassword(password);
await adminPool.query(
  `insert into admins (email, name, password_hash) values (lower($1), $2, $3)
   on conflict (email) do update set password_hash = excluded.password_hash, name = excluded.name`,
  [email, name, hash],
);
console.log(`admin ready: ${email}`);
await adminPool.end();
