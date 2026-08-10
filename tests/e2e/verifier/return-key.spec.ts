import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Same non-mutation policy as issue-key.spec.ts: no assertion here ever
// completes a real return (valid code or override reason), since that
// marks a real key returned and writes a real audit_log entry against
// whatever backend BASE_URL points at. A "000000" code is a safe 404,
// same trick used for issuing.

const openReturnSheetFromFirstRow = async (page: Page) => {
  const returnButton = page
    .getByRole('button', { name: /^mark .+ as returned$/i })
    .first();

  if (!(await returnButton.isVisible().catch(() => false))) {
    test.skip();
    return null;
  }

  await returnButton.click();
  await expect(
    page.getByRole('heading', { name: /mark key as returned/i })
  ).toBeVisible();
  return returnButton;
};

test.describe('Verifier return-key flow', () => {
  test.use({ storageState: 'playwright/.auth/verifier.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/verifier/dashboard');
  });

  test('opening the sheet shows the code entry step and passes axe', async ({
    page,
  }) => {
    await openReturnSheetFromFirstRow(page);

    await expect(page.getByLabel(/return code/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /confirm return/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('switches to the override mode and back', async ({ page }) => {
    await openReturnSheetFromFirstRow(page);

    await page
      .getByRole('button', { name: /requester can.t provide a code/i })
      .click();
    await expect(
      page.getByLabel(/reason for returning without a code/i)
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /return without code/i })
    ).toBeVisible();

    await page.getByRole('button', { name: /enter a code instead/i }).click();
    await expect(page.getByLabel(/return code/i)).toBeVisible();
  });

  test('submitting fewer than 6 digits shows a validation error without calling the API', async ({
    page,
  }) => {
    await openReturnSheetFromFirstRow(page);

    await page.getByLabel(/return code/i).pressSequentially('123');
    await page.getByRole('button', { name: /confirm return/i }).click();

    await expect(
      page.getByText(/enter the 6-digit return code from the requester/i)
    ).toBeVisible();
    await expect(page.getByLabel(/return code/i)).toBeVisible();
  });

  test('an override reason under 3 characters shows a validation error', async ({
    page,
  }) => {
    await openReturnSheetFromFirstRow(page);
    await page
      .getByRole('button', { name: /requester can.t provide a code/i })
      .click();

    await page.getByLabel(/reason for returning without a code/i).fill('ab');
    await page.getByRole('button', { name: /return without code/i }).click();

    await expect(
      page.getByText(/give a brief reason for returning without a code/i)
    ).toBeVisible();
  });

  test('an unrecognised code shows the not-found error, not a false success', async ({
    page,
  }) => {
    await openReturnSheetFromFirstRow(page);

    await page.getByLabel(/return code/i).pressSequentially('000000');
    await page.getByRole('button', { name: /confirm return/i }).click();

    await expect(page.getByText(/return code not recognised/i)).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /mark key as returned/i })
    ).toBeVisible();
  });

  test('closing the sheet returns to the outstanding-keys list', async ({
    page,
  }) => {
    await openReturnSheetFromFirstRow(page);

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: /mark key as returned/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: /outstanding keys/i })
    ).toBeVisible();
  });
});
