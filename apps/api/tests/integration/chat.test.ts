import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { adminPool, closePools } from '../../src/db/pool.js';
import { processDocument } from '../../src/modules/knowledge/service.js';
import { createTestClient, deleteTestClient, type TestClient } from './helpers.js';

const app = createApp();
const ORIGIN = 'https://example.com';

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}

function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((block) => block.trim())
    .map((block) => {
      const type = /event: (.+)/.exec(block)?.[1] ?? 'message';
      const data = JSON.parse(/data: (.+)/.exec(block)?.[1] ?? '{}') as Record<string, unknown>;
      return { type, data };
    });
}

const byType = (events: SseEvent[], type: string): SseEvent[] =>
  events.filter((e) => e.type === type);

async function mintSession(slug: string): Promise<string> {
  const res = await request(app).post(`/v1/widget/${slug}/session`).set('Origin', ORIGIN);
  expect(res.status).toBe(201);
  return res.body.token as string;
}

async function sendMessage(
  slug: string,
  token: string,
  body: { message: string; conversationId?: string },
): Promise<SseEvent[]> {
  const res = await request(app)
    .post(`/v1/chat/${slug}/messages`)
    .set('Origin', ORIGIN)
    .set('Authorization', `Bearer ${token}`)
    .send(body);
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toContain('text/event-stream');
  return parseSse(res.text);
}

async function ingestDirect(clientId: string, title: string, content: string): Promise<void> {
  const { rows } = await adminPool.query<{ id: string }>(
    `insert into documents (client_id, source_type, source_id, title, content, content_hash)
     values ($1, 'markdown', $2, $2, $3, md5($3)) returning id`,
    [clientId, title, content],
  );
  await processDocument(clientId, rows[0]!.id);
}

let client: TestClient; // low threshold → questions get answered
let picky: TestClient; // threshold 0.99 → always falls back
let broke: TestClient; // budget exhausted

beforeAll(async () => {
  client = await createTestClient({ aiSettings: { relevanceThreshold: 0.01 } });
  picky = await createTestClient({
    aiSettings: { relevanceThreshold: 0.99, fallbackMessage: 'Ask us directly!' },
  });
  broke = await createTestClient({
    aiSettings: { relevanceThreshold: 0.01, monthlyTokenBudget: 100 },
  });
  const faq = `# Pricing\n\nHalf-day rafting trips cost $89 per person. Full-day trips cost $149.`;
  await ingestDirect(client.id, 'Rafting FAQ', faq);
  await ingestDirect(picky.id, 'Rafting FAQ', faq);
  await ingestDirect(broke.id, 'Rafting FAQ', faq);
  await adminPool.query(
    `insert into usage_counters (client_id, month, tokens)
     values ($1, date_trunc('month', now())::date, 1000000)`,
    [broke.id],
  );
});

afterAll(async () => {
  await deleteTestClient(client.id);
  await deleteTestClient(picky.id);
  await deleteTestClient(broke.id);
  await closePools();
});

describe('chat auth', () => {
  it('requires a session token', async () => {
    const res = await request(app)
      .post(`/v1/chat/${client.slug}/messages`)
      .set('Origin', ORIGIN)
      .send({ message: 'hi' });
    expect(res.status).toBe(401);
  });

  it("rejects another client's session token", async () => {
    const foreign = await mintSession(picky.slug);
    const res = await request(app)
      .post(`/v1/chat/${client.slug}/messages`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${foreign}`)
      .send({ message: 'hi' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('invalid_session');
  });

  it('answers CORS preflight', async () => {
    const res = await request(app)
      .options(`/v1/chat/${client.slug}/messages`)
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'authorization,content-type');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-headers']).toContain('Authorization');
  });
});

describe('chat pipeline', () => {
  let token: string;
  let conversationId: string;

  beforeAll(async () => {
    token = await mintSession(client.slug);
  });

  it('streams meta → deltas → sources → done and answers from knowledge', async () => {
    const events = await sendMessage(client.slug, token, {
      message: 'How much does a half-day trip cost?',
    });
    expect(events[0]!.type).toBe('meta');
    conversationId = events[0]!.data.conversationId as string;

    const answer = byType(events, 'delta')
      .map((e) => e.data.text)
      .join('');
    expect(answer).toContain('Based on our information');
    expect(answer).toContain('$89');

    const sources = byType(events, 'sources')[0]!.data.sources as { title: string }[];
    expect(sources[0]!.title).toBe('Rafting FAQ');

    const done = byType(events, 'done')[0]!.data;
    expect(done.answered).toBe(true);
    expect(done.outputTokens as number).toBeGreaterThan(0);
  });

  it('persists the exchange and serves history to the owning session', async () => {
    const res = await request(app)
      .get(`/v1/chat/${client.slug}/conversations/${conversationId}`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.messages).toHaveLength(2);
    expect(res.body.messages[0].role).toBe('user');
    expect(res.body.messages[1].role).toBe('assistant');
  });

  it('continues an existing conversation', async () => {
    const events = await sendMessage(client.slug, token, {
      message: 'And a full-day trip?',
      conversationId,
    });
    expect(events[0]!.data.conversationId).toBe(conversationId);

    const res = await request(app)
      .get(`/v1/chat/${client.slug}/conversations/${conversationId}`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`);
    expect(res.body.messages).toHaveLength(4);
  });

  it('meters token usage into the monthly counter', async () => {
    const { rows } = await adminPool.query(
      `select tokens from usage_counters where client_id = $1`,
      [client.id],
    );
    expect(Number(rows[0].tokens)).toBeGreaterThan(0);
  });

  it("a different session cannot read this session's conversation", async () => {
    const otherToken = await mintSession(client.slug);
    const res = await request(app)
      .get(`/v1/chat/${client.slug}/conversations/${conversationId}`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${otherToken}`);
    expect(res.status).toBe(404);
  });

  it('404s when continuing a conversation from another session', async () => {
    const otherToken = await mintSession(client.slug);
    const res = await request(app)
      .post(`/v1/chat/${client.slug}/messages`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ message: 'hijack attempt', conversationId });
    expect(res.status).toBe(404);
  });
});

describe('fallback paths', () => {
  it('streams the configured fallback when nothing relevant is found', async () => {
    const token = await mintSession(picky.slug);
    const events = await sendMessage(picky.slug, token, { message: 'what is the meaning of life' });
    const answer = byType(events, 'delta')
      .map((e) => e.data.text)
      .join('');
    expect(answer).toBe('Ask us directly!');
    const done = byType(events, 'done')[0]!.data;
    expect(done.answered).toBe(false);
    expect(done.inputTokens).toBe(0);
    expect(done.outputTokens).toBe(0);
    expect(byType(events, 'sources')).toHaveLength(0);
  });

  it('streams the fallback when the monthly budget is exhausted', async () => {
    const token = await mintSession(broke.slug);
    const events = await sendMessage(broke.slug, token, { message: 'how much are trips?' });
    const done = byType(events, 'done')[0]!.data;
    expect(done.answered).toBe(false);
    const { rows } = await adminPool.query(
      `select tokens from usage_counters where client_id = $1`,
      [broke.id],
    );
    expect(Number(rows[0].tokens)).toBe(1000000); // unchanged — no spend over budget
  });
});
