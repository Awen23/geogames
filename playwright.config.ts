import fs from 'fs';
import path from 'path';
import { parse } from 'dotenv';
import { defineConfig } from '@playwright/test';

// Playwright always starts its own servers, on ports of their own, so e2e never attaches to a dev
// server (3001/5173) that points at the dev database. A port that is already taken fails the run.
const API_PORT = 3201;
const WEB_PORT = 5273;

/**
 * The e2e database, recreated on every run (e2e/support/resetDb.ts). E2E_DATABASE_URL sets it
 * (from the environment or .env). By default it is .env's DATABASE_URL with `_e2e` added to the
 * name: only the file's, so an exported DATABASE_URL (say, a production one) is never the source.
 */
function e2eDatabaseUrl(): string {
  const envFile = path.join(__dirname, '.env');
  const fileEnv = fs.existsSync(envFile) ? parse(fs.readFileSync(envFile)) : {};
  const e2eUrl = process.env.E2E_DATABASE_URL ?? fileEnv.E2E_DATABASE_URL;
  if (e2eUrl) {
    return e2eUrl;
  }
  const devUrl = fileEnv.DATABASE_URL;
  if (!devUrl) {
    throw new Error('Set E2E_DATABASE_URL, or DATABASE_URL in .env to derive it from');
  }
  const url = new URL(devUrl);
  url.pathname = `${url.pathname}_e2e`;
  return url.href;
}

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  retries: 0,
  use: {
    baseURL: `http://localhost:${WEB_PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // The result-endpoint tests run first, on their own, so they see exact play counts from the
    // fresh database. Everything else runs after them, in parallel. The trade-off: if an
    // api-results test fails, the e2e project is skipped; and running a single spec also runs
    // gameResults.spec.ts unless you pass --no-deps.
    { name: 'api-results', testMatch: 'gameResults.spec.ts' },
    { name: 'e2e', testIgnore: 'gameResults.spec.ts', dependencies: ['api-results'] },
  ],
  webServer: [
    {
      command: 'npx tsx e2e/support/resetDb.ts && npm run dev --prefix api',
      url: `http://localhost:${API_PORT}/api/health`,
      reuseExistingServer: false,
      env: {
        DATABASE_URL: e2eDatabaseUrl(),
        PORT: String(API_PORT),
        WEB_ORIGIN: `http://localhost:${WEB_PORT}`,
      },
    },
    {
      command: `npm run dev --prefix web -- --port ${WEB_PORT} --strictPort`,
      url: `http://localhost:${WEB_PORT}`,
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
    },
  ],
});
