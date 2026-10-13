import { describe, expect, it } from 'vitest';

import { escapeHtml, markup, nBtn, nP } from '@/lib/email/html';

describe('markup', () => {
  it('escapes interpolated text', () => {
    expect(markup`<p>${'<script>"&\'</script>'}</p>`.toString()).toBe(
      "<p>&lt;script&gt;&quot;&amp;'&lt;/script&gt;</p>"
    );
  });

  it('keeps fragments as markup', () => {
    const name = '<b>Jane</b>';
    expect(markup`<p>${markup`<strong>${name}</strong>`}</p>`.toString()).toBe(
      '<p><strong>&lt;b&gt;Jane&lt;/b&gt;</strong></p>'
    );
  });

  it('joins arrays and drops false, null and undefined', () => {
    expect(
      markup`${[markup`<a>`, false, null, undefined, 'x<', 1]}`.toString()
    ).toBe('<a>x&lt;1');
  });

  it('escapes a helper text argument but not a fragment argument', () => {
    expect(nP('a <i>b</i>').toString()).toContain('a &lt;i&gt;b&lt;/i&gt;');
    expect(nP(markup`a <i>b</i>`).toString()).toContain('a <i>b</i>');
  });

  it('escapes an href so it cannot break out of the attribute', () => {
    const btn = nBtn('Go', 'https://x.test/"><script>').toString();
    expect(btn).toContain('href="https://x.test/&quot;&gt;&lt;script&gt;"');
    expect(btn).not.toContain('"><script>');
  });

  it('escapeHtml leaves plain text alone', () => {
    expect(escapeHtml("Dean's Office, Ground Floor")).toBe(
      "Dean's Office, Ground Floor"
    );
  });
});
