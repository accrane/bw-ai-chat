import { describe, expect, it } from 'vitest';
import { generateApiKey, hashApiKey } from './crypto.js';

describe('generateApiKey', () => {
  it('produces bw_sk_ keys with a display prefix and sha256 hash', () => {
    const { key, hash, prefix } = generateApiKey();
    expect(key).toMatch(/^bw_sk_[A-Za-z0-9_-]{32}$/);
    expect(prefix).toBe(key.slice(0, 12));
    expect(hash).toBe(hashApiKey(key));
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('never repeats keys', () => {
    const keys = new Set(Array.from({ length: 100 }, () => generateApiKey().key));
    expect(keys.size).toBe(100);
  });
});

describe('hashApiKey', () => {
  it('is deterministic and never echoes the input', () => {
    const hash = hashApiKey('bw_sk_test');
    expect(hash).toBe(hashApiKey('bw_sk_test'));
    expect(hash).not.toContain('bw_sk');
  });
});
