/**
 * Seeds the demo "whitewater" client (idempotent) and prints a secret API key
 * on first run. Uses the privileged connection — seeding is admin work.
 */
import { AiSettingsSchema, BrandingSchema } from '@bellaworks/shared';
import { adminPool } from '../src/db/pool.js';
import { generateApiKey } from '../src/lib/crypto.js';

const branding = BrandingSchema.parse({
  companyName: 'Whitewater',
  welcomeMessage: 'Welcome to Whitewater! Ask us anything about our services.',
  primaryColor: '#0e7490',
  secondaryColor: '#155e75',
});

// Low threshold suits the offline fake embeddings (lexical scores ~0.1);
// raise toward the 0.3 default when using real OpenAI embeddings.
const aiSettings = AiSettingsSchema.parse({ relevanceThreshold: 0.05 });

const allowedDomains = ['whitewater.com', 'www.whitewater.com', 'localhost', '127.0.0.1'];

const { rows } = await adminPool.query<{ id: string }>(
  `insert into clients (slug, name, status, allowed_domains, branding, ai_settings)
   values ($1, $2, 'active', $3, $4, $5)
   on conflict (slug) do update
     set name = excluded.name,
         allowed_domains = excluded.allowed_domains,
         branding = excluded.branding,
         ai_settings = excluded.ai_settings
   returning id`,
  ['whitewater', 'Whitewater Rafting Co.', allowedDomains, branding, aiSettings],
);
const clientId = rows[0]!.id;
console.log(`client "whitewater" ready (${clientId})`);
console.log(`allowed domains: ${allowedDomains.join(', ')}`);

const existing = await adminPool.query(
  `select key_prefix from api_keys where client_id = $1 and revoked_at is null`,
  [clientId],
);
if (existing.rows.length > 0) {
  console.log(`api key already exists (${existing.rows[0].key_prefix}…) — not creating another`);
} else {
  const { key, hash, prefix } = generateApiKey();
  await adminPool.query(
    `insert into api_keys (client_id, name, key_hash, key_prefix) values ($1, $2, $3, $4)`,
    [clientId, 'default', hash, prefix],
  );
  console.log('\nSecret API key (shown ONCE, store it now):');
  console.log(`  ${key}\n`);
}

await adminPool.end();
