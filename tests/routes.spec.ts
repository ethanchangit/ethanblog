import { test, expect } from '@playwright/test';
import { KEY_PAGES_FOR_LINK_CHECK, STATIC_ROUTES } from './helpers/routes';

test.describe('Route crawling', () => {
  for (const route of STATIC_ROUTES) {
    test(`${route} returns 200`, async ({ page }) => {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
    });
  }

  test('/404 page renders', async ({ page }) => {
    const response = await page.goto('/404');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: '这个页面不存在' })).toBeVisible();
  });

  test('unknown route serves 404 content', async ({ page }) => {
    const response = await page.goto('/this-route-does-not-exist');
    expect(response?.status()).toBe(404);
    await expect(page.getByRole('heading', { name: '这个页面不存在' })).toBeVisible();
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
