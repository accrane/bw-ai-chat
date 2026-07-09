import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { env } from '../../src/config/env.js';
import { closePools } from '../../src/db/pool.js';
import { verifySessionToken } from '../../src/lib/session-token.js';
import { createTestClient, deleteTestClient, type TestClient } from './helpers.js';

const app = createApp();
const GOOD_ORIGIN = 'https://example.com';
const BAD_ORIGIN = 'https://not-allowed.com';

let active: TestClient;
let paused: TestClient;

beforeAll(async () => {
  active = await createTestClient({ branding: { primaryColor: '#0e7490' } });
  paused = await createTestClient({ status: 'paused' });
});

afterAll(async () => {
  await deleteTestClient(active.id);
  await deleteTestClient(paused.id);
  await closePools();
});

describe('GET /v1/widget/:slug/config', () => {
  it('returns branding for an allowed origin, with CORS + cache headers', async () => {
    const res = await request(app)
      .get(`/v1/widget/${active.slug}/config`)
      .set('Origin', GOOD_ORIGIN);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(GOOD_ORIGIN);
    expect(res.headers['cache-control']).toContain('max-age=300');
    expect(res.body.clientId).toBe(active.slug);
    expect(res.body.branding.primaryColor).toBe('#0e7490');
    // defaults filled in for fields the client never set
    expect(res.body.branding.position).toBe('bottom-right');
  });

  it('rejects a disallowed origin with 403 and no CORS header', async () => {
    const res = await request(app)
      .get(`/v1/widget/${active.slug}/config`)
      .set('Origin', BAD_ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('origin_not_allowed');
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects requests without an Origin header', async () => {
    const res = await request(app).get(`/v1/widget/${active.slug}/config`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('origin_required');
  });

  it('404s for an unknown client', async () => {
    const res = await request(app)
      .get('/v1/widget/no-such-client/config')
      .set('Origin', GOOD_ORIGIN);
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('unknown_client');
  });

  it('400s for a malformed slug', async () => {
    const res = await request(app).get('/v1/widget/BAD_SLUG!/config').set('Origin', GOOD_ORIGIN);
    expect(res.status).toBe(400);
  });

  it('403s for a paused client even from an allowed origin', async () => {
    const res = await request(app)
      .get(`/v1/widget/${paused.slug}/config`)
      .set('Origin', GOOD_ORIGIN);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('client_paused');
  });
});

describe('POST /v1/widget/:slug/session', () => {
  it('answers preflight for an allowed origin', async () => {
    const res = await request(app)
      .options(`/v1/widget/${active.slug}/session`)
      .set('Origin', GOOD_ORIGIN)
      .set('Access-Control-Request-Method', 'POST');
    expect(res.status).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe(GOOD_ORIGIN);
    expect(res.headers['access-control-allow-methods']).toContain('POST');
  });

  it('mints a verifiable session token bound to client and origin', async () => {
    const res = await request(app)
      .post(`/v1/widget/${active.slug}/session`)
      .set('Origin', GOOD_ORIGIN);
    expect(res.status).toBe(201);
    expect(res.body.sessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(new Date(res.body.expiresAt).getTime()).toBeGreaterThan(Date.now());

    const claims = await verifySessionToken(env.SESSION_JWT_SECRET, res.body.token);
    expect(claims).not.toBeNull();
    expect(claims!.clientId).toBe(active.id);
    expect(claims!.slug).toBe(active.slug);
    expect(claims!.origin).toBe(GOOD_ORIGIN);
    expect(claims!.sessionId).toBe(res.body.sessionId);
  });

  it('refuses to mint tokens for disallowed origins', async () => {
    const res = await request(app)
      .post(`/v1/widget/${active.slug}/session`)
      .set('Origin', BAD_ORIGIN);
    expect(res.status).toBe(403);
  });
});
