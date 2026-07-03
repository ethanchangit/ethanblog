import { test, expect } from '@playwright/test';

test.describe('SideNote（旁注）', () => {
  test('宽屏（1600px）悬挂在右页边（float: right）', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/lab');
    const note = page.getByTestId('side-note').locator('aside.sidenote');
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeVisible();
    const float = await note.evaluate((el) => getComputedStyle(el).float);
    expect(float).toBe('right');
  });

  test('窄屏（768px）回落为正文内插注块', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.goto('/lab');
    const note = page.getByTestId('side-note').locator('aside.sidenote');
    await note.scrollIntoViewIfNeeded();
    await expect(note).toBeVisible();
    const float = await note.evaluate((el) => getComputedStyle(el).float);
    expect(float).toBe('none');
  });

  test('宽屏下不产生横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 900 });
    await page.goto('/lab');
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth
    );
    expect(overflow).toBe(false);
  });
});
