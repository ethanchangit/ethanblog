import { test, expect } from '@playwright/test';

const inner = { useInnerText: true } as const;

test.describe('Language（中/EN）', () => {
  test('默认中文，切换英语并持久化', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('文章', inner);
    await expect(page.locator('header nav a[href="/projects"]')).toHaveText('项目', inner);
    await expect(page.locator('header nav a[href="/about"]')).toHaveText('关于', inner);

    await page.getByRole('button', { name: '当前语言：中文，点击切换为英文' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('Articles', inner);
    await expect(page.locator('header nav a[href="/projects"]')).toHaveText('Projects', inner);
    await expect(page.locator('header nav a[href="/about"]')).toHaveText('About', inner);
    await expect(page.getByText("Hi, I'm")).toBeVisible();

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('Articles', inner);

    await page.getByRole('button', { name: 'Current language: English. Click to switch to Chinese' }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('文章', inner);
  });

  test('切换语言会改掉关于页可见文案', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: '我在做什么' })).toBeVisible();

    await page.getByRole('button', { name: '当前语言：中文，点击切换为英文' }).click();
    await expect(page.getByRole('heading', { name: 'What I do' })).toBeVisible();
    await expect(page.locator('header nav a[href="/about"]')).toHaveText('About', inner);
  });

  test('文章正文随语言切换，缺英文时回退中文', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/articles/pkm-method');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('我的 PKM 实践：从笔记到知识网络', inner);

    await page.getByRole('button', { name: '当前语言：中文，点击切换为英文' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner
    );
    await expect(page.getByText('Your notes are not a warehouse')).toBeVisible();
  });
});
