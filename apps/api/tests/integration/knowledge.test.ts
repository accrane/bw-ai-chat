import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { adminPool, closePools } from '../../src/db/pool.js';
import { generateApiKey } from '../../src/lib/crypto.js';
import { startQueue, stopQueue } from '../../src/queue/queue.js';
import { registerIngestWorker } from '../../src/queue/worker.js';
import { createTestClient, deleteTestClient, type TestClient } from './helpers.js';

const app = createApp();

let clientA: TestClient;
let clientB: TestClient;
let keyA: string;
let keyB: string;

async function createKey(clientId: string): Promise<string> {
  const { key, hash, prefix } = generateApiKey();
  await adminPool.query(
    `insert into api_keys (client_id, name, key_hash, key_prefix) values ($1, 'test', $2, $3)`,
    [clientId, hash, prefix],
  );
  return key;
}

async function waitForStatus(
  key: string,
  documentId: string,
  wanted: string,
  timeoutMs = 15_000,
): Promise<void> {
  const start = Date.now();
  for (;;) {
    const res = await request(app)
      .get(`/v1/knowledge/documents/${documentId}`)
      .set('Authorization', `Bearer ${key}`);
    const status = res.body.document?.status;
    if (status === wanted) return;
    if (status === 'failed') throw new Error(`document failed: ${res.body.document.error}`);
    if (Date.now() - start > timeoutMs) throw new Error(`timed out waiting for ${wanted}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

// Each section must clear the chunker's 200-token minimum so the document
// splits into one chunk per section — the delta-sync test depends on that.
const pad = (topic: string): string =>
  Array.from(
    { length: 14 },
    (_, i) =>
      `Additional detail ${i} about ${topic}: our guides have years of experience running this section of the river and are happy to answer questions before you book.`,
  ).join(' ');

const FAQ_MD = `# Trips

We offer half-day and full-day whitewater rafting trips on the Chattooga river. ${pad('trips')}

## Pricing

Half-day trips cost $89 per person. Full-day trips cost $149 per person and include lunch. ${pad('pricing')}

## Cancellations

Cancel at least 48 hours in advance for a full refund. Later cancellations receive a rain check. ${pad('cancellations')}`;

beforeAll(async () => {
  await startQueue();
  await registerIngestWorker();
  clientA = await createTestClient();
  clientB = await createTestClient();
  keyA = await createKey(clientA.id);
  keyB = await createKey(clientB.id);
});

afterAll(async () => {
  await stopQueue();
  await deleteTestClient(clientA.id);
  await deleteTestClient(clientB.id);
  await closePools();
});

describe('knowledge auth', () => {
  it('rejects requests without a key', async () => {
    const res = await request(app).get('/v1/knowledge/documents');
    expect(res.status).toBe(401);
  });

  it('rejects unknown keys', async () => {
    const res = await request(app)
      .get('/v1/knowledge/documents')
      .set('Authorization', 'Bearer bw_sk_definitely-not-real-000000000000');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_api_key');
  });
});

describe('ingest → process → search', () => {
  let documentId: string;

  it('accepts a document and processes it to ready', async () => {
    const res = await request(app)
      .post('/v1/knowledge/documents')
      .set('Authorization', `Bearer ${keyA}`)
      .send({ sourceType: 'markdown', sourceId: 'faq', title: 'Rafting FAQ', content: FAQ_MD });
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(true);
    documentId = res.body.document.id;

    await waitForStatus(keyA, documentId, 'ready');

    const { rows } = await adminPool.query(
      `select count(*)::int as n from chunks where document_id = $1`,
      [documentId],
    );
    expect(rows[0].n).toBeGreaterThan(0);
  });

  it('re-ingesting identical content queues nothing', async () => {
    const res = await request(app)
      .post('/v1/knowledge/documents')
      .set('Authorization', `Bearer ${keyA}`)
      .send({ sourceType: 'markdown', sourceId: 'faq', title: 'Rafting FAQ', content: FAQ_MD });
    expect(res.status).toBe(202);
    expect(res.body.queued).toBe(false);
    expect(res.body.document.id).toBe(documentId);
    expect(res.body.document.status).toBe('ready');
  });

  it('changed content re-embeds only the changed chunk', async () => {
    const before = await adminPool.query(
      `select id from chunks where document_id = $1 order by chunk_index`,
      [documentId],
    );
    const res = await request(app)
      .post('/v1/knowledge/documents')
      .set('Authorization', `Bearer ${keyA}`)
      .send({
        sourceType: 'markdown',
        sourceId: 'faq',
        title: 'Rafting FAQ',
        content: FAQ_MD.replace('$149', '$159'),
      });
    expect(res.body.queued).toBe(true);
    await waitForStatus(keyA, documentId, 'ready');

    const after = await adminPool.query(
      `select id from chunks where document_id = $1 order by chunk_index`,
      [documentId],
    );
    // unchanged chunks keep their ids (were not re-embedded)
    const beforeIds = new Set(before.rows.map((r) => r.id));
    const surviving = after.rows.filter((r) => beforeIds.has(r.id));
    expect(surviving.length).toBeGreaterThan(0);
    expect(surviving.length).toBeLessThan(after.rows.length);
  });

  it('search returns relevant ranked chunks', async () => {
    const res = await request(app)
      .post('/v1/knowledge/search')
      .set('Authorization', `Bearer ${keyA}`)
      .send({ query: 'cancel refund policy', limit: 3 });
    expect(res.status).toBe(200);
    expect(res.body.results.length).toBeGreaterThan(0);
    expect(res.body.results[0].content.toLowerCase()).toContain('refund');
    expect(res.body.results[0].score).toBeGreaterThan(0);
    expect(res.body.results[0].title).toBe('Rafting FAQ');
  });

  it("search never returns another tenant's chunks", async () => {
    const res = await request(app)
      .post('/v1/knowledge/search')
      .set('Authorization', `Bearer ${keyB}`)
      .send({ query: 'cancel refund policy rafting trips' });
    expect(res.status).toBe(200);
    expect(res.body.results).toHaveLength(0);
  });

  it("clients cannot read each other's documents", async () => {
    const res = await request(app)
      .get(`/v1/knowledge/documents/${documentId}`)
      .set('Authorization', `Bearer ${keyB}`);
    expect(res.status).toBe(404);
  });

  it('delete removes the document and its chunks', async () => {
    const res = await request(app)
      .delete(`/v1/knowledge/documents/${documentId}`)
      .set('Authorization', `Bearer ${keyA}`);
    expect(res.status).toBe(204);
    const { rows } = await adminPool.query(
      `select count(*)::int as n from chunks where document_id = $1`,
      [documentId],
    );
    expect(rows[0].n).toBe(0);
  });
});
