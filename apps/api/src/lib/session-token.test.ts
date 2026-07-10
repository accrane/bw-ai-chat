import { describe, expect, it } from 'vitest';
import { signSessionToken, verifySessionToken } from './session-token.js';

const secret = 'test-secret-0123456789abcdefghijklmnopqrstuv';
const claims = {
  clientId: 'f2f9a1f2-0000-4000-8000-000000000001',
  slug: 'demo-client',
  origin: 'https://demo-client.com',
};

describe('session tokens', () => {
  it('round-trips claims', async () => {
    const { token, expiresAt } = await signSessionToken(secret, 'session-1', claims);
    expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    const verified = await verifySessionToken(secret, token);
    expect(verified).toEqual({ sessionId: 'session-1', ...claims });
  });

  it('rejects a token signed with a different secret', async () => {
    const { token } = await signSessionToken(secret, 'session-1', claims);
    expect(await verifySessionToken('another-secret-0123456789abcdefghijk', token)).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const { token } = await signSessionToken(secret, 'session-1', claims, -60);
    expect(await verifySessionToken(secret, token)).toBeNull();
  });

  it('rejects garbage', async () => {
    expect(await verifySessionToken(secret, 'not-a-jwt')).toBeNull();
  });
});
