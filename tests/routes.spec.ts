import { test, expect } from '@playwright/test';
import { KEY_PAGES_FOR_LINK_CHECK, STATIC_ROUTES } from './helpers/routes';

test.describe('Route crawling', () => {
  for (const route of STATIC_ROUTES) {
    test(`${route} returns 200`, async ({ page }) => {
      const response = await page.goto(route, { waitUntil: 'domcontentloaded' });
      expect(response?.status()).toBe(200);
    });
  }

  test('/ is the about/home page', async ({ page }) => {
    const response = await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', {
      useInnerText: true,
    });
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-index] a[aria-current="page"]')).toHaveCount(0);
  });

  test('/zh redirects to the only Chinese home page', async ({ page }) => {
    const response = await page.goto('/zh', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page).toHaveURL(url => url.pathname === '/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', {
      useInnerText: true,
    });
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章', {
      useInnerText: true,
    });
    await expect(page.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(page.locator('[data-reading-index]')).toBeVisible();
  });

  test('/about redirects to /', async ({ page }) => {
    const response = await page.goto('/about', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(response?.request().redirectedFrom()).toBeTruthy();
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', {
      useInnerText: true,
    });
  });

  test('/now renders the living status', async ({ page }) => {
    const response = await page.goto('/now', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    const lede = page.locator('article > header.mb-10');
    await expect(lede.locator('h1')).toHaveText('现在', { useInnerText: true });
    await expect(lede.locator('p.ui-meta')).toHaveText('更新于 2026 年 8 月 21 日', {
      useInnerText: true,
    });
    await expect(page.getByText('这是一页 Now：最近在做什么。', { exact: false })).toBeVisible();
    await expect(
      page.locator('.prose-site a[href="https://nownownow.com/about"]').filter({ visible: true }),
    ).toHaveText('nownownow.com');
    await expect(page.getByText('写博客，打磨笔记与项目页')).toBeVisible();
  });

  test('/404 page renders', async ({ page }) => {
    const response = await page.goto('/404', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: "这个页面不存在" })).toBeVisible();
  });

  test('unknown route serves 404 content', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist', { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: "这个页面不存在" })).toBeVisible();
  });

  test('/studio is not shipped in the production preview', async ({ page, request }) => {
    const pageResponse = await page.goto('/studio', { waitUntil: 'domcontentloaded' });
    expect(pageResponse?.status()).toBe(404);
    const api = await request.get('/__studio/api/docs');
    expect(api.status()).toBeGreaterThanOrEqual(400);
  });

  for (const route of KEY_PAGES_FOR_LINK_CHECK) {
    test(`${route} has no broken internal links`, async ({ page, request }) => {
      await page.goto(route, { waitUntil: 'domcontentloaded' });
      if (route === '/zh') await expect(page).toHaveURL(url => url.pathname === '/');
      const hrefs = await page.locator('a[href^="/"]').evaluateAll((anchors) =>
        [
          ...new Set(
            anchors
              .map((a) => a.getAttribute('href'))
              .filter((href): href is string => !!href && !href.startsWith('//'))
              .map((href) => href.split('#')[0])
              .filter((href) => href.length > 0),
          ),
        ],
      );

      for (const href of hrefs) {
        const response = await request.get(href);
        expect(response.status(), `broken link ${href} on ${route}`).toBeLessThan(400);
      }
    });
  }
});
