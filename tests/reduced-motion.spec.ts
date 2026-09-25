import { test, expect } from '@playwright/test';

test.describe('prefers-reduced-motion', () => {
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('home is the article list and /about redirects there', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('header.site-nav')).toBeVisible();
    await expect(page.locator('[data-about-panel]')).toHaveCount(0);
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章', { useInnerText: true });
    await expect(page.locator('main')).toBeVisible();
    // serve.json sends /about to /. The wordmark already points at the article list.
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    expect(new URL(page.url()).pathname).toBe('/');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章', { useInnerText: true });
  });

  test('Timeline on the project list remains readable', async ({ page }) => {
    await page.goto('/projects', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Robert' })).toBeVisible();
  });

  test('article page renders with reduced motion', async ({ page }) => {
    await page.goto('/pkm-method', { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('article')).toBeVisible();
    await expect(page.locator('h1').first()).toBeVisible();
  });
});
