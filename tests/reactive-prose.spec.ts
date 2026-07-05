import { test, expect } from '@playwright/test';

test.describe('反应式散文（Var + Calc）', () => {
  test('SSR 初值：正文数字与计算结果直接可读', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('reactive-prose');
    await expect(section).toContainText('10 张卡片');
    await expect(section).toContainText('3650 张');
    await expect(section).toContainText('100 天');
  });

  test('无 JS 降级：裸 HTML 里就有计算好的初值', async ({ page }) => {
    const res = await page.request.get('/lab');
    const html = await res.text();
    expect(html).toContain('3650');
    expect(html).toContain('data-rvar="page:cards"');
  });

  test('键盘调整 Var，跨岛屿联动 Calc 立即重算', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('reactive-prose');
    await section.scrollIntoViewIfNeeded();

    // client:visible 注水后 Var 才亮出 slider 语义
    const slider = section.locator('[role="slider"]');
    await expect(slider).toBeVisible();

    await slider.focus();
    await page.keyboard.press('ArrowRight');

    await expect(slider).toHaveAttribute('aria-valuenow', '11');
    await expect(section).toContainText('11 张卡片');
    // 11 * 365 = 4015；ceil(1000 / 11) = 91 —— 两个 Calc 都要联动
    await expect(section).toContainText('4015 张');
    await expect(section).toContainText('91 天');
  });

  test('Shift + 方向键 = 十倍步长，且 clamp 在 max', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('reactive-prose');
    await section.scrollIntoViewIfNeeded();
    const slider = section.locator('[role="slider"]');
    await expect(slider).toBeVisible();

    await slider.focus();
    await page.keyboard.press('Shift+ArrowRight'); // 10 → 20
    await expect(slider).toHaveAttribute('aria-valuenow', '20');

    await page.keyboard.press('End'); // → max = 50
    await expect(slider).toHaveAttribute('aria-valuenow', '50');
    await page.keyboard.press('ArrowUp'); // clamp：不越过 max
    await expect(slider).toHaveAttribute('aria-valuenow', '50');
    await expect(section).toContainText('18250 张'); // 50 * 365
  });

  test('reduced-motion 下渲染与键盘交互不受影响', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/lab');
    const section = page.getByTestId('reactive-prose');
    await section.scrollIntoViewIfNeeded();
    const slider = section.locator('[role="slider"]');
    await expect(slider).toBeVisible();
    await slider.focus();
    await page.keyboard.press('ArrowRight');
    await expect(section).toContainText('4015 张');
  });
});
