import { test, expect, type Page } from '@playwright/test';

function pagePathOf(url: URL): string {
  return url.pathname.replace(/\/+$/, '') || '/';
}

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
  const wantZh = option === '简体中文';
  await Promise.all([
    page.waitForURL((url) => {
      const zh = pagePathOf(url) === '/zh' || pagePathOf(url).startsWith('/zh/');
      return wantZh ? zh : !zh;
    }),
    footer.getByRole('option', { name: option }).click(),
  ]);
}

test.describe('Language（中/EN）', () => {
  test('默认英语，切换中文并持久化', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'en');
    const home = page.locator('header.site-nav a[data-i18n-aria="navHome"]');
    await expect(home).toHaveText('EthanChang', inner);
    await expect(home).toHaveAttribute('href', '/');
    await expect(home).toHaveAttribute('aria-label', 'Home');
    await expect(page.locator('header.site-nav ul a[href="/"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/articles"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/projects"]')).toHaveCount(0);
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('Articles', inner);
    await expect(page.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/tags"]')).toHaveText('Tags', inner);
    await expect(page.locator('header.site-nav a[href="/now"]')).toHaveText('Now', inner);
    await expect(page.locator('header.site-nav a[href="/about"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/search"]')).toHaveAttribute('aria-label', 'Search');
    await expect(page.locator('header').getByRole('button', { name: langButtonName })).toHaveCount(0);

    const toggle = page.getByRole('contentinfo').getByRole('button', { name: langAriaEn });
    await toggle.scrollIntoViewIfNeeded();
    await expect(toggle).not.toContainText('中');
    await expect(toggle).not.toContainText('EN');

    await chooseLang(page, '简体中文');
    await expect(page).toHaveURL((url) => url.pathname === '/zh');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('html')).toHaveAttribute('data-lang', 'zh-CN');
    await expect(home).toHaveText('EthanChang', inner);
    await expect(home).toHaveAttribute('href', '/zh');
    await expect(home).toHaveAttribute('aria-label', '首页');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章', inner);
    await expect(page.locator('[data-reading-index-switch] a[href="/zh/projects"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/zh/blogs"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/zh/tags"]')).toHaveText('标签', inner);
    await expect(page.locator('header.site-nav a[href="/zh/now"]')).toHaveText('现在', inner);
    await expect(page.locator('header.site-nav a[href="/zh/search"]')).toHaveAttribute('aria-label', '搜索');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);

    await page.reload();
    await expect(page).toHaveURL((url) => url.pathname === '/zh');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章', inner);

    await chooseLang(page, 'English');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('Articles', inner);
    await expect(home).toHaveAttribute('aria-label', 'Home');
    await expect(home).toHaveAttribute('href', '/');
  });

  test('字标 EthanChang 指向首页', async ({ page }) => {
    await page.goto('/now');
    const home = page.locator('header.site-nav a[data-i18n-aria="navHome"]');
    await expect(home).toHaveText('EthanChang', inner);
    await expect(home).toHaveAttribute('href', '/');
    await expect(page.locator('header.site-nav ul a[href="/"]')).toHaveCount(0);
    await home.click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
  });

  test('切换语言会改掉首页可见文案', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'What I do' })).toBeVisible();

    await chooseLang(page, '简体中文');
    await expect(page).toHaveURL((url) => url.pathname === '/zh');
    await expect(page.getByRole('heading', { name: '我在做什么' })).toBeVisible();
    await expect(page.locator('header.site-nav a[href="/zh/now"]')).toHaveText('现在', inner);
    await expect(
      page.locator('[data-about-howto] p').filter({ has: page.locator('a[href="/zh/contact"]') }),
    ).toHaveText('写信到联系。收集了什么、没收集什么，写在隐私。', inner);
    await expect(
      page.locator('[data-about-howto] p').filter({ has: page.locator('a[href="/zh/for-agents"]') }),
    ).toHaveText(
      '同一地址在 Accept: text/markdown 时给出 Markdown。目录是llms.txt，说明写在ethanchang.io 给 agent 的开发者资源。Now 页在Now。',
      inner,
    );
  });

  test('切换语言会改掉 Now 页可见文案', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/now');
    const lede = page.locator('article > header.mb-10');
    await expect(page.locator('h1')).toHaveText('Now', inner);
    await expect(lede.locator('p.ui-meta')).toHaveText('Updated August 21, 2026', inner);
    await expect(page.getByText("This is a Now page: what I'm doing lately.")).toBeVisible();
    await expect(
      page.locator('.prose-site a[href="https://nownownow.com/about"]').filter({ visible: true }),
    ).toHaveText('nownownow.com');
    await expect(page.getByText('Writing the blog, refining notes and project pages')).toBeVisible();

    await chooseLang(page, '简体中文');
    await expect(page).toHaveURL((url) => url.pathname === '/zh/now');
    await expect(page.locator('h1')).toHaveText('现在', inner);
    await expect(lede.locator('p.ui-meta')).toHaveText('更新于 2026 年 8 月 21 日', inner);
    await expect(page.getByText('这是一页 Now：最近在做什么。这种格式来自nownownow.com。')).toBeVisible();
    await expect(
      page.locator('.prose-site a[href="https://nownownow.com/about"]').filter({ visible: true }),
    ).toHaveText('nownownow.com');
    await expect(page.getByText('写博客，打磨笔记与项目页')).toBeVisible();
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
    await expect(page.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(page.locator('nav.toc')).toHaveAttribute('aria-label', 'Table of contents');
    await expect(page.locator('.article-dek-label, .toc-title')).toHaveCount(0);

    await chooseLang(page, '简体中文');
    await expect(page).toHaveURL((url) => url.pathname === '/zh/articles/pkm-method');
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络', inner);
    await expect(page.getByText('你的笔记系统不是存储信息的仓库')).toBeVisible();
    await expect(page.locator('nav.toc')).toHaveAttribute('aria-label', '目录');
    await expect(page.getByText('摘要', { exact: true })).toHaveCount(0);
    await expect(page.getByText('目录', { exact: true })).not.toBeVisible();
  });

  test('地球图标打开两项菜单，Escape 关闭', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/');

    const footer = await openLangMenu(page);
    const options = footer.getByRole('option');
    await expect(options).toHaveCount(2);
    await expect(options.nth(0)).toHaveText('English');
    await expect(options.nth(1)).toHaveText('简体中文');
    await expect(options.nth(0)).toHaveAttribute('aria-selected', 'true');

    await page.keyboard.press('Escape');
    await expect(footer.getByRole('listbox')).toHaveCount(0);
    await expect(footer.getByRole('button', { name: langAriaEn })).toBeFocused();
  });

  test('/zh 不依赖 localStorage 也能打开中文站', async ({ page, request }) => {
    const res = await request.get('/zh');
    expect(res.status()).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<html[^>]*lang="zh-CN"/);
    expect(html).toContain('hreflang="zh-CN"');
    expect(html).toContain('href="/zh/now"');

    await page.addInitScript(() => localStorage.setItem('lang', 'en'));
    await page.goto('/zh');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章', inner);
    await expect(page.locator('header.site-nav a[href="/zh/now"]')).toHaveText('现在', inner);
    await expect(page.getByRole('heading', { name: '我在做什么' })).toBeVisible();
    expect(new URL(page.url()).pathname).toBe('/zh');
  });

  test('/zh 子路径也是中文，切回英文会去掉前缀', async ({ page }) => {
    await page.addInitScript(() => localStorage.removeItem('lang'));
    await page.goto('/zh/now');
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('h1')).toHaveText('现在', inner);
    await expect(page.locator('header.site-nav a[data-i18n-aria="navHome"]')).toHaveAttribute(
      'href',
      '/zh',
    );

    await page.goto('/zh/articles/pkm-method');
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络', inner);

    await chooseLang(page, 'English');
    await expect(page).toHaveURL((url) => url.pathname === '/articles/pkm-method');
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
  });
});
