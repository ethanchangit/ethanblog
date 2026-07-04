import { test, expect } from '@playwright/test';

test.describe('source-view（拆开看）', () => {
  test('story page injects source disclosures for media components', async ({ page }) => {
    await page.goto('/stories/how-this-site-works/');

    const disclosures = page.locator('details.source-view');
    await expect(disclosures.first()).toBeAttached();
    expect(await disclosures.count()).toBeGreaterThanOrEqual(5);
  });

  test('expanding a disclosure reveals the MDX source', async ({ page }) => {
    await page.goto('/stories/how-this-site-works/');

    const first = page.locator('details.source-view').first();
    await first.scrollIntoViewIfNeeded();
    await first.locator('summary').click();

    await expect(first).toHaveAttribute('open', '');
    await expect(first.locator('code').first()).toContainText('client:visible');
  });

  test('disclosure code block is highlighted by shiki', async ({ page }) => {
    await page.goto('/stories/how-this-site-works/');

    const first = page.locator('details.source-view').first();
    await expect(first.locator('.astro-code').first()).toBeAttached();
  });

  test('lab page (.astro, not MDX) has no source disclosures', async ({ page }) => {
    await page.goto('/lab');
    await expect(page.getByRole('heading', { name: '组件试验场' })).toBeVisible();
    await expect(page.locator('details.source-view')).toHaveCount(0);
  });
});
