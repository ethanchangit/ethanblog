import { test, expect } from '@playwright/test';

const FINAL = '/articles/how-this-site-works/';
const NOTE = '/articles/notes/web-as-medium/01-medium-engine-groundwork/';

test.describe('Article 论文化接口（T2）', () => {
  test('定稿页有摘要小标与引用块', async ({ page }) => {
    const response = await page.goto(FINAL);
    expect(response?.status()).toBe(200);

    const header = page.locator('article header');
    await expect(header.getByText('摘要', { exact: true })).toBeVisible();
    await expect(header.getByText(/文 \//)).toHaveCount(0);

    const footer = page.locator('article footer');
    await expect(footer.getByText('请这样引用')).toBeVisible();
    const citeBlock = footer.locator('section', { hasText: '请这样引用' });
    await expect(citeBlock).toContainText('ethanchang.io');
  });

  test('1440×900 下悬挂目录默认是刻度，悬停/聚焦展开后可点锚点', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FINAL);

    const toc = page.locator('nav.toc');
    await expect(toc).toBeVisible();

    const firstLabel = toc.locator('a .toc-label').first();
    await expect(firstLabel).toHaveCSS('opacity', '0');

    await toc.locator('.sticky').hover();
    await expect(firstLabel).toHaveCSS('opacity', '1');

    await page.mouse.move(0, 0);
    await expect(firstLabel).toHaveCSS('opacity', '0');

    await toc.locator('a').first().focus();
    await expect(firstLabel).toHaveCSS('opacity', '1');

    await toc.locator('a').first().click();
    await expect(page).toHaveURL(/#.+/);
  });

  test('390×844 下折叠目录可见、悬挂目录隐藏、无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FINAL);

    await expect(page.locator('details.toc-mobile')).toBeVisible();
    await expect(page.locator('nav[aria-label="目录"]')).toBeHidden();

    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fits).toBe(true);
  });

  test('notebook 页有研究线眉头，无引用块，文末有 mailto', async ({ page }) => {
    const response = await page.goto(NOTE);
    expect(response?.status()).toBe(200);

    const masthead = page.locator('article header a[href*="/threads/web-as-medium"]');
    await expect(masthead).toBeVisible();
    await expect(masthead).toContainText('研究线：');
    await expect(masthead).toContainText('把网页当动态媒介');

    await expect(page.getByText('请这样引用')).toHaveCount(0);

    const mailto = page.locator('article footer a[href^="mailto:"]');
    await expect(mailto).toBeVisible();
  });
});
