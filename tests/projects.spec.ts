import { test, expect } from '@playwright/test';

test.describe('Projects 超媒体长页', () => {
  test('/projects 是叙事长页而非卡片网格', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.getByRole('heading', { name: '作品是一条线' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '时间线：从卡片到容器' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Aletheia → Trace：阅读时学词' })).toBeVisible();

    // 旧版卡片网格不应存在
    await expect(page.locator('.grid.gap-4.sm\\:grid-cols-2')).toHaveCount(0);

    // 内嵌可体验演示
    await expect(page.getByText('Network · 键盘笔记')).toBeVisible();
    await expect(page.getByText('Robert · 语音笔记')).toBeVisible();
  });

  test('文末保留项目档案链接', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.getByRole('heading', { name: '项目档案' })).toBeVisible();
    // 档案区在「项目档案」标题之后的列表；用 ul 定位，避开正文内联链接
    await expect(page.locator('ul a[href="/projects/trace"]').last()).toBeVisible();
    await expect(page.locator('ul a[href="/projects/chunk"]').last()).toBeVisible();
  });
});
