import { test, expect } from '@playwright/test';

test.describe('InteractiveDemo poster 档', () => {
  test('带 poster 的示例：点击前显示预览图，点击后加载 iframe', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('interactive-demo');
    await section.scrollIntoViewIfNeeded();

    const posterImg = section.locator('img[src*="posters"]');
    await expect(posterImg).toBeVisible();

    await section.getByRole('button', { name: '▶ 启动演示' }).click();
    const iframe = section.locator('iframe');
    await expect(iframe).toHaveAttribute('src', /\/demos\/knowledge-garden\//);
  });

  test('无 poster 的示例保持旧行为（点击前无预览图）', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('interactive-demo-robert');
    await section.scrollIntoViewIfNeeded();

    await expect(section.locator('img')).toHaveCount(0);
    await expect(section.getByRole('button', { name: '▶ 启动演示' })).toBeVisible();
  });

  test('reduced-motion 下不自动播放 posterVideo', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/lab');
    const section = page.getByTestId('interactive-demo');
    await section.scrollIntoViewIfNeeded();

    await expect(section.locator('video[autoplay]')).toHaveCount(0);
    await expect(section.locator('img[src*="posters"]')).toBeVisible();
  });
});
