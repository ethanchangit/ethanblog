import { test, expect } from '@playwright/test';

test.describe('prefers-reduced-motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('home is the about page', async ({ page }) => {
    await page.goto('/');
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('header.site-nav')).toBeVisible();
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', {
      useInnerText: true,
    });
    await expect(page.locator('main')).toBeVisible();
  });

  test('lab page renders all component sections', async ({ page }) => {
    await page.goto('/lab');
    await expect(page.getByRole('heading', { name: 'Component lab' })).toBeVisible();

    for (const testId of [
      'param-slider',
      'before-after',
      'scroll-scene',
      'timeline',
      'stat-counter',
      'interactive-demo',
      'reactive-prose',
      'verdict-table',
      'mention',
    ]) {
      await expect(page.getByTestId(testId)).toBeVisible();
    }
  });

  test('ScrollScene degrades to static sections without breaking', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('scroll-scene');
    await section.scrollIntoViewIfNeeded();

    await expect(section.getByText('一切从一张卡片开始')).toBeVisible();
    await expect(section.getByText('链接让知识生长')).toBeVisible();
    await expect(section.getByText('最终形成你的第二大脑')).toBeVisible();
  });

  test('Timeline remains readable with reduced motion', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('timeline');
    await section.scrollIntoViewIfNeeded();

    await expect(section.getByText('第一行 Swift')).toBeVisible();
    await expect(section.getByText('Robert 立项')).toBeVisible();
    await expect(section.getByText('这个网站诞生')).toBeVisible();
  });

  test('StatCounter shows final values immediately', async ({ page }) => {
    await page.goto('/lab');
    const section = page.getByTestId('stat-counter');
    await section.scrollIntoViewIfNeeded();

    await expect(section.locator('dd').nth(0)).toContainText('7');
    await expect(section.locator('dd').nth(1)).toContainText('1200');
  });

  test('article page renders with reduced motion', async ({ page }) => {
    await page.goto('/articles/pkm-method');
    await expect(page.getByRole('article')).toBeVisible();
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
