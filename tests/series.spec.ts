import { test, expect } from '@playwright/test';

const HUB = '/articles/series-demo';
const PART1 = '/articles/series-demo/1';
const PART2 = '/articles/series-demo/2';
const HUB_TITLE = '系列演示：一篇教程';
const PART1_TITLE = '系列演示 · 第 1 页';
const PART2_TITLE = '系列演示 · 第 2 页';

test.describe('系列子文', () => {
  test('总览在文章列表，子页不在', async ({ page }) => {
    await page.goto('/articles');
    await expect(page.locator(`a[href="${HUB}"] h3`)).toBeVisible();
    await expect(page.locator(`a[href="${PART1}"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="${PART2}"]`)).toHaveCount(0);
  });

  test('子页是可打开的页面，不进搜索和 RSS', async ({ page, request }) => {
    const part1 = await page.goto(PART1);
    expect(part1?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: PART1_TITLE })).toBeVisible();

    await page.goto('/search');
    await expect(page.getByRole('heading', { name: HUB_TITLE })).toBeVisible();
    await expect(page.getByRole('heading', { name: PART1_TITLE })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: PART2_TITLE })).toHaveCount(0);

    const rss = await request.get('/rss.xml');
    expect(rss.status()).toBe(200);
    const xml = await rss.text();
    expect(xml).toContain(HUB_TITLE);
    expect(xml).not.toContain(PART1_TITLE);
    expect(xml).not.toContain(PART2_TITLE);
  });

  test('总览列出篇目，子页可翻上一篇/下一篇', async ({ page }) => {
    await page.goto(HUB);
    const hubNav = page.locator('[data-series="hub"]');
    await expect(hubNav.getByText('篇目')).toBeVisible();
    await expect(hubNav.locator(`a[href="${PART1}"]`)).toBeVisible();
    await expect(hubNav.locator(`a[href="${PART2}"]`)).toBeVisible();

    await hubNav.locator(`a[href="${PART1}"]`).click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/1\/?$/);
    await expect(page.locator('[data-series="parent"] a')).toHaveAttribute('href', HUB);
    await expect(page.locator('[data-series-prev]')).toHaveCount(0);
    await expect(page.locator('[data-series-next]')).toHaveAttribute('href', PART2);

    await page.locator('[data-series-next]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/2\/?$/);
    await expect(page.locator('[data-series-prev]')).toHaveAttribute('href', PART1);
    await expect(page.locator('[data-series-next]')).toHaveCount(0);

    await page.locator('[data-series="parent"] a').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
  });
});

test.describe('系列子文（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('总览篇目和子页翻页仍是真实链接', async ({ page }) => {
    await page.goto(HUB);
    await page.locator('[data-series="hub"] a[href="/articles/series-demo/1"]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/1\/?$/);
    await page.locator('[data-series-next]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/2\/?$/);
  });
});
