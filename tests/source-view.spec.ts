import { test, expect } from '@playwright/test';

test.describe('source-view（拆开看）', () => {
  test('articles do not inject source disclosures by default', async ({ page }) => {
    await page.goto('/articles/embed-preview/');

    await expect(page.locator('[data-tweet-embed]').filter({ visible: true })).toBeVisible();
    await expect(page.locator('[data-video-embed]').filter({ visible: true })).toBeVisible();
    await expect(page.locator('details.source-view')).toHaveCount(0);
  });

  test('lab page (.astro, not MDX) has no source disclosures', async ({ page }) => {
    await page.goto('/lab');
    await expect(page.getByRole('heading', { name: 'Component lab' })).toBeVisible();
    await expect(page.locator('details.source-view')).toHaveCount(0);
  });
});
