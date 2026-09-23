import { test, expect } from '@playwright/test';

const inner = { useInnerText: true } as const;

test.describe('Blogs 索引', () => {
  test('/blogs 列出已发布的 Blog 卡片', async ({ page }) => {
    await page.goto('/blogs', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { level: 1, name: "博客" })).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/articles"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/heptabase-method"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/series-demo"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/series-demo/1"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/series-demo/2"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/embed-preview"] h3')).toBeVisible();
    await expect(page.locator('a[href="/projects/aletheia"]')).toHaveCount(0);
    await expect(page.locator('main h3')).toHaveCount(56);
  });

  test('/zh/blogs 是中文名单', async ({ page }) => {
    await page.goto('/zh/blogs', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('博客', inner);
    await expect(page.locator('[data-reading-index-switch] a[href="/articles"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/embed-preview"] h3')).toBeVisible();
    await expect(page.locator('a[href="/projects/aletheia"]')).toHaveCount(0);
  });
});
