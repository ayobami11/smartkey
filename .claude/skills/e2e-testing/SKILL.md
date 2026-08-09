---
name: e2e-testing
description: Use this skill when writing or modifying Playwright E2E tests for SmartKey. Covers test file organisation by role, the axe-core accessibility requirement, Page Object Model conventions, happy-path and error-path requirements, flaky test patterns, and the CI matrix.
---

# E2E testing discipline

Every primary user flow in SmartKey has a Playwright E2E test. Tests are the regression net that catches breaks across role boundaries. The axe-core scan in every test is not optional — it is how SmartKey proves WCAG 2.2 AA compliance continuously, not at a point in time.

## When to apply

- Writing a new E2E test for a new screen or flow
- Modifying an existing test after a screen change
- Diagnosing a flaky test
- Setting up CI for E2E on a new route

## File organisation

Tests live in `tests/e2e/`, one folder per role, one file per screen or flow.

```
tests/
└── e2e/
    ├── cso/
    │   ├── dashboard.spec.ts
    │   ├── reports.spec.ts
    │   ├── audit.spec.ts
    │   ├── users.spec.ts
    │   ├── keys.spec.ts
    │   └── settings.spec.ts
    ├── hod/
    │   ├── dashboard.spec.ts
    │   ├── slot-management.spec.ts
    │   ├── weekend-requests.spec.ts
    │   └── onboarding.spec.ts
    ├── verifier/
    │   ├── dashboard.spec.ts
    │   ├── issue-key.spec.ts
    │   ├── return-key.spec.ts
    │   └── shift-handover.spec.ts
    ├── requester/
    │   ├── dashboard.spec.ts
    │   ├── request-key.spec.ts
    │   ├── code-display.spec.ts
    │   └── history.spec.ts
    └── public/
        ├── login.spec.ts
        └── activation.spec.ts
```

Unit tests co-locate next to source: `KeyTile.tsx` → `KeyTile.test.tsx`.

## What every E2E test must cover

For each screen:

- [ ] **Happy path** — complete the primary flow end to end
- [ ] **One error path** — a validation error or a failed fetch
- [ ] **axe-core scan** — zero violations on every assertion step
- [ ] **Keyboard navigation** — tab through all interactive elements
- [ ] **Theme toggle** — light → dark, verify state is preserved

```typescript
import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { loginAs } from '../utils/auth';

test.describe('Verifier: issue-key flow', () => {
  test.beforeEach(async ({ page }) => {
    // Signs in for real, OTP included — VERIFIER is MFA-gated
    // (src/app/api/auth/login/route.ts's MFA_ROLES), and there is no
    // test-mode bypass. loginAs() reads the emailed code back out of the
    // shared IMAP test mailbox. See docs/E2E_OTP_SETUP.md before wiring up a
    // new MFA-gated spec — filling in TEST_VERIFIER_EMAIL/PASSWORD alone is
    // NOT enough; the mailbox also has to be armed, or this times out on the
    // OTP screen exactly like the specs that shipped without this fixture did.
    await loginAs(page, 'VERIFIER');
  });

  test('happy path: issue key with valid code', async ({ page }) => {
    await page.fill('[data-testid="code-input"]', '123456');
    await expect(page.locator('[data-testid="requester-name"]')).toBeVisible();
    await page.click('[data-testid="issue-key-btn"]');
    await expect(
      page.locator('[data-testid="issue-confirmation"]')
    ).toBeVisible();

    // axe scan after the confirmation state
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('error path: invalid code shows error message', async ({ page }) => {
    await page.fill('[data-testid="code-input"]', '000000');
    await expect(page.locator('[data-testid="code-error"]')).toBeVisible();
    await expect(page.locator('[data-testid="code-error"]')).toContainText(
      'Code not recognised'
    );

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });
});
```

## Page Object Model

Encapsulate locators and common interactions in Page Objects under `tests/pages/`. Keep the POM thin — one method per user action, no assertions inside the POM.

```typescript
// tests/pages/VerifierDashboardPage.ts
import { type Page, type Locator } from '@playwright/test';

export class VerifierDashboardPage {
  readonly page: Page;
  readonly codeInput: Locator;
  readonly issueKeyBtn: Locator;
  readonly confirmationCard: Locator;
  readonly queue: Locator;

  constructor(page: Page) {
    this.page = page;
    this.codeInput = page.locator('[data-testid="code-input"]');
    this.issueKeyBtn = page.locator('[data-testid="issue-key-btn"]');
    this.confirmationCard = page.locator('[data-testid="issue-confirmation"]');
    this.queue = page.locator('[data-testid="request-queue"]');
  }

  async goto() {
    await this.page.goto('/verifier');
    await this.page.waitForLoadState('networkidle');
  }

  async enterCode(code: string) {
    await this.codeInput.fill(code);
    await this.page.waitForResponse((r) =>
      r.url().includes('/api/requests/lookup')
    );
  }

  async issueKey() {
    await this.issueKeyBtn.click();
    await this.confirmationCard.waitFor({ state: 'visible' });
  }
}
```

