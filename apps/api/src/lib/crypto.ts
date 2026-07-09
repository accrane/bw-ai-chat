import { createHash, randomBytes, randomUUID } from 'node:crypto';

const API_KEY_PREFIX = 'bw_sk_';

export function hashApiKey(key: string): string {
  return createHash('sha256').update(key).digest('hex');
}

/** Generates a secret API key. The plaintext is returned once and never stored. */
export function generateApiKey(): { key: string; hash: string; prefix: string } {
  const key = `${API_KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashApiKey(key), prefix: key.slice(0, API_KEY_PREFIX.length + 6) };
}

export const newSessionId = (): string => randomUUID();
