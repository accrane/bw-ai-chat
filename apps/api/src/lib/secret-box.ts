import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * AES-256-GCM envelope for tenant secrets at rest (BYOK OpenAI keys in
 * ai_settings.apiKeyOverride). Format: box:v1:<iv b64>:<tag b64>:<data b64>.
 * SECRETS_KEY is 32 bytes base64; required only when a tenant secret is
 * actually stored.
 */

const PREFIX = 'box:v1';

function key(): Buffer {
  if (!env.SECRETS_KEY) {
    throw new Error('SECRETS_KEY is required to read/write tenant secrets');
  }
  const buf = Buffer.from(env.SECRETS_KEY, 'base64');
  if (buf.length !== 32) throw new Error('SECRETS_KEY must be 32 bytes of base64');
  return buf;
}

export function sealSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PREFIX, iv.toString('base64'), tag.toString('base64'), data.toString('base64')].join(':');
}

export function openSecret(sealed: string): string {
  const parts = sealed.split(':');
  if (parts.length !== 5 || `${parts[0]}:${parts[1]}` !== PREFIX) {
    throw new Error('malformed sealed secret');
  }
  const [iv, tag, data] = parts.slice(2).map((p) => Buffer.from(p!, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv!);
  decipher.setAuthTag(tag!);
  return Buffer.concat([decipher.update(data!), decipher.final()]).toString('utf8');
}

export const isSealed = (value: string): boolean => value.startsWith(`${PREFIX}:`);
