import { test, expect, type Page, type Locator } from '@playwright/test';

/**
 * RuleGarden（T6）：Claim/When/Wish 的网页玩具版。
 * 依赖 /lab 页面的 rule-garden section（三条初始规则 + 三个 RuleTarget 物件）。
 */

/** 滚动到规则花园并等待岛屿注水（规则行渲染出来才说明引擎已创建）。 */
async function hydrateGarden(page: Page): Promise<Locator> {
  const section = page.getByTestId('rule-garden');
  await section.locator('figure.media-frame').scrollIntoViewIfNeeded();
  await expect(section.locator('.rg-row')).toHaveCount(3);
  return section;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/lab');
});

test('renders 3 rule rows, each with an enable checkbox', async ({ page }) => {
  const section = await hydrateGarden(page);

  await expect(section.locator('.rg-row')).toHaveCount(3);
  await expect(section.locator('.rg-row input[type="checkbox"]')).toHaveCount(3);
  for (const box of await section.locator('.rg-row input[type="checkbox"]').all()) {
    await expect(box).toBeChecked();
  }
});

test('clicking the counter badge increments its data-rg-count', async ({ page }) => {
  const section = await hydrateGarden(page);

  const badge = section.locator('[data-rule-target="counter-badge"]');
  await badge.scrollIntoViewIfNeeded();
  await badge.click();

  // count 效果把计数印在物体上，×1 文本经 [data-rg-count]::after 展示
  await expect(badge).toHaveAttribute('data-rg-count', '1');
});

test('hovering intro text highlights the color box', async ({ page }) => {
  const section = await hydrateGarden(page);

  await section.locator('[data-rule-target="intro-text"]').hover();
  await expect(section.locator('[data-rule-target="color-box"]')).toHaveClass(/rg-highlight/);
});

test('unchecking a rule undoes its applied effect', async ({ page }) => {
  const section = await hydrateGarden(page);

  // 先让 enters-view 触发：intro-text 进入视野 → color-box 染成青色
  await section.locator('[data-rule-target="intro-text"]').scrollIntoViewIfNeeded();
  const colorBox = section.locator('[data-rule-target="color-box"]');
  await expect(colorBox).toHaveClass(/rg-tint-accent/);

  // 取消勾选第一条规则 → 引擎幂等重建，已生效的 tint 被 undo
  await section.locator('.rg-row input[type="checkbox"]').first().uncheck();
  await expect(colorBox).not.toHaveClass(/rg-tint-accent/);
});

test('renders rule rows under prefers-reduced-motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/lab');

  const section = await hydrateGarden(page);
  await expect(section.locator('.rg-row')).toHaveCount(3);
});

test('SSR HTML contains the prose fallback', async ({ page }) => {
  const html = await (await page.request.get('/lab')).text();

  // describeRules 的散文降级：无 JS 时规则被说成一段通顺中文
  expect(html).toContain('这个页面');
  expect(html).toContain('条规则');
});
