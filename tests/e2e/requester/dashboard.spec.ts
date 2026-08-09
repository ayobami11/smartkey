import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('Requester dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page
      .getByLabel(/email/i)
      .fill(process.env.TEST_REQUESTER_EMAIL ?? '');
    await page
      .locator('input[type="password"]')
      .fill(process.env.TEST_REQUESTER_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/requester/dashboard');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/requester/dashboard');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows authorised keys grid', async ({ page }) => {
    await expect(
      page.getByRole('heading', { name: /authorised keys/i })
    ).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/requester/dashboard');
    await expect(page).toHaveURL('/login');
  });
});
