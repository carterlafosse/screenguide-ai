// vite.config.js: dev server (127.0.0.1:5174), /api and /ws proxy to the API, and Vitest settings.
// The proxy keeps cookies same-origin in development, like Resolvd's setup.
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const API_TARGET = 'http://127.0.0.1:4001';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5174, // Resolvd uses 5173
    strictPort: true,
    proxy: {
      '/api': { target: API_TARGET },
      '/ws': { target: API_TARGET, ws: true },
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 5174,
    strictPort: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './vitest.setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    css: true,
  },
});
