import { test, expect } from '@playwright/test';

test('articles do not inject source disclosures', async ({ page }) => {
  await page.goto('/embed-preview/', { waitUntil: 'domcontentloaded' });

  await expect(page.locator('[data-tweet-embed]').filter({ visible: true })).toBeVisible();
  await expect(page.locator('[data-video-embed]').filter({ visible: true })).toBeVisible();
  await expect(page.locator('details.source-view')).toHaveCount(0);
});
