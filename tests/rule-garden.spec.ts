import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * RuleGarden on the published article /page-as-a-room.
 * Three initial rules and RuleTarget objects: first-object, reactive-box, click-counter.
 */

async function hydrateGarden(page: Page): Promise<Locator> {
  // Rows exist only after the island hydrates. Scroll the SSR figure into the
  // reading pane first; client:visible does not run while it sits below the fold.
  const garden = page.locator('figure.media-frame', { hasText: '这个房间的规则' });
  await garden.scrollIntoViewIfNeeded();
  const rows = page.locator('.rg-row');
  await expect(rows).toHaveCount(3);
  return garden;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/page-as-a-room', { waitUntil: 'domcontentloaded' });
});

test('renders 3 rule rows, each with an enable checkbox', async ({ page }) => {
  await hydrateGarden(page);
  await expect(page.locator('.rg-row')).toHaveCount(3);
  await expect(page.locator('.rg-row input[type="checkbox"]')).toHaveCount(3);
  for (const box of await page.locator('.rg-row input[type="checkbox"]').all()) {
    await expect(box).toBeChecked();
  }
});

test('clicking the named object increments the counter', async ({ page }) => {
  await hydrateGarden(page);
  const badge = page.locator('[data-rule-target="click-counter"]');
  await page.locator('[data-rule-target="first-object"]').click();
  await expect(badge).toHaveAttribute('data-rg-count', '1');
});

test('hovering the intro text highlights the color box', async ({ page }) => {
  await hydrateGarden(page);
  await page.locator('[data-rule-target="first-object"]').hover();
  await expect(page.locator('[data-rule-target="reactive-box"]')).toHaveClass(/rg-highlight/);
});

test('unchecking a rule undoes its applied effect', async ({ page }) => {
  await hydrateGarden(page);
  const colorBox = page.locator('[data-rule-target="reactive-box"]');
  await colorBox.scrollIntoViewIfNeeded();
  await expect(colorBox).toHaveClass(/rg-tint-accent/);
  await page.locator('.rg-row input[type="checkbox"]').first().uncheck();
  await expect(colorBox).not.toHaveClass(/rg-tint-accent/);
});

test('renders rule rows under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/page-as-a-room', { waitUntil: 'domcontentloaded' });
  await hydrateGarden(page);
  await expect(page.locator('.rg-row')).toHaveCount(3);
});

test('SSR HTML contains the prose fallback', async ({ page }) => {
  const html = await (await page.request.get('/page-as-a-room')).text();
  expect(html).toContain('这个页面');
  expect(html).toContain('条规则');
});
