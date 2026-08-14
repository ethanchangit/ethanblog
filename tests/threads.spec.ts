import { test, expect } from '@playwright/test';

const NOTE_01 = '/stories/notes/web-as-medium/01-medium-engine-groundwork';
const NOTE_02 = '/stories/notes/web-as-medium/02-design-tradeoffs';

test.describe('Threads (研究线)', () => {
  test('/threads renders and lists the web-as-medium thread', async ({ page }) => {
    const response = await page.goto('/threads');
    expect(response?.status()).toBe(200);
    await expect(page.getByRole('heading', { name: '把网页当动态媒介' })).toBeVisible();
  });

  test('/threads/web-as-medium shows the question and note #01', async ({ page }) => {
    const response = await page.goto('/threads/web-as-medium');
    expect(response?.status()).toBe(200);
    await expect(page.getByText('一张网页，能不能像房间一样对人做出反应？')).toBeVisible();

    const noteLink = page.locator(`a[href="${NOTE_01}"]`);
    await expect(noteLink).toBeVisible();
    await expect(noteLink).toContainText('#01');
  });

  test('nav has 研究线 link, active on /threads', async ({ page }) => {
    await page.goto('/threads');
    const navLink = page.locator('header nav a[href="/threads"]');
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveText('研究线');
    // Nav 的 isActive 实现：命中时输出 aria-current="page" 且文字用 ink-100
    await expect(navLink).toHaveAttribute('aria-current', 'page');
    await expect(navLink).toHaveClass(/text-ink-100/);
  });

  test('draft note #02 does not appear in the notes list', async ({ page }) => {
    await page.goto('/threads/web-as-medium');
    await expect(page.locator(`a[href="${NOTE_02}"]`)).toHaveCount(0);
    await expect(page.getByText('#02')).toHaveCount(0);
  });
});
