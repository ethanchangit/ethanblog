import { test, expect } from '@playwright/test';

test('article can embed a tweet and a YouTube video together', async ({ page }) => {
  await page.goto('/articles/embed-preview');

  const tweet = page.locator('[data-tweet-embed]').filter({ visible: true });
  await expect(tweet).toBeVisible();
  await expect(tweet).not.toHaveAttribute('href');
  await expect(tweet.locator('[data-tweet-permalink]')).toHaveAttribute(
    'href',
    'https://x.com/gkxspace/status/2089292652940333288',
  );
  await expect(tweet.locator('[data-tweet-profile]').first()).toHaveAttribute(
    'href',
    'https://x.com/gkxspace',
  );
  const tweetVideo = tweet.locator('video');
  await expect(tweetVideo).toHaveAttribute('referrerpolicy', 'no-referrer');
  await expect(tweetVideo).toHaveAttribute('data-tweet-video-src', /video\.twimg\.com/);
  await expect(tweet.locator('[data-tweet-watch]')).toHaveAttribute(
    'href',
    'https://x.com/gkxspace/status/2089292652940333288',
  );
  await expect(page.getByText('这个组合确实有点牛逼').filter({ visible: true })).toBeVisible();
  await expect(page.getByText(/显示更多|Show more|条回复/)).toHaveCount(0);
  await expect(page.locator('blockquote.twitter-tweet')).toHaveCount(0);
  await expect(page.locator('script[src*="widgets.js"]')).toHaveCount(0);

  const video = page.locator('[data-video-embed]').filter({ visible: true });
  const facade = video.locator('[data-video-facade]');
  await expect(facade).toBeVisible();
  await expect(facade).toHaveAttribute('href', 'https://www.youtube.com/watch?v=H35nVgNGyo8');
  await expect(facade).toHaveAttribute(
    'aria-label',
    'A conversation with Cao Yuan, formerly of DeepMind: AI for Science is breaking out',
  );
  await expect(video.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Watch on YouTube/ }).first()).toBeVisible();
});
