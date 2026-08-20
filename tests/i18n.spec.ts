import { test, expect, type Page } from '@playwright/test';

const inner = { useInnerText: true } as const;

const langAriaZh = '选择语言';
const langAriaEn = 'Choose language';
const langButtonName = new RegExp(`${langAriaZh}|${langAriaEn}`);

async function openLangMenu(page: Page) {
  const footer = page.getByRole('contentinfo');
  const toggle = footer.getByRole('button', { name: langButtonName });
  const island = footer.locator('astro-island').filter({
    has: page.getByRole('button', { name: langButtonName }),
  });
  await toggle.scrollIntoViewIfNeeded();
  await expect(island).not.toHaveAttribute('ssr');
  if ((await footer.getByRole('listbox').count()) === 0) {
    await toggle.click();
  }
  await expect(footer.getByRole('listbox')).toBeVisible();
  return footer;
}

async function chooseLang(page: Page, option: '简体中文' | 'English') {
  const footer = await openLangMenu(page);
  await footer.getByRole('option', { name: option }).click();
  await expect(footer.getByRole('listbox')).toHaveCount(0);
}

test.describe('Language（中/EN）', () => {
  test('默认中文，切换英语并持久化', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    const home = page.locator('header nav a[href="/"]');
    await expect(home).toHaveText('EthanChang', inner);
    await expect(home).toHaveAttribute('aria-label', '首页');
    await expect(page.locator('header nav ul a[href="/"]')).toHaveCount(0);
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('文章', inner);
    await expect(page.locator('header nav a[href="/projects"]')).toHaveText('项目', inner);
    await expect(page.locator('header nav a[href="/tags"]')).toHaveText('标签', inner);
    await expect(page.locator('header nav a[href="/about"]')).toHaveText('关于', inner);
    await expect(page.locator('header nav a[href="/search"]')).toHaveAttribute('aria-label', '搜索');
    await expect(page.locator('header').getByRole('button', { name: langButtonName })).toHaveCount(0);

    const toggle = page.getByRole('contentinfo').getByRole('button', { name: langAriaZh });
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).not.toContainText('中');
    await expect(toggle).not.toContainText('EN');

    await chooseLang(page, 'English');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
    await expect(home).toHaveText('EthanChang', inner);
    await expect(home).toHaveAttribute('aria-label', 'Home');
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('Articles', inner);
    await expect(page.locator('header nav a[href="/projects"]')).toHaveText('Projects', inner);
    await expect(page.locator('header nav a[href="/tags"]')).toHaveText('Tags', inner);
    await expect(page.locator('header nav a[href="/about"]')).toHaveText('About', inner);
    await expect(page.locator('header nav a[href="/search"]')).toHaveAttribute('aria-label', 'Search');
    await expect(page).toHaveURL(/\/articles\/?$/);
    await expect(page.locator('h1')).toHaveText('Articles', inner);

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('Articles', inner);

    await chooseLang(page, '简体中文');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('header nav a[href="/articles"]')).toHaveText('文章', inner);
    await expect(home).toHaveAttribute('aria-label', '首页');
  });

  test('字标 EthanChang 指向首页', async ({ page }) => {
    await page.goto('/about');
    const home = page.locator('header nav a[href="/"]');
    await expect(home).toHaveText('EthanChang', inner);
    await expect(page.locator('header nav ul a[href="/"]')).toHaveCount(0);
    await home.click();
    await expect(page).toHaveURL(/\/articles\/?$/);
  });

  test('切换语言会改掉关于页可见文案', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/about');
    await expect(page.getByRole('heading', { name: '我在做什么' })).toBeVisible();

    await chooseLang(page, 'English');
    await expect(page.getByRole('heading', { name: 'What I do' })).toBeVisible();
    await expect(page.locator('header nav a[href="/about"]')).toHaveText('About', inner);
  });

  test('中文日期数字与年/月/日之间有空格，英文不变', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/articles');

    const card = page.locator('a[href="/articles/dummy-2026-05"]');
    await expect(card.locator('.ui-meta .i18n-zh')).toHaveText('2026 年 5 月 1 日', inner);
    await expect(card.locator('.ui-meta .i18n-en')).toHaveText('May 1, 2026');

    await page.goto('/articles/pkm-method');
    const published = page.locator('.article-lede time.ui-meta');
    await expect(published.locator('.i18n-zh')).toHaveText('2026 年 3 月 1 日', inner);
    await expect(published.locator('.i18n-en')).toHaveText('March 1, 2026');
  });

  test('文章正文随语言切换，缺英文时回退中文', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/articles/pkm-method');
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络', inner);
    await expect(page.locator('nav.toc')).toHaveAttribute('aria-label', '目录');
    await expect(page.locator('.article-dek-label, .toc-title')).toHaveCount(0);

    await chooseLang(page, 'English');
    await expect(page.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner
    );
    await expect(page.getByText('Your notes are not a warehouse')).toBeVisible();
    await expect(page.locator('nav.toc')).toHaveAttribute('aria-label', 'Table of contents');
    await expect(page.getByText('Abstract', { exact: true })).toHaveCount(0);
    await expect(page.getByText('Contents', { exact: true })).toHaveCount(0);
  });

  test('地球图标打开两项菜单，Escape 关闭', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/');

    const footer = await openLangMenu(page);
    const options = footer.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveText('简体中文');
    await expect(options.nth(1)).toHaveText('English');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(footer.getByRole('listbox')).toHaveCount(0);
    await expect(footer.getByRole('button', { name: langAriaZh })).toBeFocused();
  });
});
