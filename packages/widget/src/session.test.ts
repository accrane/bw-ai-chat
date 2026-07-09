import { beforeEach, describe, expect, it } from 'vitest';
import { clearSession, loadSession, saveSession, updateConversation } from './session.js';

const future = new Date(Date.now() + 3_600_000).toISOString();

describe('session storage', () => {
  beforeEach(() => clearSession('acme'));

  it('round-trips a session', () => {
    saveSession('acme', { token: 't1', expiresAt: future });
    expect(loadSession('acme')?.token).toBe('t1');
  });

  it('drops expired sessions (with safety margin)', () => {
    saveSession('acme', { token: 't1', expiresAt: new Date(Date.now() + 30_000).toISOString() });
    expect(loadSession('acme')).toBeNull();
  });

  it('attaches a conversation id to the stored session', () => {
    saveSession('acme', { token: 't1', expiresAt: future });
    updateConversation('acme', 'conv-1');
    expect(loadSession('acme')?.conversationId).toBe('conv-1');
  });

  it('isolates sessions per client', () => {
    saveSession('acme', { token: 'a', expiresAt: future });
    saveSession('globex', { token: 'b', expiresAt: future });
    expect(loadSession('acme')?.token).toBe('a');
    expect(loadSession('globex')?.token).toBe('b');
  });
});
