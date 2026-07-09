import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { adminPool, closePools } from '../../src/db/pool.js';
import { hashPassword } from '../../src/lib/password.js';
import { startQueue, stopQueue } from '../../src/queue/queue.js';
import { registerIngestWorker } from '../../src/queue/worker.js';

const app = createApp();
const email = `admin-${randomUUID().slice(0, 8)}@bellaworks.test`;
const password = 'correct-horse-battery';
const slug = `test-${randomUUID().slice(0, 8)}`;

let cookie: string;
let clientId: string;
let apiKey: string;

const authed = (req: request.Test): request.Test =>
  req.set('Cookie', cookie).set('X-Requested-With', 'bw-dashboard');

beforeAll(async () => {
  await startQueue();
  await registerIngestWorker();
  await adminPool.query(`insert into admins (email, password_hash) values ($1, $2)`, [
    email,
    await hashPassword(password),
  ]);
});

afterAll(async () => {
  await stopQueue();
  if (clientId) await adminPool.query('delete from clients where id = $1', [clientId]);
  await adminPool.query('delete from admins where email = $1', [email]);
  await closePools();
});

describe('admin auth', () => {
  it('rejects bad credentials', async () => {
    const res = await request(app)
      .post('/v1/admin/auth/login')
      .send({ email, password: 'wrong-password' });
    expect(res.status).toBe(401);
  });

  it('logs in and sets an httpOnly cookie', async () => {
    const res = await request(app).post('/v1/admin/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.admin.email).toBe(email);
    const setCookie = res.headers['set-cookie']![0]!;
    expect(setCookie).toContain('HttpOnly');
    cookie = setCookie.split(';')[0]!;
  });

  it('requires the cookie for admin routes', async () => {
    const res = await request(app).get('/v1/admin/clients');
    expect(res.status).toBe(401);
  });

  it('blocks mutations without the CSRF header', async () => {
    const res = await request(app)
      .post('/v1/admin/clients')
      .set('Cookie', cookie)
      .send({ slug: 'x-csrf', name: 'X' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('csrf_check_failed');
  });
});

describe('client management', () => {
  it('creates a client and returns the API key once', async () => {
    const res = await authed(request(app).post('/v1/admin/clients')).send({
      slug,
      name: 'Admin Test Co.',
      allowedDomains: ['example.com'],
    });
    expect(res.status).toBe(201);
    expect(res.body.apiKey).toMatch(/^bw_sk_/);
    clientId = res.body.client.id;
    apiKey = res.body.apiKey;
  });

  it('rejects duplicate slugs cleanly', async () => {
    const res = await authed(request(app).post('/v1/admin/clients')).send({
      slug,
      name: 'Dupe',
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('slug_taken');
  });

  it('updates branding + settings, sealing a BYOK key and masking it', async () => {
    const detail = await authed(request(app).get(`/v1/admin/clients/${clientId}`));
    const res = await authed(request(app).patch(`/v1/admin/clients/${clientId}`)).send({
      branding: { ...detail.body.client.branding, primaryColor: '#7c3aed' },
      aiSettings: {
        ...detail.body.client.aiSettings,
        hasApiKeyOverride: undefined,
        temperature: 0.7,
        // low threshold so the fake (lexical) embeddings clear it later
        relevanceThreshold: 0.01,
        apiKeyOverride: 'sk-test-byok-key',
      },
    });
    expect(res.status).toBe(200);
    expect(res.body.client.branding.primaryColor).toBe('#7c3aed');
    expect(res.body.client.aiSettings.temperature).toBe(0.7);
    expect(res.body.client.aiSettings.hasApiKeyOverride).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain('sk-test-byok-key');

    const { rows } = await adminPool.query(
      `select ai_settings->>'apiKeyOverride' as sealed from clients where id = $1`,
      [clientId],
    );
    expect(rows[0].sealed).toMatch(/^box:v1:/);
  });

  it('keeps the sealed override when settings are saved without touching it', async () => {
    const detail = await authed(request(app).get(`/v1/admin/clients/${clientId}`));
    const settings = { ...detail.body.client.aiSettings, temperature: 0.2 };
    delete settings.hasApiKeyOverride;
    delete settings.apiKeyOverride;
    const res = await authed(request(app).patch(`/v1/admin/clients/${clientId}`)).send({
      aiSettings: settings,
    });
    expect(res.body.client.aiSettings.hasApiKeyOverride).toBe(true);
  });
});

describe('knowledge + keys + insights', () => {
  it('ingests a manual document for the client', async () => {
    const res = await authed(request(app).post(`/v1/admin/clients/${clientId}/documents`)).send({
      title: 'Store hours',
      content: '# Hours\n\nWe are open Monday through Friday, 9am to 5pm.',
    });
    expect(res.status).toBe(202);
    // wait for the worker
    for (let i = 0; i < 40; i++) {
      const list = await authed(request(app).get(`/v1/admin/clients/${clientId}/documents`));
      if (list.body.documents[0]?.status === 'ready') return;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('document never became ready');
  });

  it('records conversations for the transcript browser', async () => {
    // clear the BYOK override so chat uses the (fake) platform provider
    const detail = await authed(request(app).get(`/v1/admin/clients/${clientId}`));
    const settings = { ...detail.body.client.aiSettings, apiKeyOverride: null };
    delete settings.hasApiKeyOverride;
    const cleared = await authed(request(app).patch(`/v1/admin/clients/${clientId}`)).send({
      aiSettings: settings,
    });
    expect(cleared.body.client.aiSettings.hasApiKeyOverride).toBe(false);

    const session = await request(app)
      .post(`/v1/widget/${slug}/session`)
      .set('Origin', 'https://example.com');
    const chat = await request(app)
      .post(`/v1/chat/${slug}/messages`)
      .set('Origin', 'https://example.com')
      .set('Authorization', `Bearer ${session.body.token}`)
      .send({ message: 'when are you open?' });
    expect(chat.status).toBe(200);

    const list = await authed(request(app).get(`/v1/admin/clients/${clientId}/conversations`));
    expect(list.body.total).toBe(1);
    expect(list.body.conversations[0].firstMessage).toContain('open');

    const conv = await authed(
      request(app).get(
        `/v1/admin/clients/${clientId}/conversations/${list.body.conversations[0].id}`,
      ),
    );
    expect(conv.body.messages).toHaveLength(2);
    expect(conv.body.messages[1].sources[0].title).toBe('Store hours');
  });

  it('reports usage', async () => {
    const res = await authed(request(app).get(`/v1/admin/clients/${clientId}/usage`));
    expect(res.status).toBe(200);
    expect(res.body.totals.conversations).toBe(1);
    expect(res.body.totals.documents).toBe(1);
    expect(res.body.months.length).toBeGreaterThan(0);
  });

  it('revoking a key kills knowledge API access', async () => {
    const before = await request(app)
      .get('/v1/knowledge/documents')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(before.status).toBe(200);

    const detail = await authed(request(app).get(`/v1/admin/clients/${clientId}`));
    const keyId = detail.body.client.keys[0].id;
    const revoke = await authed(
      request(app).post(`/v1/admin/clients/${clientId}/keys/${keyId}/revoke`),
    );
    expect(revoke.status).toBe(204);

    const after = await request(app)
      .get('/v1/knowledge/documents')
      .set('Authorization', `Bearer ${apiKey}`);
    expect(after.status).toBe(401);
  });
});
