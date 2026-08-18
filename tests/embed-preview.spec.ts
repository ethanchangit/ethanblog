import { test, expect } from '@playwright/test';

test('article can embed a tweet and a YouTube video together', async ({ page }) => {
  await page.goto('/articles/embed-preview');

  const tweet = page.locator('blockquote.twitter-tweet').first();
  await expect(tweet).toBeAttached();
  await expect(tweet.locator('a[href*="status/2089292652940333288"]')).toHaveCount(1);

  const video = page.locator('iframe[src*="youtube.com/embed/H35nVgNGyo8"]').first();
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute(
    'title',
    '对话前DeepMind曹原：AI for Science爆发，一个新时代到来了',
  );
});
