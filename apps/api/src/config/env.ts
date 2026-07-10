import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.string().default('info'),
  DATABASE_URL: z.string().min(1),
  APP_DATABASE_URL: z.string().min(1),
  SESSION_JWT_SECRET: z.string().min(32, 'SESSION_JWT_SECRET must be at least 32 characters'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  EMBEDDINGS_PROVIDER: z.enum(['openai', 'fake']).optional(),
  LLM_PROVIDER: z.enum(['openai', 'fake']).optional(),
  SECRETS_KEY: z.string().min(1).optional(),
  ADMIN_JWT_SECRET: z.string().min(32, 'ADMIN_JWT_SECRET must be at least 32 characters'),
  DASHBOARD_ORIGIN: z.string().url().optional(),
  // Compiled output sits at a different depth than src/, so the Docker image
  // sets these explicitly instead of relying on repo-relative fallbacks.
  WIDGET_DIST_DIR: z.string().min(1).optional(),
  DASHBOARD_DIST_DIR: z.string().min(1).optional(),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  // Logger depends on env, so this failure goes straight to stderr.
  console.error('Invalid environment configuration:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
