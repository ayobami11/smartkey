import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('landing page', () => {
  test('renders and passes axe', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/SmartKey/i);
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('login link navigates to /login', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /sign in/i }).first().click();
    await expect(page).toHaveURL('/login');
  });
});

test.describe('login page', () => {
  test('renders and passes axe', async ({ page }) => {
    await page.goto('/login');
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('shows error on invalid credentials', async ({ page }) => {
    await page.goto('/login');
    // pressSequentially, not fill: WebKit applies input[type=email]'s native
    // value-sanitization on a bulk .fill() assignment and silently clears
    // it, which left the field empty, tripped client-side "enter a valid
    // email" validation instead of ever reaching the server, and made the
    // assertion below pass by matching Next's unrelated, always-present
    // (and visually hidden) __next-route-announcer__ rather than any real
    // error — the login error itself renders as a Sonner toast, which
    // carries no ARIA alert role at all, so getByRole('alert') was never
    // actually checking the thing this test claims to check, in any
    // browser. Asserting on the toast's real text fixes both problems.
    await page.getByLabel(/email/i).pressSequentially('nobody@example.com');
    await page.locator('input[type="password"]').pressSequentially('wrongpassword');
    await page.getByRole('button', { name: /sign in/i }).click();
    await expect(page.getByText(/invalid email or password/i)).toBeVisible();
  });
});
