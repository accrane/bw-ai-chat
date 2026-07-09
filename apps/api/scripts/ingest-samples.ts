/**
 * Phase 2 demo: ingests sample knowledge for the seeded "whitewater" client
 * through the real pipeline (queue → worker → chunks → embeddings), then runs
 * a search and prints the ranked results.
 */
import { adminPool } from '../src/db/pool.js';
import { ingestDocument, searchKnowledge } from '../src/modules/knowledge/service.js';
import { startQueue, stopQueue } from '../src/queue/queue.js';
import { registerIngestWorker } from '../src/queue/worker.js';
import { withDbContext } from '../src/db/context.js';

const SAMPLES = [
  {
    sourceType: 'markdown' as const,
    sourceId: 'sample-faq',
    title: 'Rafting FAQ',
    url: 'https://whitewater.com/faq',
    content: `# Trips

We offer half-day and full-day whitewater rafting trips on the Chattooga river, from March through October.

## Pricing

Half-day trips cost $89 per person. Full-day trips cost $149 per person and include a riverside lunch. Groups of 8 or more receive a 10% discount.

## What to bring

Bring a swimsuit, sunscreen, and water shoes. We provide helmets, paddles, life jackets, and wetsuits in colder months.`,
  },
  {
    sourceType: 'markdown' as const,
    sourceId: 'sample-policies',
    title: 'Booking & Cancellation Policies',
    url: 'https://whitewater.com/policies',
    content: `# Cancellations

Cancel at least 48 hours before your trip for a full refund. Cancellations within 48 hours receive a rain check valid for one year. No-shows are not refunded.

# Weather

Trips run rain or shine. If the river is unsafe, we cancel and refund everyone in full.`,
  },
  {
    sourceType: 'markdown' as const,
    sourceId: 'sample-safety',
    title: 'Safety Requirements',
    url: 'https://whitewater.com/safety',
    content: `# Safety

All guests must be at least 8 years old and able to swim. Helmets and life jackets are mandatory on the water. Guests under 18 need a guardian's signature on the waiver.`,
  },
];

const { rows } = await adminPool.query<{ id: string }>(
  `select id from clients where slug = 'whitewater'`,
);
const clientId = rows[0]?.id;
if (!clientId) {
  console.error('Seed the whitewater client first: pnpm seed');
  process.exit(1);
}

await startQueue();
await registerIngestWorker();

for (const sample of SAMPLES) {
  const { document, queued } = await ingestDocument(clientId, sample);
  console.log(`${queued ? 'queued' : 'unchanged'}: ${document.title} (${document.id})`);
}

// wait for the worker to drain
for (;;) {
  const pending = await withDbContext({ tenantId: clientId }, async (db) => {
    const res = await db.query<{ n: string }>(
      `select count(*) as n from documents where status in ('pending','processing')`,
    );
    return Number(res.rows[0]!.n);
  });
  if (pending === 0) break;
  await new Promise((r) => setTimeout(r, 300));
}
console.log('\nall documents processed. searching: "how do refunds work if I cancel?"\n');

const results = await searchKnowledge(clientId, 'how do refunds work if I cancel?', 4, 0);
for (const r of results) {
  const path = r.headingPath.length ? ` › ${r.headingPath.join(' › ')}` : '';
  console.log(`  ${r.score.toFixed(3)}  ${r.title}${path}`);
  console.log(`         ${r.content.split('\n')[0]!.slice(0, 90)}…\n`);
}

await stopQueue();
await adminPool.end();
process.exit(0);
