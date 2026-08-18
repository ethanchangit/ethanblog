import { test, expect } from '@playwright/test';

test('article can embed a tweet and a YouTube video together', async ({ page }) => {
  await page.goto('/articles/embed-preview');

  const tweet = page.getByRole('link', { name: '在 X 上查看 @gkxspace 的帖子' }).first();
  await expect(tweet).toBeVisible();
  await expect(tweet).toHaveAttribute('href', 'https://x.com/gkxspace/status/2089292652940333288');
  await expect(page.getByText(/Dethink 居然把 Claude Code/).first()).toBeVisible();

  const video = page.getByRole('button', {
    name: '播放视频：对话前DeepMind曹原：AI for Science爆发，一个新时代到来了',
  });
  await expect(video).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
});
