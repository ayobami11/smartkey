import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('CSO dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Sign in as CSO before each test.
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_CSO_EMAIL ?? '');
    await page
      .locator('input[type="password"]')
      .fill(process.env.TEST_CSO_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/cso');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/cso');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows live zone counters', async ({ page }) => {
    await expect(page.getByText(/new senate/i)).toBeVisible();
    await expect(page.getByText(/old senate/i)).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/cso');
    await expect(page).toHaveURL('/login');
  });
});
