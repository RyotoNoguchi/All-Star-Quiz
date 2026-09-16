import { defineConfig } from '@playwright/test';
if (!process.env.QUIZ_TEST_SCHEMA?.startsWith('quiz_e2e_'))
  throw new Error('Run npm run test:e2e to create an isolated database.');
export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  retries: 0,
  fullyParallel: false,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.QUIZ_E2E_BASE_URL!,
    browserName: 'chromium',
    viewport: { width: 390, height: 844 },
    locale: 'ja-JP',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