```typescript
// In the test
import { VerifierDashboardPage } from '../pages/VerifierDashboardPage';

test('issue key', async ({ page }) => {
  const dashboard = new VerifierDashboardPage(page);
  await dashboard.goto();
  await dashboard.enterCode('123456');
  await dashboard.issueKey();
  await expect(dashboard.confirmationCard).toBeVisible();
});
```

## axe-core scan pattern

Run the scan at the end of every logical state (loaded, error shown, success confirmed). Do not run only once at the end of the test — intermediate states may have violations.

```typescript
import AxeBuilder from '@axe-core/playwright';

// Scan helper to reduce repetition
const scanAccessibility = async (page: Page) => {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(results.violations).toHaveLength(0);
};

// Use it at each major state transition
await scanAccessibility(page); // after page loads
await page.click('[data-testid="submit"]');
await scanAccessibility(page); // after form submission
```

## Keyboard navigation test

```typescript
test('keyboard navigation reaches all interactive elements', async ({
  page,
}) => {
  await page.goto('/verifier');

  // Tab through all focusable elements
  const focusableCount = await page.evaluate(
    () =>
      document.querySelectorAll(
        'a, button, input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).length
  );

  for (let i = 0; i < focusableCount; i++) {
    await page.keyboard.press('Tab');
  }

  // Verify focus ring is visible (no outline:none without replacement)
  const focusedElement = await page.evaluate(
    () => document.activeElement?.tagName
  );
  expect(focusedElement).not.toBeNull();
});
```

## Theme toggle test

```typescript
test('dark mode toggle preserves page state', async ({ page }) => {
  const dashboard = new VerifierDashboardPage(page);
  await dashboard.goto();
  await dashboard.enterCode('123456');

  // State is present: requester name visible
  await expect(page.locator('[data-testid="requester-name"]')).toBeVisible();

  // Toggle to dark
  await page.click('[data-testid="theme-toggle"]');
  await expect(page.locator('html')).toHaveClass(/dark/);

  // State is still present
  await expect(page.locator('[data-testid="requester-name"]')).toBeVisible();

  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toHaveLength(0);
});
```

## Flaky test patterns

### Never use fixed timeouts

```typescript
// BAD: arbitrary sleep
await page.waitForTimeout(3000);

// GOOD: wait for a specific condition
await page.waitForResponse(
  (r) => r.url().includes('/api/requests') && r.status() === 200
);
await page.locator('[data-testid="queue-item"]').waitFor({ state: 'visible' });
```

### Wait for network idle on navigation

```typescript
await page.goto('/verifier');
await page.waitForLoadState('networkidle'); // wait for Realtime subscription + initial fetch
```

### Realtime-dependent elements

The verifier and CSO dashboards subscribe to Supabase Realtime on mount. In tests, seed the database before navigating and wait for the subscription to deliver data before asserting.

```typescript
// Seed a pending request in the test DB before navigating
await seedPendingRequest({ keyId: TEST_KEY_ID, requesterId: TEST_STAFF_ID });

await dashboard.goto();
// Wait for the seeded request to appear in the queue
await page
  .locator(`[data-testid="queue-item"][data-request-id="${requestId}"]`)
  .waitFor({
    state: 'visible',
    timeout: 10_000,
  });
```

### Quarantine flaky tests

```typescript
test('flaky: signature mismatch alert appears', async ({ page }) => {
  test.fixme(true, 'Flaky under slow CI — tracked at #87');
  // ...
});
```

## Playwright configuration

```typescript
// playwright.config.ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [
    ['html', { outputFolder: 'playwright-report' }],
    ['junit', { outputFile: 'playwright-results.xml' }],
  ],
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }, // Requester is phone-first
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

## CI configuration

```yaml
# .github/workflows/e2e.yml
name: E2E
on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e
        env:
          BASE_URL: ${{ vars.STAGING_URL }}
          TEST_VERIFIER_EMAIL: ${{ secrets.TEST_VERIFIER_EMAIL }}
          TEST_VERIFIER_PASSWORD: ${{ secrets.TEST_VERIFIER_PASSWORD }}
          TEST_STAFF_EMAIL: ${{ secrets.TEST_STAFF_EMAIL }}
          TEST_STAFF_PASSWORD: ${{ secrets.TEST_STAFF_PASSWORD }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: playwright-report/
          retention-days: 14
```

## E2E test checklist

Before marking a screen as complete:

- [ ] Test file exists at `tests/e2e/<role>/<screen>.spec.ts`
- [ ] Happy path completes without manual step
- [ ] At least one error path is tested
- [ ] axe-core scan runs and asserts zero violations
- [ ] Keyboard navigation test included
- [ ] Theme toggle test included
- [ ] No `waitForTimeout` — all waits are condition-based
- [ ] POM encapsulates locators; test body has no raw `locator()` calls for repeated elements
- [ ] `npm run test:e2e` passes locally before pushing
