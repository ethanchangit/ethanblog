import { test, expect } from '@playwright/test';

test.describe('Threads routes removed', () => {
  test('/threads is gone', async ({ page }) => {
    const response = await page.goto('/threads', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(404);
  });

  test('/threads/web-as-medium is gone', async ({ page }) => {
    const response = await page.goto('/threads/web-as-medium', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(404);
  });

  test('nav has no 研究线 link', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('header.site-nav a[href="/threads"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/articles"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/tags"]')).toHaveText("Tags", {
      useInnerText: true,
    });
  });
});
