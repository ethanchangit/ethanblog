import { test, expect } from '@playwright/test';

test.describe('Projects 集合页', () => {
  test('/projects 是导语 + 时间线，不是项目长文', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.getByRole('heading', { name: '项目是一条线' })).toBeVisible();
    await expect(page.locator('.ui-eyebrow')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '时间线：从卡片到容器' })).toBeVisible();
    await expect(page.locator('[data-tl-item]').first()).toBeVisible();

    // 旧版卡片网格不应存在
    await expect(page.locator('.grid.gap-4.sm\\:grid-cols-2')).toHaveCount(0);

    // 单项目长文与内嵌演示已迁到档案页
    await expect(page.getByRole('heading', { name: 'Aletheia → Trace：阅读时学词' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Network：卡片与键盘' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Robert：语音与块' })).toHaveCount(0);
    await expect(page.getByText('Network · 键盘笔记')).toHaveCount(0);
    await expect(page.getByText('Robert · 语音笔记')).toHaveCount(0);
  });

  test('时间线节点链到对应项目页', async ({ page }) => {
    await page.goto('/projects');
    const links: [string, string][] = [
      ['0', '/projects/network'],
      ['1', '/projects/robert'],
      ['2', '/projects/aletheia'],
      ['3', '/projects/trace'],
      ['4', '/projects/chunk'],
      ['5', '/projects/ethanchang-io'],
    ];
    for (const [idx, href] of links) {
      await expect(page.locator(`[data-tl-item="${idx}"] a[href="${href}"]`)).toBeVisible();
    }
  });

  test('演示与长文在独立档案页', async ({ page }) => {
    await page.goto('/projects/network');
    await expect(page.getByText('Networks · 早期原型切片', { exact: true })).toBeVisible();
    await expect(page.getByText('双手永远放在键盘上')).toBeVisible();

    await page.goto('/projects/robert');
    await expect(page.getByText('Robert · 交互原型', { exact: true })).toBeVisible();
    await expect(page.getByText('把语音放在第一入口')).toBeVisible();
  });

  test('项目页页眉只有标题，没有状态芯片', async ({ page }) => {
    await page.goto('/projects/trace');
    const header = page.locator('article > header');
    await expect(header.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(header.locator('.mb-3.flex.items-center.gap-3')).toHaveCount(0);
    await expect(header.getByText('构思中')).toHaveCount(0);
    await expect(header.getByText('已发布')).toHaveCount(0);
    await expect(header.getByText('活跃开发')).toHaveCount(0);
  });

  test('项目页是单栏文章，没有右侧技术栈组件', async ({ page }) => {
    await page.goto('/projects/robert');
    await expect(page.getByRole('heading', { name: '技术栈' })).toHaveCount(0);
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(page.locator('article .grid.lg\\:grid-cols-\\[1fr_240px\\]')).toHaveCount(0);
    await expect(page.locator('article > header .ui-tag-list .ui-tag').first()).toBeVisible();
  });
});
