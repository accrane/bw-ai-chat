import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Served by the API at /admin in production; same path in dev for parity.
  base: '/admin/',
  server: {
    port: 5174,
    proxy: {
      '/v1': 'http://localhost:3001',
    },
  },
});
