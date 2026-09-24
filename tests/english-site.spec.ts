import { test, expect } from '@playwright/test';

// ethanchang.io is the English blog; locally en.localhost plays that host (see src/lib/hosts.ts).
const EN = 'http://en.localhost:4322';

test.describe('English site (ethanchang.io)', () => {
  test('the home is the English article list in English UI', async ({ page }) => {
    const response = await page.goto(`${EN}/`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(`${EN}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('Articles');
    await expect(page.locator('header.site-nav a[href="/tags"]')).toHaveText('Tags');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ethanchang.io/');
    // Before translations are published, Chinese articles are listed and open on the Chinese site.
    const chinese = page.locator('[data-chinese-only]');
    await expect(chinese.getByRole('heading', { name: 'In Chinese' })).toBeVisible();
    await expect(chinese.locator('a[href="/_lang/zh/articles/pkm-method"]')).toHaveCount(1);
  });

  test('pages without an English version open on the Chinese site', async ({ page }) => {
    await page.goto(`${EN}/now`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^http:\/\/localhost:4322\/now\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.goto(`${EN}/articles/pkm-method`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^http:\/\/localhost:4322\/articles\/pkm-method\/?$/);
  });

  test('the language switch moves between the two hosts and keeps the path', async ({ page }) => {
    await page.goto(`${EN}/`, { waitUntil: 'domcontentloaded' });
    await page.locator('header.site-nav [data-site-switch]').click();
    await expect(page).toHaveURL('http://localhost:4322/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.locator('header.site-nav [data-site-switch]').click();
    await expect(page).toHaveURL(`${EN}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('the internal /en build prefix never shows', async ({ request }) => {
    // Node does not resolve *.localhost, so send the English host as a header.
    for (const [host, to] of [['en.localhost:4322', `${EN}/articles`], ['localhost:4322', `${EN}/articles`]]) {
      const response = await request.get('http://127.0.0.1:4322/en/articles', { headers: { host }, maxRedirects: 0 });
      expect(response.status()).toBe(301);
      expect(response.headers().location).toBe(to);
    }
  });
});
