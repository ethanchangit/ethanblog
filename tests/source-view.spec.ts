import { test, expect } from '@playwright/test';

test.describe('source-view（拆开看）', () => {
  test('articles do not inject source disclosures by default', async ({ page }) => {
    await page.goto('/articles/embed-preview/');

    await expect(page.locator('[data-tweet-embed]').first()).toBeVisible();
    await expect(page.locator('iframe[src*="youtube.com/embed"], [data-video-embed]').first()).toBeVisible();
    await expect(page.locator('details.source-view')).toHaveCount(0);
  });

  test('lab page (.astro, not MDX) has no source disclosures', async ({ page }) => {
    await page.goto('/lab');
    await expect(page.getByRole('heading', { name: '组件试验场' })).toBeVisible();
    await expect(page.locator('details.source-view')).toHaveCount(0);
  });
});
