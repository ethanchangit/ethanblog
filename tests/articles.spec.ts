import { test, expect } from '@playwright/test';

const CARD = 'main h3';

test.describe('文章列表分页', () => {
  test('首页至多 7 条，并标出年份', async ({ page }) => {
    await page.goto('/articles');

    await expect(page.locator(CARD)).toHaveCount(7);
    await expect(page.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();
    await expect(page.locator('a[href="/articles/software-creation-journey"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-05"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/pkm-method"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/dummy-2026-01"]')).toHaveCount(0);

    const earlier = page.getByRole('link', { name: '更早' });
    await expect(earlier).toHaveAttribute('href', '/articles/2');
    await expect(page.getByRole('link', { name: '更新' })).toHaveCount(0);
  });

  test('第 2 页是余下 3 条，可回到首页', async ({ page }) => {
    await page.goto('/articles/2');

    await expect(page.locator(CARD)).toHaveCount(3);
    await expect(page.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();
    await expect(page.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-02"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/software-creation-journey"]')).toHaveCount(0);

    const newer = page.getByRole('link', { name: '更新' });
    await expect(newer).toHaveAttribute('href', '/articles');
    await expect(page.getByRole('link', { name: '更早' })).toHaveCount(0);
  });
});

test.describe('文章列表分页（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('首页 7 条仍在，「更早」是真实链接', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.locator(CARD)).toHaveCount(7);

    await page.getByRole('link', { name: '更早' }).click();
    await expect(page).toHaveURL(/\/articles\/2\/?$/);
    await expect(page.locator(CARD)).toHaveCount(3);
    await expect(page.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
  });
});
