import { test, expect } from '@playwright/test';

test.describe('Mention（正文 ↔ 媒介块双向高亮）', () => {
  test('悬停正文词语，两侧同时点亮；移开后熄灭', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('mention');
    await section.scrollIntoViewIfNeeded();

    const mention = section.locator('[data-mention="lab-mountain"]');
    const target = section.locator('[data-mention-target="lab-mountain"]');

    await mention.hover();
    await expect(mention).toHaveClass(/mention-active/);
    await expect(target).toHaveClass(/mention-active/);

    // 移开到无关区域
    await page.getByRole('heading', { name: 'Component lab' }).hover();
    await expect(mention).not.toHaveClass(/mention-active/);
    await expect(target).not.toHaveClass(/mention-active/);
  });

  test('悬停媒介块一侧，正文词语同步点亮（双向）', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('mention');
    await section.scrollIntoViewIfNeeded();

    await section.locator('[data-mention-target="lab-mountain"]').hover();
    await expect(section.locator('[data-mention="lab-mountain"]')).toHaveClass(/mention-active/);
  });

  test('键盘可用：Tab 聚焦点亮，Enter 把目标滚进视野', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('mention');
    await section.scrollIntoViewIfNeeded();

    const mention = section.locator('[data-mention="lab-mountain"]');
    const target = section.locator('[data-mention-target="lab-mountain"]');

    await mention.focus();
    await expect(mention).toHaveClass(/mention-active/);
    await expect(target).toHaveClass(/mention-active/);

    // 先把目标滚出视野，再按 Enter 拉回
    await page.evaluate(() => window.scrollTo(0, 0));
    await mention.focus();
    await page.keyboard.press('Enter');
    await expect(target).toBeInViewport();
  });

  test('无 JS 时正文完整可读（Mention 是普通文本）', async ({ page }) => {
    const res = await page.request.get('/lab');
    const html = await res.text();
    expect(html).toContain('data-mention="lab-mountain"');
    expect(html).toContain('data-mention-target="lab-mountain"');
    expect(html).toContain('这张山景图');
  });
});
