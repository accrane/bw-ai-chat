import { describe, expect, it } from 'vitest';
import { isSealed, openSecret, sealSecret } from './secret-box.js';

describe('secret-box', () => {
  it('round-trips a secret', () => {
    const sealed = sealSecret('sk-my-openai-key');
    expect(isSealed(sealed)).toBe(true);
    expect(sealed).not.toContain('sk-my-openai-key');
    expect(openSecret(sealed)).toBe('sk-my-openai-key');
  });

  it('produces unique ciphertexts per call (random IV)', () => {
    expect(sealSecret('same')).not.toBe(sealSecret('same'));
  });

  it('rejects tampered ciphertext', () => {
    const sealed = sealSecret('secret');
    const parts = sealed.split(':');
    const flipped = Buffer.from(parts[4]!, 'base64');
    flipped[0] = flipped[0]! ^ 0xff;
    parts[4] = flipped.toString('base64');
    expect(() => openSecret(parts.join(':'))).toThrow();
  });

  it('rejects malformed input', () => {
    expect(() => openSecret('not-a-box')).toThrow(/malformed/);
    expect(isSealed('not-a-box')).toBe(false);
  });
});
