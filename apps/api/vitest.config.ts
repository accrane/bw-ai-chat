import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: {
      // never hit OpenAI from tests
      EMBEDDINGS_PROVIDER: 'fake',
    },
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    // Integration tests share one seeded database; run files serially.
    fileParallelism: false,
  },
});
