import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  webServer: [
    {
      command: 'npm run dev --prefix api',
      url: 'http://localhost:3001/api/health',
      reuseExistingServer: true,
    },
    {
      command: 'npm run dev --prefix web',
      url: 'http://localhost:5173',
      reuseExistingServer: true,
    },
  ],
});
