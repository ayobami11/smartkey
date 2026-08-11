// Lighthouse CI config for the Requester dashboard — the second highest
// -traffic screen per the report's operational description (docs/PRODUCT.md).
// Requester needs no MFA, so this is safe to run fully blocking. Expects
// LHCI_COOKIE (a "name=value; ..." Cookie header, produced by
// scripts/lighthouse-auth-cookie.mjs from playwright/.auth/requester.json)
// in the environment — see .github/workflows/lighthouse.yml.

const { buildConfig, BASE_URL } = require('./shared');

module.exports = buildConfig({
  urls: [`${BASE_URL}/requester/dashboard`],
  extraHeaders: process.env.LHCI_COOKIE
    ? { Cookie: process.env.LHCI_COOKIE }
    : undefined,
  outputDir: '.lighthouseci/requester',
});
