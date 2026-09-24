/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    // In dev the SPA runs on :5173 and the API on :3000. Proxying keeps the
    // browser on one origin so the httpOnly refresh cookie (path /api/v1/auth)
    // is sent back without cross-site cookie friction.
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test/setup.ts'],
  },
});
