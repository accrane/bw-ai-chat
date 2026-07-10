import { defineConfig } from 'vitest/config';

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
    jsxImportSource: 'preact',
  },
  build: {
    target: 'es2019',
    lib: {
      entry: 'src/main.tsx',
      formats: ['iife'],
      name: 'BwAiChat',
      fileName: () => 'v1.js',
    },
  },
  test: {
    environment: 'happy-dom',
  },
});
