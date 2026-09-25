import { test, expect } from '@playwright/test';

// ethanchang.io is the English blog; locally en.localhost plays that host (see src/lib/hosts.ts).
const EN = 'http://en.localhost:4322';

test.describe('English site (ethanchang.io)', () => {
  test('the home is the English article list in English UI', async ({ page }) => {
    const response = await page.goto(`${EN}/`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(`${EN}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-about-panel]')).toHaveCount(0);
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('Articles');
    await expect(page.locator('header.site-nav a[href="/tags"]')).toHaveText('Tags');
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ethanchang.io/');
    // Before translations are published, Chinese articles are listed and open on the Chinese site.
    const chinese = page.locator('[data-chinese-only]');
    await expect(chinese.locator('a[href="/_lang/zh/pkm-method"]')).toHaveCount(1);
  });

  test('the tags page is the English index of the same tags', async ({ page }) => {
    const response = await page.goto(`${EN}/tags`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(/\/tags\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Tags', exact: true })).toBeVisible();
    await expect(page.locator('[data-tag-group-tabs]')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '写作与知识' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: '知识管理', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '媒介', exact: true })).toBeVisible();
    // No English translation is published, so Chinese articles are not listed as if they were.
    await expect(page.locator('[data-doc-item]')).toHaveCount(0);

    await page.goto(`${EN}/tags/PKM`, { waitUntil: 'domcontentloaded' });
    await expect.poll(() => new URL(page.url()).searchParams.get('tag')).toBe('PKM');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: '我的 PKM 实践：从笔记到知识网络' })).toHaveCount(0);
  });

  test('pages without an English version open on the Chinese site', async ({ page }) => {
    await page.goto(`${EN}/about`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^http:\/\/localhost:4322\/about\/?$/);
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', { useInnerText: true });
    await page.goto(`${EN}/now`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^http:\/\/localhost:4322\/now\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await page.goto(`${EN}/pkm-method`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^http:\/\/localhost:4322\/pkm-method\/?$/);
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
