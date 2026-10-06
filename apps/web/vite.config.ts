/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url';

import VueI18nPlugin from '@intlify/unplugin-vue-i18n/vite';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    // Compiles the message catalogues at build time, so the runtime ships
    // without vue-i18n's message compiler — and the CSP needs no 'unsafe-eval'.
    VueI18nPlugin({
      include: [fileURLToPath(new URL('./src/locales/*.json', import.meta.url))],
    }),
  ],
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
    // Measured, not gated (CR-32): the number is printed so a fall is visible,
    // and a threshold follows once it has stood for a while. `include` is what
    // counts the components no test touches — without it the figure would only
    // describe the files a test happens to import, which is the question
    // nobody is asking.
    coverage: {
      provider: 'v8',
      reporter: ['text'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.{test,spec}.ts', 'src/test/**', 'src/main.ts', 'src/**/*.d.ts'],
    },
  },
});
