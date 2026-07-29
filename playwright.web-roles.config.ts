import { defineConfig } from '@playwright/test';

const webPort = 4274;
const apiPort = 3200;
const databaseUrl = process.env.WEB_E2E_DATABASE_URL;
const workerToken = process.env.WEB_E2E_WORKER_TOKEN;

if (!databaseUrl) {
  throw new Error('WEB_E2E_DATABASE_URL is required');
}
if (!workerToken) {
  throw new Error('WEB_E2E_WORKER_TOKEN is required');
}

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: 'web-roles.spec.ts',
  forbidOnly: true,
  reporter: 'list',
  retries: 0,
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    channel: process.env.CI ? undefined : 'chrome',
    trace: 'retain-on-failure',
    viewport: { height: 844, width: 390 },
  },
  webServer: [
    {
      command: 'pnpm --filter @makeup/api start',
      env: {
        ...process.env,
        API_PORT: String(apiPort),
        DATABASE_URL: databaseUrl,
        INTERNAL_WORKER_TOKEN: workerToken,
        NODE_ENV: 'test',
      },
      name: 'qa-api',
      reuseExistingServer: false,
      url: `http://127.0.0.1:${apiPort}/health`,
    },
    {
      command: `pnpm --filter @makeup/admin-web exec vite --host 127.0.0.1 --port ${webPort}`,
      env: {
        ...process.env,
        ADMIN_API_PROXY_TARGET: `http://127.0.0.1:${apiPort}`,
      },
      name: 'qa-web',
      reuseExistingServer: false,
      url: `http://127.0.0.1:${webPort}`,
    },
  ],
});
