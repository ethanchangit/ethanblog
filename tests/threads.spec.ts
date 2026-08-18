import { test, expect } from '@playwright/test';

test.describe('Threads (研究线)', () => {
  test('/threads still resolves', async ({ page }) => {
    const response = await page.goto('/threads');
    expect(response?.status()).toBe(200);
  });

  test('/threads/web-as-medium still resolves', async ({ page }) => {
    const response = await page.goto('/threads/web-as-medium');
    expect(response?.status()).toBe(200);
  });

  test('nav no longer exposes 研究线', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('header nav a[href="/threads"]')).toHaveCount(0);
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('文章', {
      useInnerText: true,
    });
  });
});
