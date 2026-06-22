import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('HOD dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(process.env.TEST_HOD_EMAIL ?? '');
    await page
      .locator('input[type="password"]')
      .fill(process.env.TEST_HOD_PASSWORD ?? '');
    await page.getByRole('button', { name: /sign in/i }).click();
    await page.waitForURL('/hod');
  });

  test('loads and passes axe', async ({ page }) => {
    await expect(page).toHaveURL('/hod');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows department key grid', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /keys/i })).toBeVisible();
  });

  test('unauthenticated user is redirected to login', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/hod');
    await expect(page).toHaveURL('/login');
  });
});
