import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      // never hit OpenAI from tests
      EMBEDDINGS_PROVIDER: 'fake',
      LLM_PROVIDER: 'fake',
      // 32 bytes of base64 for secret-box tests
      SECRETS_KEY: 'QUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUE=',
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration tests share one seeded database; run files serially.
    fileParallelism: false,
  },
});
