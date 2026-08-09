import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

import { loginAs } from '../utils/auth';

// Non-mutation policy, same as the other specs in this suite: never
// completes a real "Request key" submission — that creates a real request
// row and consumes a real key slot against whatever backend BASE_URL points
// at. Every assertion here is either UI state or client-side validation that
// blocks the API call from firing at all.

const openRequestSheetFromFirstKey = async (page: Page) => {
  const requestButton = page
    .getByRole('button', { name: /^request key /i })
    .first();

  if (!(await requestButton.isVisible().catch(() => false))) {
    test.skip();
    return null;
  }

  await requestButton.click();
  await expect(
    page.getByRole('heading', { name: /request a key/i })
  ).toBeVisible();
  return requestButton;
};

test.describe('Requester request-key flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAs(page, 'REQUESTER');
  });

  test('opening the sheet shows the return-deadline field and passes axe', async ({
    page,
  }) => {
    await openRequestSheetFromFirstKey(page);

    const deadline = page.getByLabel(/return by/i);
    await expect(deadline).toBeVisible();
    await expect(deadline).toHaveAttribute('type', 'datetime-local');
    await expect(
      page.getByRole('button', { name: /^request key$/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('the return-deadline field enforces a minimum of today', async ({
    page,
  }) => {
    await openRequestSheetFromFirstKey(page);

    const today = new Date().toISOString().slice(0, 10);
    await expect(page.getByLabel(/return by/i)).toHaveAttribute(
      'min',
      `${today}T00:00`
    );
  });

  test('a past return time is rejected client-side without calling the API', async ({
    page,
  }) => {
    await openRequestSheetFromFirstKey(page);

    // A definitely-past datetime, bypassing the native min attribute by
    // filling the input directly rather than using the picker.
    await page.getByLabel(/return by/i).fill('2020-01-01T09:00');
    await page.getByRole('button', { name: /^request key$/i }).click();

    await expect(
      page.getByText(/return time must be in the future/i)
    ).toBeVisible();
    // Still on the form — a client-side validation failure never opens the
    // "Submitting request..." step.
    await expect(page.getByLabel(/return by/i)).toBeVisible();
  });

  test('closing the sheet returns to the dashboard', async ({ page }) => {
    await openRequestSheetFromFirstKey(page);

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: /request a key/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: /authorised keys/i })
    ).toBeVisible();
  });
});
