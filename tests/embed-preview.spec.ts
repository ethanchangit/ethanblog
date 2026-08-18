import { test, expect } from '@playwright/test';

test('article can embed a tweet and a YouTube video together', async ({ page }) => {
  await page.goto('/articles/embed-preview');

  const tweet = page.locator('[data-tweet-embed]').first();
  await expect(tweet).toBeVisible();
  await expect(tweet).toHaveAttribute('href', 'https://x.com/gkxspace/status/2089292652940333288');
  await expect(page.getByText('这个组合确实有点牛逼').first()).toBeVisible();
  await expect(page.getByText(/显示更多|Show more|条回复/)).toHaveCount(0);
  await expect(page.locator('blockquote.twitter-tweet')).toHaveCount(0);
  await expect(page.locator('script[src*="widgets.js"]')).toHaveCount(0);

  const video = page.locator('iframe[src*="youtube.com/embed/H35nVgNGyo8"]').first();
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute(
    'title',
    '对话前DeepMind曹原：AI for Science爆发，一个新时代到来了',
  );
});
