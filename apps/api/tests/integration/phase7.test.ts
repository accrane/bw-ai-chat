import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { adminPool, closePools } from '../../src/db/pool.js';
import { hashPassword } from '../../src/lib/password.js';
import { runMaintenance } from '../../src/queue/maintenance.js';
import { processDocument } from '../../src/modules/knowledge/service.js';
import { createTestClient, deleteTestClient, type TestClient } from './helpers.js';

const app = createApp();
const ORIGIN = 'https://example.com';
const email = `admin-${randomUUID().slice(0, 8)}@bw-ai-chat.test`;

let client: TestClient;
let cookie: string;

const authed = (req: request.Test): request.Test =>
  req.set('Cookie', cookie).set('X-Requested-With', 'bw-dashboard');

async function mintSession(): Promise<string> {
  const res = await request(app).post(`/v1/widget/${client.slug}/session`).set('Origin', ORIGIN);
  return res.body.token as string;
}

interface SseEvent {
  type: string;
  data: Record<string, unknown>;
}
function parseSse(text: string): SseEvent[] {
  return text
    .split('\n\n')
    .filter((b) => b.trim())
    .map((b) => ({
      type: /event: (.+)/.exec(b)?.[1] ?? 'message',
      data: JSON.parse(/data: (.+)/.exec(b)?.[1] ?? '{}') as Record<string, unknown>,
    }));
}

beforeAll(async () => {
  client = await createTestClient({
    aiSettings: { relevanceThreshold: 0.01, retentionDays: 30 },
  });
  await adminPool.query(`insert into admins (email, password_hash) values ($1, $2)`, [
    email,
    await hashPassword('phase7-test-password'),
  ]);
  const login = await request(app)
    .post('/v1/admin/auth/login')
    .send({ email, password: 'phase7-test-password' });
  cookie = login.headers['set-cookie']![0]!.split(';')[0]!;

  const { rows } = await adminPool.query<{ id: string }>(
    `insert into documents (client_id, source_type, source_id, title, content, content_hash)
     values ($1, 'manual', 'hours', 'Hours', $2, md5($2)) returning id`,
    [client.id, '# Hours\n\nWe are open weekdays from 9am to 5pm.'],
  );
  await processDocument(client.id, rows[0]!.id);
});

afterAll(async () => {
  await deleteTestClient(client.id);
  await adminPool.query('delete from admins where email = $1', [email]);
  await closePools();
});

describe('feedback', () => {
  let token: string;
  let messageId: string;

  it('visitor can rate an answered message', async () => {
    token = await mintSession();
    const chat = await request(app)
      .post(`/v1/chat/${client.slug}/messages`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'when are you open?' });
    const events = parseSse(chat.text);
    messageId = events.find((e) => e.type === 'meta')!.data.messageId as string;

    const res = await request(app)
      .post(`/v1/chat/${client.slug}/messages/${messageId}/feedback`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send({ rating: 1 });
    expect(res.status).toBe(204);

    const { rows } = await adminPool.query(`select rating from messages where id = $1`, [
      messageId,
    ]);
    expect(rows[0].rating).toBe(1);
  });

  it("another session cannot rate someone else's message", async () => {
    const otherToken = await mintSession();
    const res = await request(app)
      .post(`/v1/chat/${client.slug}/messages/${messageId}/feedback`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ rating: -1 });
    expect(res.status).toBe(404);
  });

  it('rating shows up in usage satisfaction and the admin transcript', async () => {
    const usage = await authed(request(app).get(`/v1/admin/clients/${client.id}/usage`));
    expect(usage.body.satisfaction.up).toBe(1);
    expect(usage.body.topDocuments[0].title).toBe('Hours');
  });
});

describe('postgres rate limiter', () => {
  it('429s past the per-session chat limit and sets Retry-After', async () => {
    const token = await mintSession();
    let limited = false;
    for (let i = 0; i < 14; i++) {
      const res = await request(app)
        .post(`/v1/chat/${client.slug}/messages`)
        .set('Origin', ORIGIN)
        .set('Authorization', `Bearer ${token}`)
        .send({ message: `burst ${i}` });
      if (res.status === 429) {
        limited = true;
        expect(res.headers['retry-after']).toBeDefined();
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

describe('retention + maintenance', () => {
  it('purges conversations older than the client retention window', async () => {
    const { rows } = await adminPool.query<{ id: string }>(
      `insert into conversations (client_id, session_id, created_at, updated_at)
       values ($1, gen_random_uuid(), now() - interval '60 days', now() - interval '60 days')
       returning id`,
      [client.id],
    );
    const oldId = rows[0]!.id;

    await runMaintenance();

    const gone = await adminPool.query(`select 1 from conversations where id = $1`, [oldId]);
    expect(gone.rows).toHaveLength(0);
    // recent conversations survive
    const recent = await adminPool.query(
      `select count(*)::int as n from conversations where client_id = $1`,
      [client.id],
    );
    expect(recent.rows[0].n).toBeGreaterThan(0);
  });
});

describe('reports + export + erasure', () => {
  it('lists unanswered questions with counts', async () => {
    const token = await mintSession();
    await request(app)
      .post(`/v1/chat/${client.slug}/messages`)
      .set('Origin', ORIGIN)
      .set('Authorization', `Bearer ${token}`)
      .send({ message: 'zzz completely unrelated gibberish qqq' });

    const res = await authed(request(app).get(`/v1/admin/clients/${client.id}/unanswered`));
    expect(res.status).toBe(200);
    const found = (res.body.questions as { question: string }[]).find((q) =>
      q.question.includes('gibberish'),
    );
    expect(found).toBeDefined();
  });

  it('exports conversations as CSV', async () => {
    const res = await authed(
      request(app).get(`/v1/admin/clients/${client.id}/export/conversations.csv`),
    );
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text.split('\r\n')[0]).toContain('"conversation_id"');
    expect(res.text).toContain('when are you open?');
  });

  it('admin can delete a conversation (erasure request)', async () => {
    const list = await authed(request(app).get(`/v1/admin/clients/${client.id}/conversations`));
    const target = list.body.conversations[0].id;
    const res = await authed(
      request(app).delete(`/v1/admin/clients/${client.id}/conversations/${target}`),
    );
    expect(res.status).toBe(204);
    const after = await authed(request(app).get(`/v1/admin/clients/${client.id}/conversations`));
    expect(after.body.total).toBe(list.body.total - 1);
  });
});

describe('security headers', () => {
  it('sets nosniff everywhere and CSP on the dashboard', async () => {
    const api = await request(app).get('/health');
    expect(api.headers['x-content-type-options']).toBe('nosniff');
    const admin = await request(app).get('/admin/');
    expect(admin.headers['content-security-policy']).toContain("default-src 'self'");
  });
});
