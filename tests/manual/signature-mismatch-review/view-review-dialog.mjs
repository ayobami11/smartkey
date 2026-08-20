// Mints a CSO session and drives a real headless browser to /cso/dashboard,
// screenshots the signature-mismatch alert and its review dialog, then
// declines it. Requires `bun run dev` running against the local stack and
// trigger-mismatch.mjs to have already produced a held alert (see ../README.md).
import { chromium } from 'playwright-core';
import { mintSessionCookies } from './trigger-mismatch.mjs';

const OUT_DIR = process.argv[2] ?? '.';

const main = async () => {
  const cookies = await mintSessionCookies('local-test-cso@example.com', 'cso');

  const browser = await chromium.launch();
  const context = await browser.newContext();
  await context.addCookies(
    cookies.map((c) => {
      const idx = c.indexOf('=');
      return {
        name: c.slice(0, idx),
        value: c.slice(idx + 1),
        url: 'http://localhost:3000',
      };
    })
  );

  const page = await context.newPage();
  await page.goto('http://localhost:3000/cso/dashboard', {
    waitUntil: 'networkidle',
  });

  await page.waitForSelector('text=Signature mismatches', { timeout: 15000 });
  await page.screenshot({ path: `${OUT_DIR}/dashboard.png`, fullPage: true });

  await page
    .getByRole('button', { name: /review/i })
    .first()
    .click();
  await page.waitForSelector('[role="dialog"]', { timeout: 10000 });
  await page.waitForTimeout(500); // let both <img> tags settle
  await page.screenshot({ path: `${OUT_DIR}/dialog.png` });

  await page.getByLabel(/i have reviewed the contributing factors/i).check();
  await page.getByRole('button', { name: /decline/i }).click();
  await page.waitForSelector('text=Declined', { timeout: 10000 });
  await page.screenshot({ path: `${OUT_DIR}/resolved.png` });

  await browser.close();
  console.log(
    `Screenshots written to ${OUT_DIR}/{dashboard,dialog,resolved}.png`
  );
};

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  }
);
