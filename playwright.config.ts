import { defineConfig } from '@playwright/test';

const adminUrl = 'http://127.0.0.1:4173';
const apiUrl = 'http://127.0.0.1:3000/health';

export default defineConfig({
  testDir: './tests/e2e',
  forbidOnly: Boolean(process.env.CI),
  reporter: 'list',
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  use: {
    baseURL: adminUrl,
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'pnpm --filter @makeup/admin-web exec vite preview --host 127.0.0.1 --port 4173',
      name: 'admin-web',
      reuseExistingServer: !process.env.CI,
      url: adminUrl,
    },
    {
      command: 'pnpm --filter @makeup/api start',
      name: 'api',
      reuseExistingServer: !process.env.CI,
      url: apiUrl,
    },
  ],
});
