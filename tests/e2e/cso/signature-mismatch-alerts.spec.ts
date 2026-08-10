import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('CSO signature mismatch alerts', () => {
  test.use({ storageState: 'playwright/.auth/cso.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/cso/dashboard');
  });

  test('shows the signature mismatches section and passes axe', async ({
    page,
  }) => {
    await expect(page).toHaveURL('/cso/dashboard');
    await expect(
      page.getByRole('heading', { name: /signature mismatches/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('opens the review dialog when an alert is present', async ({ page }) => {
    const reviewButton = page.getByRole('button', { name: /review/i }).first();

    // Only exercise the dialog if a mismatch alert exists in this environment's
    // seed data — the empty state is covered by the axe scan above.
    if (!(await reviewButton.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await reviewButton.click();
    await expect(
      page.getByRole('dialog', { name: /signature mismatch/i })
    ).toBeVisible();

    const acknowledgement = page.getByLabel(
      /i have reviewed the contributing factors above/i
    );
    const approveButton = page.getByRole('button', {
      name: /approve anyway/i,
    });
    const declineButton = page.getByRole('button', { name: /decline/i });

    await expect(approveButton).toBeDisabled();
    await expect(declineButton).toBeDisabled();

    await acknowledgement.check();
    await expect(approveButton).toBeEnabled();
    await expect(declineButton).toBeEnabled();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(results.violations).toHaveLength(0);
  });
});
