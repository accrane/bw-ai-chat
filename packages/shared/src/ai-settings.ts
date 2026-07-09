import { z } from 'zod';

/**
 * Per-client AI configuration, stored in clients.ai_settings (jsonb).
 * `apiKeyOverride` is the BYOK escape hatch: null means the platform OpenAI
 * key is used. When set, the value is encrypted at rest by the API layer —
 * this schema only sees the ciphertext envelope.
 */
export const AiSettingsSchema = z.object({
  model: z.string().default('gpt-4o-mini'),
  temperature: z.number().min(0).max(2).default(0.3),
  maxHistoryMessages: z.number().int().min(0).max(50).default(10),
  monthlyTokenBudget: z.number().int().positive().default(2_000_000),
  systemPromptAddendum: z.string().max(4000).default(''),
  apiKeyOverride: z.string().nullable().default(null),
});

export type AiSettings = z.infer<typeof AiSettingsSchema>;
