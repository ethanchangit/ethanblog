import { test, expect } from '@playwright/test';

test.describe('Studio 块编辑器 / @ [[', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('/studio');
    test.skip(res.status() === 404, 'Studio 只在 astro dev 注入');
  });

  test('斜杠改块、@ 插入行内链接、[[ 插入 embed 并在侧栏编辑', async ({ page }) => {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto('/studio');
    await expect(page.getByTestId('studio-app')).toBeVisible();

    await page.getByTestId('studio-filter').fill('dummy-2026-01');
    await page.locator('[data-open="articles:dummy-2026-01"]').click();
    const editor = page.getByTestId('studio-body-zh');
    await expect(editor).toBeVisible();

    const block = editor.locator('.studio-block__preview').first();
    await block.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('/');
    const picker = page.getByTestId('studio-at-picker');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('标题 2');
    await page.keyboard.type('h2');
    await expect(picker.locator('[aria-selected="true"]')).toContainText('标题 2');
    await page.keyboard.press('Enter');
    await expect(block.locator('h2')).toBeVisible();

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('@pkm');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('articles/pkm-method');
    await page.keyboard.press('Enter');
    await expect(editor.locator('a[href="/articles/pkm-method"]')).toBeVisible();

    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type('[[pkm');
    await expect(picker).toBeVisible();
    await expect(picker).toContainText('articles/pkm-method');
    await page.keyboard.press('Enter');
    const embed = editor.getByTestId('studio-embed');
    await expect(embed).toBeVisible();
    await embed.click();
    await expect(page.getByTestId('studio-child')).toBeVisible();
    await expect(page.locator('.studio-child__frame')).toHaveCount(0);
    const childEditor = page.getByTestId('studio-child-editor');
    await expect(childEditor).toBeVisible();
    await expect(page.getByTestId('studio-child-title-field')).toHaveValue(
      '我的 PKM 实践：从笔记到知识网络',
    );
    await expect(childEditor).toContainText('常青笔记');

    const childBlock = childEditor.locator('.studio-block__preview').first();
    await childBlock.click();
    await page.keyboard.press('End');
    await page.keyboard.type('侧栏编辑标记');
    await expect(childEditor).toContainText('侧栏编辑标记');
    await expect(editor).not.toContainText('侧栏编辑标记');
    await expect(editor.getByTestId('studio-embed')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('studio-app')).toBeVisible();
    await expect(page.getByTestId('studio-child-editor')).toBeVisible();
    await expect(page.getByTestId('studio-child-title-field')).toHaveValue(
      '我的 PKM 实践：从笔记到知识网络',
    );
    await expect(page.getByTestId('studio-child-editor')).toContainText('侧栏编辑标记');
    await expect(page.getByTestId('studio-body-zh')).not.toContainText('侧栏编辑标记');
    await expect(page.getByTestId('studio-body-zh').getByTestId('studio-embed')).toBeVisible();
  });
});
