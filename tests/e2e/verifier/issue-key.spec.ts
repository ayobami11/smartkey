import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';

// This spec deliberately never completes a real "Issue key" submission —
// doing so would mark a real request KEY_ISSUED and write a real audit_log
// entry against whatever backend BASE_URL points at. Every assertion below
// either inspects UI state (button enabled/disabled, form validation) or
// exercises a code that cannot possibly match a live request (safe 404
// paths), matching the pattern already used in
// cso/signature-mismatch-alerts.spec.ts for the same reason.

const openIssueSheetFromFirstQueueRow = async (page: Page) => {
  const issueButton = page
    .getByRole('button', { name: /^issue key for/i })
    .first();

  if (!(await issueButton.isVisible().catch(() => false))) {
    test.skip();
    return null;
  }

  await issueButton.click();
  await expect(
    page.getByRole('heading', { name: /issue a key/i })
  ).toBeVisible();
  return issueButton;
};

test.describe('Verifier issue-key flow', () => {
  test.use({ storageState: 'playwright/.auth/verifier.json' });

  test.beforeEach(async ({ page }) => {
    await page.goto('/verifier/dashboard');
  });

  test('opening the sheet shows the code entry step and passes axe', async ({
    page,
  }) => {
    await openIssueSheetFromFirstQueueRow(page);

    await expect(page.getByLabel(/verification code/i)).toBeVisible();
    await expect(
      page.getByRole('button', { name: /issue key/i })
    ).toBeVisible();

    const results = await new AxeBuilder({ page })
      .include('[role="dialog"]')
      .analyze();
    expect(results.violations).toHaveLength(0);
  });

  test('submitting fewer than 6 digits shows a validation error without calling the API', async ({
    page,
  }) => {
    await openIssueSheetFromFirstQueueRow(page);

    await page.getByLabel(/verification code/i).pressSequentially('123');
    await page.getByRole('button', { name: /issue key/i }).click();

    await expect(
      page.getByText(/enter the 6-digit code sent to the requester/i)
    ).toBeVisible();
    // Still on the code step — a failed client-side validation never reaches
    // the success step.
    await expect(page.getByLabel(/verification code/i)).toBeVisible();
  });

  test('an unrecognised code shows the not-found error, not a false success', async ({
    page,
  }) => {
    await openIssueSheetFromFirstQueueRow(page);

    // A fixed, almost-certainly-unassigned code — this hits the real
    // /api/requests/collect endpoint but can only ever 404, never issue.
    await page.getByLabel(/verification code/i).pressSequentially('000000');
    await page.getByRole('button', { name: /issue key/i }).click();

    await expect(
      page.getByText(/code not recognised or expired/i)
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: /issue a key/i })
    ).toBeVisible();
  });

  test('high-risk requests gate the Issue button behind the acknowledgement checkbox', async ({
    page,
  }) => {
    const highRiskBadge = page.getByLabel('high risk').first();

    if (!(await highRiskBadge.isVisible().catch(() => false))) {
      test.skip();
      return;
    }

    // Walk up from the badge to the nearest ancestor that also contains an
    // Issue button — that's the queue row, regardless of exact markup depth.
    const highRiskRow = highRiskBadge.locator(
      'xpath=ancestor::div[.//button[starts-with(@aria-label, "Issue key for")]][1]'
    );

    await highRiskRow.getByRole('button', { name: /^issue key for/i }).click();
    await expect(
      page.getByRole('heading', { name: /issue a key/i })
    ).toBeVisible();

    const acknowledgement = page.getByRole('checkbox', {
      name: /reviewed the contributing factors/i,
    });
    const issueButton = page.getByRole('button', { name: /issue key/i });

    await expect(acknowledgement).toBeVisible();
    await expect(issueButton).toBeDisabled();

    await acknowledgement.check();
    await expect(issueButton).toBeEnabled();

    // Unchecking re-gates it — the acknowledgement isn't a one-time unlock.
    await acknowledgement.uncheck();
    await expect(issueButton).toBeDisabled();
  });

  test('closing the sheet returns to the queue', async ({ page }) => {
    await openIssueSheetFromFirstQueueRow(page);

    await page.keyboard.press('Escape');
    await expect(
      page.getByRole('heading', { name: /issue a key/i })
    ).not.toBeVisible();
    await expect(
      page.getByRole('heading', { name: /pending requests/i })
    ).toBeVisible();
  });
});
