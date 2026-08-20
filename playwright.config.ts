import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

// Next.js loads .env.local itself for the `bun run start` server this config
// spawns below, but the Playwright test runner is a separate process — without
// this, TEST_*/E2E_OTP_* are empty here even though the server sees them fine.
// No-ops harmlessly in CI, where .env.local doesn't exist and the real values
// come from the workflow's `env:` block instead.
loadEnv({ path: '.env.local' });

const baseURL = process.env.BASE_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'html',
  // Default is 30s. MFA specs (Dean/Verifier/CSO) wait on a real Gmail SMTP
  // send inside beforeEach — the send itself succeeds, but on a slow DNS path
  // resolving smtp.gmail.com alone can take ~20-25s, leaving no room under the
  // default before the OTP input is even polled for. This only widens the
  // test-runner's own budget; it changes nothing about how fast the app or the
  // login route actually behaves.
  timeout: 60_000,

  use: {
    baseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // Logs in once per role and saves the authenticated browser state to
    // playwright/.auth/<role>.json (see tests/e2e/auth.setup.ts). Every
    // MFA-gated spec (cso/*, dean/*, verifier/*) plus requester/* loads that
    // file via test.use({ storageState }) instead of calling loginAs()
    // themselves, so a real email-OTP round trip happens once per role per
    // run, not once per test. Without this, fullyParallel workers each
    // calling loginAs for the same shared test account race: every
    // /api/auth/login call overwrites that account's stored OTP hash, so a
    // sibling worker's already-fetched code can go stale before it submits.
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      dependencies: ['setup'],
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 5'] },
      dependencies: ['setup'],
    },
  ],

  webServer: {
    command: 'bun run start',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
