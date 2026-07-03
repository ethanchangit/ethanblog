import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.join('tests', 'screenshots');

const PAGES = [
  { route: '/', name: 'home' },
  { route: '/lab', name: 'lab' },
  { route: '/stories/how-this-site-works', name: 'story-how-this-site-works' },
] as const;

const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 375, height: 667 },
] as const;

test.describe('Dual viewport screenshots', () => {
  test.beforeAll(() => {
    mkdirSync(SCREENSHOT_DIR, { recursive: true });
  });

  for (const viewport of VIEWPORTS) {
    for (const pageInfo of PAGES) {
      test(`${pageInfo.name} @ ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await page.goto(pageInfo.route);
        await page.waitForLoadState('networkidle');

        const file = path.join(
          SCREENSHOT_DIR,
          `${pageInfo.name}-${viewport.name}.png`,
        );
        await page.screenshot({ path: file, fullPage: true });
        await expect(page.locator('main')).toBeVisible();
      });
    }
  }
});
