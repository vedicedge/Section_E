import { defineConfig, devices } from '@playwright/test';

const PORT = 3200;
const FIXTURE_PORT = 3299;

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : undefined,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: [
    {
      command: `node tests/e2e/fixture-server.mjs ${FIXTURE_PORT}`,
      port: FIXTURE_PORT,
      reuseExistingServer: false,
    },
    {
      command: `npx next dev -p ${PORT}`,
      port: PORT,
      timeout: 120_000,
      reuseExistingServer: false,
      env: {
        PGLITE_DIR: '.data/e2e',
        ADMIN_PASSWORD: 'e2e-admin-password',
        SESSION_SECRET: 'e2e-session-secret-that-is-long-enough-1234567890',
        TIMETABLE_URL: '',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    },
  ],
});
