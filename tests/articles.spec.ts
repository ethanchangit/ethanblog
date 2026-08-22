import { test, expect } from '@playwright/test';

const CARD = 'main h3';

test.describe('文章列表', () => {
  test('一次列出全部已发布文章，并标出年份', async ({ page }) => {
    await page.goto('/articles');

    await expect(page.locator(CARD)).toHaveCount(12);
    await expect(page.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: '2025' })).toBeVisible();
    await expect(page.locator('a[href="/articles/embed-preview"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/series-demo"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-05"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2025-01"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/series-demo/1"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/series-demo/2"]')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: '文章分页' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Earlier' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Newer' })).toHaveCount(0);
  });

  test('文章索引不收录项目', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.locator('a[href="/projects/robert"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/robert"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Robert' })).toHaveCount(0);
  });

  test('旧分页地址回到完整列表', async ({ page }) => {
    const response = await page.goto('/articles/2');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/articles');
    expect(response?.request().redirectedFrom()).toBeTruthy();
    await expect(page.locator(CARD)).toHaveCount(12);
    await expect(page.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2025-01"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/embed-preview"] h3')).toBeVisible();
  });
});

test.describe('文章列表（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('完整列表仍在，没有分页链', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.locator(CARD)).toHaveCount(12);
    await expect(page.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2025-01"] h3')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Earlier' })).toHaveCount(0);
  });
});
