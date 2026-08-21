import { test, expect } from '@playwright/test';
import { KEY_PAGES_FOR_LINK_CHECK, STATIC_ROUTES } from './helpers/routes';

test.describe('Route crawling', () => {
  for (const route of STATIC_ROUTES) {
    test(`${route} returns 200`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
    });
  }

  test('/ is the about/home page', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', {
      useInnerText: true,
    });
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-index] a[aria-current="page"]')).toHaveCount(0);
  });

  test('/zh is the Chinese home page', async ({ page }) => {
    const response = await page.goto('/zh');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/zh');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', {
      useInnerText: true,
    });
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章', {
      useInnerText: true,
    });
    await expect(page.locator('[data-reading-index]')).toBeVisible();
  });

  test('/about redirects to /', async ({ page }) => {
    const response = await page.goto('/about');
    expect(response?.status()).toBe(200);
    expect(new URL(page.url()).pathname).toBe('/');
    expect(response?.request().redirectedFrom()).toBeTruthy();
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', {
      useInnerText: true,
    });
  });

  test('/now renders the living status', async ({ page }) => {
    const response = await page.goto('/now');
    expect(response?.status()).toBe(200);
    const lede = page.locator('article > header.mb-10');
    await expect(lede.locator('h1')).toHaveText('Now', { useInnerText: true });
    await expect(lede.locator('p.ui-meta')).toHaveText('Updated August 21, 2026', {
      useInnerText: true,
    });
    await expect(page.getByText("This is a Now page: what I'm doing lately.")).toBeVisible();
    await expect(
      page.locator('.prose-site a[href="https://nownownow.com/about"]').filter({ visible: true }),
    ).toHaveText('nownownow.com');
    await expect(page.getByText('Writing the blog, refining notes and project pages')).toBeVisible();
  });

  test('/404 page renders', async ({ page }) => {
    const response = await page.goto('/404');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
  });

  test('unknown route serves 404 content', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: 'This page does not exist' })).toBeVisible();
  });

  for (const route of KEY_PAGES_FOR_LINK_CHECK) {
    test(`${route} has no broken internal links`, async ({ page, request }) => {
      await page.goto(route);

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
