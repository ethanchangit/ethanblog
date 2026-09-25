import { test, expect, type Page } from '@playwright/test';

const MOBILE = [
  { width: 375, height: 812 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
] as const;

const ROUTES = [
  '/',
  '/articles',
  '/heptabase-method',
  '/pkm-method',
  '/embed-preview',
  '/projects',
  '/aletheia',
  '/tags',
  '/search',
] as const;

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
    true,
  );
}

async function box(page: Page, selector: string) {
  const el = page.locator(selector).first();
  if ((await el.count()) === 0) return null;
  if (!(await el.isVisible())) return null;
  return el.boundingBox();
}

function expectTap(box: { width: number; height: number } | null, label: string) {
  expect(box, label).toBeTruthy();
  expect(box!.width, `${label} width`).toBeGreaterThanOrEqual(40);
  expect(box!.height, `${label} height`).toBeGreaterThanOrEqual(40);
}

test.describe('手机阅读', () => {
  for (const vp of MOBILE) {
    test(`@${vp.width} 关键路由不横向溢出，主 chrome 可点`, async ({ page }) => {
      await page.setViewportSize(vp);

      for (const route of ROUTES) {
        await page.goto(route, { waitUntil: 'domcontentloaded' });
        await expect(page.locator('main')).toBeVisible();
        await expectNoPageOverflow(page);

        const html = await page.evaluate(() => getComputedStyle(document.documentElement).overflowY);
        expect(html).not.toBe('hidden');

        expectTap(await box(page, 'header.site-nav a[aria-label="Home"]'), `${route} home`);
        expectTap(await box(page, 'header.site-nav [data-page-station="about"]'), `${route} about`);
        expectTap(await box(page, 'header.site-nav [data-page-station="now"]'), `${route} now`);
        expectTap(await box(page, 'header.site-nav [data-page-station="contact"]'), `${route} contact`);
        expectTap(await box(page, 'header.site-nav [data-page-station="privacy"]'), `${route} privacy`);
        expectTap(await box(page, 'header.site-nav a[href="/tags"]'), `${route} tags`);
        expectTap(await box(page, 'header.site-nav a[href="/search"]'), `${route} search`);
        expectTap(await box(page, 'footer.site-footer button.theme-toggle'), `${route} theme`);
        await expect(page.locator('footer.site-footer button[aria-haspopup="listbox"]')).toHaveCount(0);
      }
    });
  }

  test('首页列表不再裁成桌面窗格，文档可滚', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const index = page.locator('[data-reading-index]');
    await expect(index).toBeVisible();
    const maxH = await index.evaluate((el) => getComputedStyle(el).maxHeight);
    expect(maxH).toBe('none');
    const canScroll = await page.evaluate(() => {
      const before = window.scrollY;
      window.scrollTo({ top: 400, behavior: 'instant' });
      const moved = window.scrollY > before;
      window.scrollTo({ top: 0, behavior: 'instant' });
      return moved || document.documentElement.scrollHeight > window.innerHeight + 40;
    });
    expect(canScroll).toBe(true);
    const nav = await page.locator('header.site-nav').boundingBox();
    const heading = await page.locator('[data-reading-index] .reading-index-heading h1').boundingBox();
    expect(nav).toBeTruthy();
    expect(heading).toBeTruthy();
    expect(heading!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height - 2);
    await expect(page.locator('[data-about-panel]')).toBeHidden();
    await expect(page.locator('[data-reading-doc]')).toBeHidden();
  });

  test('长文不显示 TOC，返回键靠左，列表与正文不同时出现', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/heptabase-method', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reading-index]')).toBeHidden();
    await expect(page.locator('[data-reading-rail]')).toBeHidden();
    await expect(page.locator('.reading-toc-entry')).toHaveCount(0);
    await expect(page.getByRole('link', { name: "目录" })).toHaveCount(0);
    const back = page.getByRole('link', { name: "← Articles" });
    await expect(back).toBeVisible();
    const nav = await page.locator('header.site-nav').boundingBox();
    const backBox = await back.boundingBox();
    const titleBox = await page.locator('[data-reading-doc] .article-lede h1').boundingBox();
    expect(nav).toBeTruthy();
    expect(backBox).toBeTruthy();
    expect(titleBox).toBeTruthy();
    expect(backBox!.y).toBeGreaterThanOrEqual(nav!.y + nav!.height - 2);
    expect(backBox!.x).toBeLessThan(48);
    expect(Math.abs(backBox!.x - titleBox!.x)).toBeLessThan(8);
  });

  test('文章列表页窄屏只显示列表', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/articles', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-doc]')).toBeHidden();
    await expect(page.locator('[data-reading-rail]')).toBeHidden();
    await expect(page.getByRole('link', { name: "← Articles" })).toHaveCount(0);
  });

  test('iPad 横屏仍是三栏，目录在右', async ({ page }) => {
    await page.setViewportSize({ width: 1180, height: 820 });
    await page.goto('/pkm-method', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    await expect(page.locator('[data-reading-rail] nav.toc').filter({ visible: true })).toBeVisible();
    await expect(page.getByRole('link', { name: "← Articles" })).toBeHidden();
  });

  test('留言发送键不掉出视口宽，热区够点', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/pkm-method', { waitUntil: 'domcontentloaded' });
    const send = page.locator('.comment-send');
    await send.scrollIntoViewIfNeeded();
    await expect(send).toBeVisible();
    const box = await send.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.x + box!.width).toBeLessThanOrEqual(375 + 1);
    expect(box!.x).toBeGreaterThanOrEqual(-1);
    expect(box!.height).toBeGreaterThanOrEqual(40);
  });

  test('embed 页推文与视频不撑出页面', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/embed-preview', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-tweet-embed]').filter({ visible: true })).toBeVisible();
    await expect(page.locator('[data-video-embed]').filter({ visible: true })).toBeVisible();
    await expectNoPageOverflow(page);
    const tweet = await page.locator('[data-tweet-embed]').filter({ visible: true }).boundingBox();
    expect(tweet).toBeTruthy();
    expect(tweet!.width).toBeLessThanOrEqual(375);
  });

  test('横屏 667 可滚且不横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 667, height: 375 });
    await page.goto('/pkm-method', { waitUntil: 'domcontentloaded' });
    await expectNoPageOverflow(page);
    const html = await page.evaluate(() => getComputedStyle(document.documentElement).overflow);
    expect(html).not.toBe('hidden');
    await expect(page.getByRole('link', { name: "← Articles" })).toBeVisible();
    const scrolled = await page.evaluate(() => {
      window.scrollTo({ top: 200, behavior: 'instant' });
      return window.scrollY > 0;
    });
    expect(scrolled).toBe(true);
  });

  test('reduced-motion 下导航仍可点', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expectNoPageOverflow(page);
    await page.locator('header.site-nav a[href="/tags"]').click();
    await expect(page).toHaveURL(/\/tags\/?$/);
    await expect(page.getByRole('heading', { name: "Tags" })).toBeVisible();
  });

  test('窄屏只保留中文版', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    const tags = page.locator('header.site-nav a[href="/tags"]');
    await expect(tags).toHaveText("Tags", { useInnerText: true });
    await expect(tags.locator('.i18n-en')).toBeVisible();
    await expect(tags.locator('.i18n-zh')).toHaveCount(0);
  });
});
