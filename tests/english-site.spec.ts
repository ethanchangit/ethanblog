import { test, expect } from '@playwright/test';

// One English blog. en.localhost and /en are old addresses for the same pages.
const SITE = 'http://localhost:4322';

test.describe('English site', () => {
  test('the home is the article list in English UI', async ({ page }) => {
    const response = await page.goto(`${SITE}/`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(`${SITE}/`);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-about-panel]')).toHaveCount(0);
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('Articles');
    await expect(page.locator('header.site-nav a[href="/tags"]')).toHaveText('Tags');
    await expect(page.locator('header.site-nav [data-site-switch]')).toHaveCount(0);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', 'https://ethanchang.io/');
    await expect(page.locator('a[href="/pkm-method"]').first()).toBeVisible();
  });

  test('the tags page lists the published articles', async ({ page }) => {
    const response = await page.goto(`${SITE}/tags`, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByRole('heading', { name: 'Tags', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: '知识管理', exact: true })).toBeVisible();
    await expect(page.locator('[data-doc-item]').first()).toBeAttached();
  });

  test('about and an article stay on this site', async ({ page }) => {
    await page.goto(`${SITE}/about`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^http:\/\/localhost:4322\/about\/?$/);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await page.goto(`${SITE}/pkm-method`, { waitUntil: 'domcontentloaded' });
    await expect(page).toHaveURL(/^http:\/\/localhost:4322\/pkm-method\/?$/);
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络');
  });

  test('old English host and /en prefix redirect onto the same path', async ({ request }) => {
    const hostRedirect = await request.get('http://127.0.0.1:4322/en/articles', {
      headers: { host: 'en.localhost:4322' },
      maxRedirects: 0,
    });
    expect(hostRedirect.status()).toBe(301);
    expect(hostRedirect.headers().location).toBe('http://localhost:4322/articles');
    const prefix = await request.get('http://127.0.0.1:4322/en/articles', {
      headers: { host: 'localhost:4322' },
      maxRedirects: 0,
    });
    expect(prefix.status()).toBe(301);
    expect(prefix.headers().location).toBe('http://localhost:4322/articles');
  });
});
