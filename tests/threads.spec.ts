import { test, expect } from '@playwright/test';

test.describe('Threads routes removed', () => {
  test('/threads is gone', async ({ page }) => {
    const response = await page.goto('/threads');
    expect(response?.status()).toBe(404);
  });

  test('/threads/web-as-medium is gone', async ({ page }) => {
    const response = await page.goto('/threads/web-as-medium');
    expect(response?.status()).toBe(404);
  });

  test('nav has no 研究线 link', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header nav a[href="/threads"]')).toHaveCount(0);
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('Articles', {
      useInnerText: true,
    });
    await expect(page.locator('header nav a[href="/tags"]')).toHaveText('Tags', {
      useInnerText: true,
    });
  });
});
