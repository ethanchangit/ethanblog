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

  test('页脚切换主题并持久化', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('/');
    await page.evaluate(() => localStorage.removeItem('theme'));
    await page.reload();

    const footer = page.getByRole('contentinfo');
    const toggle = footer.getByRole('button', { name: '切换浅色/深色模式' });
    const island = footer.locator('astro-island').filter({
      has: page.getByRole('button', { name: '切换浅色/深色模式' }),
    });
    await toggle.scrollIntoViewIfNeeded();
    await expect(island).not.toHaveAttribute('ssr');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 25)');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await toggle.scrollIntoViewIfNeeded();
    await expect(island).not.toHaveAttribute('ssr');
    await toggle.click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('页脚钉在视口底，滚动后仍可点', async ({ page }) => {
    await page.goto('/articles/pkm-method');
    const footer = page.getByRole('contentinfo');
    await expect(footer).toBeInViewport();
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(footer).toBeInViewport();
    await expect(footer.getByRole('button', { name: '切换浅色/深色模式' })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(footer).toBeInViewport();
    const rss = footer.getByRole('link', { name: 'RSS' });
    await expect(rss).toBeVisible();
    await expect(rss).not.toContainText('RSS');
    await expect(footer.getByRole('link', { name: 'GitHub' })).not.toContainText('GitHub');
  });

  test('主题按钮在页脚、只有图标、没有「深色/浅色」文字', async ({ page }) => {
    await page.goto('/');
    const footer = page.getByRole('contentinfo');
    const toggle = footer.getByRole('button', { name: '切换浅色/深色模式' });
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).toBeVisible();
    await expect(toggle).not.toContainText('深色');
    await expect(toggle).not.toContainText('浅色');
    await expect(page.getByRole('button', { name: '切换浅色/深色模式' })).toHaveCount(1);
    await expect(page.locator('header').getByRole('button', { name: '切换浅色/深色模式' })).toHaveCount(0);
    await expect(footer).not.toContainText('©');
    await expect(footer).not.toContainText('ethanchang.io');
  });

  test('/projects 直达时使用夜间画布', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/projects');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 25)');
  });

  test('客户端导航到 /projects 保持夜间画布', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

    await page.getByRole('navigation').getByRole('link', { name: '项目' }).click();
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(25, 25, 25)');
  });
});
