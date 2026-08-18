import { test, expect } from '@playwright/test';

const FINAL = '/articles/how-this-site-works/';
const NOTE = '/articles/notes/web-as-medium/01-medium-engine-groundwork/';

test.describe('Article 论文化接口（T2）', () => {
  test('定稿页有摘要小标，无页眉作者行', async ({ page }) => {
    const response = await page.goto(FINAL);
    expect(response?.status()).toBe(200);

    const header = page.locator('article header');
    await expect(header.getByText('摘要', { exact: true })).toBeVisible();
    await expect(header.getByText(/文 \//)).toHaveCount(0);
  });

  test('标题下可复制规范 URL，且在摘要之上', async ({ page }) => {
    await page.goto('/articles/software-creation-journey/');

    const copy = page.getByRole('button', { name: '复制本页链接' });
    const island = page.locator('astro-island').filter({ has: copy });
    await expect(copy).toBeVisible();
    await expect(island).not.toHaveAttribute('ssr');

    const ledeBottom = await page.locator('header.article-lede').evaluate((el) => {
      return el.getBoundingClientRect().bottom;
    });
    const copyTop = await copy.evaluate((el) => el.getBoundingClientRect().top);
    const abstractTop = await page.locator('.article-dek').evaluate((el) => {
      return el.getBoundingClientRect().top;
    });
    expect(copyTop).toBeGreaterThan(ledeBottom - 1);
    expect(copyTop).toBeLessThan(abstractTop);

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { __copiedUrl?: string }).__copiedUrl = text;
          },
        },
      });
    });

    await copy.click();
    await expect(page.getByRole('button', { name: '已复制' })).toBeVisible();

    const copied = await page.evaluate(
      () => (window as unknown as { __copiedUrl?: string }).__copiedUrl,
    );
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(copied).toBe(canonical);
    expect(copied).toMatch(/^https:\/\/ethanchang\.io\/articles\/software-creation-journey\/?$/);
  });

  test('1440×900 下悬挂目录标签可见、H3 有缩进、可点锚点', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/articles/software-creation-journey/');

    const toc = page.locator('nav.toc');
    await expect(toc).toBeVisible();

    const firstLabel = toc.locator('a .toc-label').first();
    await expect(firstLabel).toBeVisible();
    await expect(firstLabel).toHaveCSS('opacity', '1');

    const h3 = toc.locator('a[data-depth="3"]').first();
    await expect(h3).toBeVisible();
    const indent = await h3.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(indent).toBeGreaterThanOrEqual(12);

    await toc.locator('a').first().focus();
    await expect(toc.locator('a').first()).toBeFocused();

    await toc.locator('a').first().click();
    await expect(page).toHaveURL(/#.+/);
    await expect(toc.locator('a').first()).toHaveAttribute('aria-current', 'true');
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

  test('notebook 页无研究线眉头，无引用块', async ({ page }) => {
    const response = await page.goto(NOTE);
    expect(response?.status()).toBe(200);

    await expect(page.locator('.article-lede a[href*="/threads/"]')).toHaveCount(0);
    await expect(page.getByText('研究线：')).toHaveCount(0);
    await expect(page.getByText('把网页当动态媒介')).toHaveCount(0);
    await expect(page.getByText('请这样引用')).toHaveCount(0);
    await expect(page.getByRole('button', { name: '复制本页链接' })).toBeVisible();
  });

  test('文章列表笔记卡片只显示日期，不带研究线与编号', async ({ page }) => {
    await page.goto('/articles');
    const card = page.locator('a[href="/articles/notes/web-as-medium/01-medium-engine-groundwork"]');
    await expect(card.locator('.ui-meta .i18n-zh')).toHaveText('2026 年 7 月 3 日', {
      useInnerText: true,
    });
    await expect(card).not.toContainText('把网页当动态媒介', { useInnerText: true });
    await expect(card.locator('.ui-meta')).not.toContainText('#01', { useInnerText: true });
  });
});
