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
  /** Minimum retrieval similarity before the LLM is consulted at all. */
  relevanceThreshold: z.number().min(0).max(1).default(0.3),
  /** Streamed verbatim (no LLM call) when retrieval finds nothing relevant or the budget is exhausted. */
  fallbackMessage: z
    .string()
    .max(1000)
    .default(
      "I'm not sure about that one. Please reach out to us directly and we'll be happy to help!",
    ),
  apiKeyOverride: z.string().nullable().default(null),
  /** Conversations older than this many days are purged nightly; null keeps them forever. */
  retentionDays: z.number().int().min(1).max(3650).nullable().default(null),
});

export type AiSettings = z.infer<typeof AiSettingsSchema>;
