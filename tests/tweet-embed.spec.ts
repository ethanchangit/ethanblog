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

  const card = section.locator('[data-tweet-embed]');
  await expect(card).toBeVisible();
  await expect(section.getByText('just setting up my twttr')).toBeVisible();
  await expect(section.getByText('@jack')).toBeVisible();
  await expect(section.locator('.tweet-embed__body')).not.toHaveCSS('overflow', 'hidden');

  const link = section.getByRole('link', { name: '在 X 上查看 @jack 的帖子' });
  await expect(link).toHaveAttribute('href', 'https://x.com/jack/status/20');
  await expect(link).toHaveAttribute('target', '_blank');

  await expect(page.locator('blockquote.twitter-tweet')).toHaveCount(0);
  await expect(page.locator('script[src*="widgets.js"]')).toHaveCount(0);
  await expect(page.locator('script[src*="platform.twitter.com"]')).toHaveCount(0);
  await expect(section.getByText(/显示更多|Show more|条回复/)).toHaveCount(0);
  expect(
    requested.some((url) => /widgets\.js|platform\.twitter\.com/.test(url)),
    'page must not request the official X embed script',
  ).toBe(false);
});

test('TweetEmbed keeps long posts fully expanded', async ({ page }) => {
  await page.goto('/lab');

  const section = page.getByTestId('tweet-embed-gkx');
  await section.scrollIntoViewIfNeeded();

  const card = section.locator('[data-tweet-embed]');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('href', 'https://x.com/gkxspace/status/2089292652940333288');
  await expect(section.getByText('这个组合确实有点牛逼')).toBeVisible();
  await expect(section.getByText('🔗和优惠码放评论区')).toBeVisible();
  await expect(section.getByText(/显示更多|Show more|条回复/)).toHaveCount(0);
});
