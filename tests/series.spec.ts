import { test, expect } from '@playwright/test';

const HUB = '/articles/series-demo';
const PART1 = '/articles/series-demo/1';
const PART2 = '/articles/series-demo/2';
const HUB_TITLE = "这是我们 blog 发布一篇合集的样子";
const PART1_TITLE = "系列演示 · 第 1 页";
const PART2_TITLE = "系列演示 · 第 2 页";
const HUB_LISTING = '.article-shell [data-series="hub-inline"]:visible';

test.describe('系列子文', () => {
  test('总览在文章列表，子页不在', async ({ page }) => {
    await page.goto('/articles', { waitUntil: 'domcontentloaded' });
    await expect(page.locator(`a[href="${HUB}"] h3`)).toBeVisible();
    await expect(page.locator(`a[href="${PART1}"]`)).toHaveCount(0);
    await expect(page.locator(`a[href="${PART2}"]`)).toHaveCount(0);
  });

  test('子页可单独打开并进入全文搜索，但不进 RSS', async ({ page, request }) => {
    const part1 = await page.goto(PART1, { waitUntil: 'domcontentloaded' });
    expect(part1?.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1, name: PART1_TITLE })).toBeVisible();

    await page.goto('/search', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: HUB_TITLE })).toBeVisible();
    await expect(page.getByRole('heading', { name: PART1_TITLE })).toBeVisible();
    await expect(page.getByRole('heading', { name: PART2_TITLE })).toBeVisible();

    const rss = await request.get('/rss.xml');
    expect(rss.status()).toBe(200);
    const xml = await rss.text();
    expect(xml).toContain(HUB_TITLE);
    expect(xml).not.toContain(PART1_TITLE);
    expect(xml).not.toContain(PART2_TITLE);
  });

  test('总览列出篇目，子页可翻上一篇/下一篇', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(HUB, { waitUntil: 'domcontentloaded' });

    const listing = page.locator(HUB_LISTING);
    await expect(listing).toBeVisible();
    await expect(listing.getByRole('heading', { level: 2, name: "篇目" })).toBeVisible();
    await expect(listing.locator(`a[href="${PART1}"] h3`)).toHaveText(PART1_TITLE, {
      useInnerText: true,
    });
    await expect(listing.locator(`a[href="${PART2}"] h3`)).toHaveText(PART2_TITLE, {
      useInnerText: true,
    });
    await expect(listing.locator(`a[href="${PART1}"]`)).toContainText('系列第一页');
    await expect(listing.locator(`a[href="${PART2}"]`)).toContainText('系列第二页');
    await expect(listing.locator(`a[href="${PART1}"] .ui-meta`)).toHaveText(
      '2026 年 6 月 1 日',
      { useInnerText: true },
    );

    await expect(page.locator('[data-reading-rail] nav.toc')).toHaveCount(0);
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
    await expect(close).toHaveText("关闭", { useInnerText: true });
    await expect(child.locator('[data-series-prev]')).toHaveCount(0);
    await expect(child.locator('[data-series-next]')).toHaveAttribute('href', PART2);

    await child.locator('[data-series-next]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(child.locator('.article-lede h1')).toHaveText(PART2_TITLE, { useInnerText: true });
    await expect(child.locator('[data-series-prev]')).toHaveAttribute('href', PART1);
    await expect(child.locator('[data-series-next]')).toHaveCount(0);

    await page.locator('[data-reading-child-close]').click();
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(page.locator('[data-reading-rail] nav.toc')).toHaveCount(0);
    await expect(page.locator('nav.reading-series')).toHaveCount(0);
    await expect(listing).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(HUB_TITLE, {
      useInnerText: true,
    });
  });

  test('直接打开子页仍可翻篇并回到总览', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto(PART1, { waitUntil: 'domcontentloaded' });
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
    await page.goto(HUB, { waitUntil: 'domcontentloaded' });
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
    await page.goto(HUB, { waitUntil: 'domcontentloaded' });
    await page.locator(`${HUB_LISTING} a[href="${PART1}"]`).click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/1\/?$/);
    await page.locator('[data-series-next]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/2\/?$/);
  });
});

test('行内 mention 和引用中的下一层 mention 在右栏打开，主文章保持不变', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.route('**/articles/series-demo/1', async route => {
    const response = await route.fetch();
    const html = await response.text();
    const body = html.replace('这是教程的第 1 页。读者从总览进来，再翻到下一页。',
      '这是教程的第 1 页。<a href="/projects/robert" data-doc-mention>下一层引用资料</a>');
    expect(body).not.toBe(html);
    await route.fulfill({ response, body });
  });
  await page.goto('/articles/pkm-method', { waitUntil: 'domcontentloaded' });
  // The same marker emitted by fromHeptabase; no production content fixture is added.
  await page.evaluate(() => {
    const link = document.createElement('a'); link.href = '/articles/series-demo/1';
    link.dataset.docMention = ''; link.textContent = '打开行内引用资料';
    const prose = document.querySelector<HTMLElement>('[data-reading-doc] .prose-site')!;
    prose.insertBefore(link, prose.firstChild);
  });
  await page.getByRole('link', { name: '打开行内引用资料' }).click();
  const child = page.locator('[data-reading-child]');
  await expect(child.locator('.article-lede h1')).toHaveText(PART1_TITLE);
  await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
  await child.getByRole('link', { name: '下一层引用资料' }).click();
  await expect(page.locator('[data-reading-rail]')).toHaveAttribute('data-reading-child-src', '/projects/robert');
  await expect(child.locator('.article-lede h1')).toBeVisible();
  await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络');
  await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
  await child.locator('[data-reading-child-close]').click();
  await expect(child).toHaveCount(0);
});
