import { test, expect } from '@playwright/test';

test.describe('VerdictTable（裁决表）', () => {
  test('渲染语义表格：列头、行头、三种裁决符号', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('verdict-table');
    await section.scrollIntoViewIfNeeded();

    const table = section.locator('table.vt-table');
    await expect(table).toBeVisible();
    await expect(table.locator('thead th')).toHaveCount(4); // 角格 + 3 个维度
    await expect(table.locator('tbody tr')).toHaveCount(3);

    await expect(table.locator('.vt-yes').first()).toBeVisible();
    await expect(table.locator('.vt-partial').first()).toBeVisible();
    await expect(table.locator('.vt-no').first()).toBeVisible();
    // 备注小字与条形图
    await expect(table.locator('.vt-note').first()).toBeVisible();
    await expect(table.locator('.vt-bar').first()).toBeAttached();
  });

  test('零 JS 组件：不产生岛屿', async ({ page }) => {
    await page.goto('/lab');
    const islands = page.getByTestId('verdict-table').locator('astro-island');
    await expect(islands).toHaveCount(0);
  });

  test('窄屏（390px）表格自身横滚，页面不横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/lab');
    const section = page.getByTestId('verdict-table');
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator('table.vt-table')).toBeVisible();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });
});
