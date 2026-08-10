import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// Non-mutation policy, same as the verifier specs: this spec never clicks
// Approve/Decline to completion. Unlike the CSO signature-mismatch spec
// (which loads an *existing* held alert from seed data), there is no way to
// observe a HELD_SIGNATURE_MISMATCH state here without actually submitting a
// real Approve — which writes a real SIGNATURE_MISMATCH audit entry even
// when the approval itself doesn't complete. So that terminal state isn't
// covered here; only client-side-validation and UI-state assertions are.

const openReviewSheetFromFirstRow = async (page: Page) => {
  const reviewButton = page
    .getByRole('button', { name: /^review weekend request from/i })
    .first();

  if (!(await reviewButton.isVisible().catch(() => false))) {
    test.skip();
    return null;
  }

  await reviewButton.click();
  await expect(
    page.getByRole('heading', { name: /weekend access request/i })
  ).toBeVisible();
  return reviewButton;
};

test.describe('Dean weekend-request review', () => {
  test.use({ storageState: 'playwright/.auth/dean.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/dean/weekend-requests');
    await expect(
      page.getByRole('heading', { name: /^weekend requests$/i })
    ).toBeVisible();
  });

  test('opening the review sheet shows the request detail and passes axe', async ({
    page,
  }) => {
    await openReviewSheetFromFirstRow(page);

    await expect(
      page.getByRole('button', { name: /^approve$/i })
    ).toBeVisible();
    await expect(
      page.getByRole('button', { name: /^decline$/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('a guest request requires a key to be assigned before Approve submits', async ({
    page,
  }) => {
    await openReviewSheetFromFirstRow(page);

    const keyPicker = page.getByLabel(/assign a key/i);
    if (!(await keyPicker.isVisible().catch(() => false))) {
      // This request isn't a guest request — the key picker only renders
      // for guests, so there's nothing to validate here.
      test.skip();
      return;
    }

    await page.getByRole('button', { name: /^approve$/i }).click();

    // Client-side zod validation blocks the submit — no API call is made.
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /weekend access request/i })
    ).toBeVisible();
  });

  test('an expired request disables both decision buttons', async ({
    page,
  }) => {
    await openReviewSheetFromFirstRow(page);

    const expiredNotice = page.getByText(
      /this request.s date has passed — it can no longer be approved or declined/i
    );
    if (!(await expiredNotice.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    await expect(
      page.getByRole('button', { name: /^approve$/i })
    ).toBeDisabled();
    await expect(
      page.getByRole('button', { name: /^decline$/i })
    ).toBeDisabled();
  });

  test('closing the sheet returns to the list', async ({ page }) => {
    await openReviewSheetFromFirstRow(page);

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: /weekend access request/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: /^weekend requests$/i })
    ).toBeVisible();
  });
});
