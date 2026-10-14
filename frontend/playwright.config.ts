import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.LAMS_E2E_FRONTEND_URL ?? 'http://localhost:5174',
    browserName: 'chromium', screenshot: 'only-on-failure',
  },
});
