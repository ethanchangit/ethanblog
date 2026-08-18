import { test, expect } from '@playwright/test';

test('TweetEmbed shows full text, links to the original, and never loads widgets.js', async ({
  page,
}) => {
  const requested: string[] = [];
  page.on('request', (request) => {
    requested.push(request.url());
  });

  await page.goto('/lab');

  const section = page.getByTestId('tweet-embed');
  await section.scrollIntoViewIfNeeded();

  await expect(section.getByText('just setting up my twttr')).toBeVisible();
  await expect(section.getByText('@jack')).toBeVisible();

  const link = section.getByRole('link', { name: '在 X 上查看 @jack 的帖子' });
  await expect(link).toHaveAttribute('href', 'https://x.com/jack/status/20');
  await expect(link).toHaveAttribute('target', '_blank');

  await expect(page.locator('script[src*="widgets.js"]')).toHaveCount(0);
  await expect(page.locator('script[src*="platform.twitter.com"]')).toHaveCount(0);
  expect(
    requested.some((url) => /widgets\.js|platform\.twitter\.com/.test(url)),
    'page must not request the official X embed script',
  ).toBe(false);
});
