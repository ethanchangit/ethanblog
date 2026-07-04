import { test, expect } from '@playwright/test';

test.describe('Theme（浅色/深色）', () => {
  test('默认跟随系统偏好（浅色）', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('theme'));
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  });

  test('系统偏好深色时默认夜间模式', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('theme'));
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 25)');
  });

  test('导航栏切换主题并持久化', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.reload();

    await page.getByRole('button', { name: '切换浅色/深色模式' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 25)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('button', { name: '切换浅色/深色模式' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });
});
