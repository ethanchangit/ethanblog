import { test, expect } from '@playwright/test';

const CARD = 'main h3';

test.describe('文章列表分页', () => {
  test('首页至多 7 条，并标出年份', async ({ page }) => {
    await page.goto('/articles');

    await expect(page.locator(CARD)).toHaveCount(7);
    await expect(page.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();
    await expect(page.locator('a[href="/articles/embed-preview"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/series-demo"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-05"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-01"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/series-demo/1"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/series-demo/2"]')).toHaveCount(0);

    const earlier = page.getByRole('link', { name: 'Earlier' });
    await expect(earlier).toHaveAttribute('href', '/articles/2');
    await expect(page.getByRole('link', { name: 'Newer' })).toHaveCount(0);
  });

  test('文章索引不收录项目', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.locator('a[href="/projects/robert"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/robert"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Robert' })).toHaveCount(0);
  });

  test('第 2 页是余下 2 条，可回到首页', async ({ page }) => {
    await page.goto('/articles/2');

    await expect(page.locator(CARD)).toHaveCount(2);
    await expect(page.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-02"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/embed-preview"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/pkm-method"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/series-demo"]')).toHaveCount(0);

    const newer = page.getByRole('link', { name: 'Newer' });
    await expect(newer).toHaveAttribute('href', '/articles');
    await expect(page.getByRole('link', { name: 'Earlier' })).toHaveCount(0);
  });
});

test.describe('文章列表分页（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('首页 7 条仍在，「更早」是真实链接', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.locator(CARD)).toHaveCount(7);

    await page.getByRole('link', { name: 'Earlier' }).click();
    await expect(page).toHaveURL(/\/articles\/2\/?$/);
    await expect(page.locator(CARD)).toHaveCount(2);
    await expect(page.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
  });
});
