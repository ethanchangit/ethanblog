import { test, expect } from '@playwright/test';

const inner = { useInnerText: true } as const;

test.describe('Blogs 索引', () => {
  test('/blogs 列出手工引用的文章与项目', async ({ page }) => {
    await page.goto('/blogs');
    await expect(page.getByRole('heading', { level: 1, name: 'Blogs' })).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/articles"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(page.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/heptabase-method"] h3')).toBeVisible();
    await expect(page.locator('a[href="/articles/series-demo"] h3')).toBeVisible();
    await expect(page.locator('a[href="/projects/aletheia"] h3')).toBeVisible();
  });

  test('/zh/blogs 是中文名单', async ({ page }) => {
    await page.goto('/zh/blogs');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('博客', inner);
    await expect(page.locator('[data-reading-index-switch] a[href="/zh/articles"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/zh/projects"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/zh/blogs"]')).toHaveCount(0);
    await expect(page.locator('a[href="/zh/articles/pkm-method"] h3')).toBeVisible();
    await expect(page.locator('a[href="/zh/projects/aletheia"] h3')).toBeVisible();
  });
});
