import { test, expect } from '@playwright/test';

test('TweetEmbed loads the official X widget', async ({ page }) => {
  await page.goto('/lab');

  const section = page.getByTestId('tweet-embed');
  await section.scrollIntoViewIfNeeded();

  const quote = section.locator('blockquote.twitter-tweet');
  await expect(quote).toBeAttached();
  await expect(quote.locator('a[href*="status/20"]')).toHaveCount(1);
  await expect(page.locator('script[src*="platform.twitter.com/widgets.js"]').first()).toBeAttached();
});
