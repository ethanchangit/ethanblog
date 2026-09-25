import { test, expect } from '@playwright/test';

test.describe('SideNote（旁注）', () => {
  test('宽屏（1600px）在阅读壳里留在栏内', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/page-as-a-room', { waitUntil: 'domcontentloaded' });
    const note = page.locator('aside.sidenote');
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeVisible();
    // Articles sit in .reading-shell, which keeps sidenotes in the column.
    const float = await note.evaluate((el) => getComputedStyle(el).float);
    expect(float).toBe('none');
  });

  test('窄屏（768px）回落为正文内插注块', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/page-as-a-room', { waitUntil: 'domcontentloaded' });
    const note = page.locator('aside.sidenote');
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeVisible();
    const float = await note.evaluate((el) => getComputedStyle(el).float);
    expect(float).toBe('none');
  });

  test('宽屏下不产生横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/page-as-a-room', { waitUntil: 'domcontentloaded' });
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });
});
