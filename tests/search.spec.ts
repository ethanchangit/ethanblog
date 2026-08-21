import { test, expect } from '@playwright/test';

const PKM = 'My PKM practice: from notes to a knowledge network';
const PLACEHOLDER = 'Placeholder 2026-05';

test.describe('站点搜索', () => {
  test('导航最右侧是搜索图标，点击进入 /search', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header nav');
    const search = nav.locator('a[href="/search"]');
    await expect(search).toBeVisible();
    await expect(search).toHaveAttribute('aria-label', 'Search');
    await expect(search).not.toContainText('Search');

    const items = nav.locator('ul > li');
    await expect(items.last().locator('a[href="/search"]')).toHaveCount(1);

    await search.click();
    await expect(page).toHaveURL(/\/search\/?$/);
    await expect(page.getByRole('heading', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.getByTestId('site-search')).toBeVisible();
  });

  test('无查询时列出已发布文章，不含草稿', async ({ page }) => {
    await page.goto('/search');
    await expect(page.getByRole('heading', { name: PKM })).toBeVisible();
    await expect(page.getByRole('heading', { name: PLACEHOLDER })).toBeVisible();
    await expect(page.getByRole('heading', { name: '页面即房间：一篇你读着读着就动手改写了的文章' })).toHaveCount(0);
  });

  test('输入关键字即时过滤标题、标签与摘要', async ({ page }) => {
    await page.goto('/search');
    await page.getByTestId('site-search').fill('PKM');

    await expect(page.getByRole('heading', { name: PKM })).toBeVisible();
    await expect(page.getByRole('heading', { name: PLACEHOLDER })).toBeHidden();
  });

  test('GET ?q= 过滤结果并回填输入框', async ({ page }) => {
    await page.goto('/search?q=Obsidian');
    await expect(page.getByTestId('site-search')).toHaveValue('Obsidian');
    await expect(page.getByRole('heading', { name: PKM })).toBeVisible();
    await expect(page.getByRole('heading', { name: PLACEHOLDER })).toBeHidden();
  });

  test('无匹配时显示空状态', async ({ page }) => {
    await page.goto('/search?q=zzz-no-such-article');
    await expect(page.getByText('No matching articles.')).toBeVisible();
    await expect(page.getByRole('heading', { name: PKM })).toBeHidden();
  });
});

test.describe('站点搜索（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('输入框仍在，表单可 GET', async ({ page }) => {
    await page.goto('/search');
    const input = page.getByTestId('site-search');
    await expect(input).toBeVisible();
    await expect(page.locator('form[role="search"]')).toHaveAttribute('method', 'get');
    await expect(page.getByRole('heading', { name: PKM })).toBeVisible();
  });
});
