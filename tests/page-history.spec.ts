import { test, expect } from '@playwright/test';

test.describe('PageHistory（这一页如何长成）', () => {
    test('history: true 的文章文末出现提交史折叠区', async ({ page }) => {
    await page.goto('/articles/how-this-site-works');
    const history = page.locator('details.page-history');
    await expect(history).toBeAttached();
    await expect(history.locator('summary')).toContainText('这一页如何长成');

    await history.locator('summary').click();
    const items = history.locator('ol li');
    expect(await items.count()).toBeGreaterThanOrEqual(1);
    await expect(items.first().locator('time')).toBeAttached();
  });

  test('未开 history 的文章没有此区块', async ({ page }) => {
    await page.goto('/articles/pkm-method');
    await expect(page.locator('details.page-history')).toHaveCount(0);
  });
});
