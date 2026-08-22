import { test, expect } from '@playwright/test';

const HUB = '/articles/series-demo';
const PART1 = '/articles/series-demo/1';
const PART2 = '/articles/series-demo/2';
const HUB_TITLE = 'A demo of a series of content';
const PART1_TITLE = 'Series demo · Part 1';
const PART2_TITLE = 'Series demo · Part 2';
const HUB_LISTING = '.article-shell [data-series="hub-inline"]:visible';

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
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(HUB);

    const listing = page.locator(HUB_LISTING);
    await expect(listing).toBeVisible();
    await expect(listing.getByRole('heading', { level: 2, name: 'Chapters' })).toBeVisible();
    await expect(listing.locator(`a[href="${PART1}"] h3`)).toHaveText(PART1_TITLE, {
      useInnerText: true,
    });
    await expect(listing.locator(`a[href="${PART2}"] h3`)).toHaveText(PART2_TITLE, {
      useInnerText: true,
    });
    await expect(listing.locator(`a[href="${PART1}"]`)).toContainText('First chapter');
    await expect(listing.locator(`a[href="${PART2}"]`)).toContainText('Second chapter');
    await expect(listing.locator(`a[href="${PART1}"] .ui-meta .i18n-en`)).toHaveText(
      'June 1, 2026',
      { useInnerText: true },
    );
    await expect(listing.locator(`a[href="${PART1}"] .ui-meta .i18n-zh`)).toHaveText(
      '2026 年 6 月 1 日',
      { useInnerText: true },
    );

    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(page.locator('nav.reading-series')).toHaveCount(0);

    await listing.locator(`a[href="${PART1}"]`).click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(HUB_TITLE, {
      useInnerText: true,
    });
    const child = page.locator('[data-reading-child]');
    await expect(child.locator('.article-lede h1')).toHaveText(PART1_TITLE, { useInnerText: true });
    await expect(page.locator('[data-reading-rail] nav.reading-series')).toHaveCount(0);
    const close = child.locator(
      'header.article-lede > div.flex.justify-between [data-reading-child-close]',
    );
    await expect(close).toBeVisible();
    await expect(close).toHaveText('Close', { useInnerText: true });
    await expect(child.locator('[data-series-prev]')).toHaveCount(0);
    await expect(child.locator('[data-series-next]')).toHaveAttribute('href', PART2);

    await child.locator('[data-series-next]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(child.locator('.article-lede h1')).toHaveText(PART2_TITLE, { useInnerText: true });
    await expect(child.locator('[data-series-prev]')).toHaveAttribute('href', PART1);
    await expect(child.locator('[data-series-next]')).toHaveCount(0);

    await page.locator('[data-reading-child-close]').click();
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(page.locator('nav.reading-series')).toHaveCount(0);
    await expect(listing).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(HUB_TITLE, {
      useInnerText: true,
    });
  });

  test('直接打开子页仍可翻篇并回到总览', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(PART1);
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

  test('低于第三栏宽度时篇目仍整页打开', async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 720 });
    await page.goto(HUB);
    await page.locator(`${HUB_LISTING} a[href="${PART1}"]`).click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/1\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(PART1_TITLE, {
      useInnerText: true,
    });
  });
});

test.describe('系列子文（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('总览篇目和子页翻页仍是真实链接', async ({ page }) => {
    await page.goto(HUB);
    await page.locator(`${HUB_LISTING} a[href="${PART1}"]`).click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/1\/?$/);
    await page.locator('[data-series-next]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/2\/?$/);
  });
});
