import { test, expect } from '@playwright/test';

test.describe('仅保留中文版', () => {
  test('默认中文且不再显示语言切换', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('文章');
    await expect(page.locator('header.site-nav a[href="/tags"]')).toHaveText('标签');
    await expect(page.locator('header.site-nav a[href="/search"]')).toHaveAttribute('aria-label', '搜索');
    await expect(page.getByRole('button', { name: /选择语言|Choose language/ })).toHaveCount(0);
    await expect(page.locator('.i18n-en, .i18n-en-block, .i18n-en-only')).toHaveCount(0);
  });

  test('旧浏览器英文偏好不改变内容，换页后仍为中文', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lang', 'en'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('header.site-nav a[href="/now"]').click();
    await expect(page).toHaveURL(/\/now\/?$/);
    await expect(page.locator('h1')).toHaveText('现在');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    await expect(page.getByText('写博客，打磨笔记与项目页')).toBeVisible();
  });

  test('正文、日期和目录都是中文，没有英文正文副本', async ({ page, request }) => {
    await page.goto('/articles/pkm-method', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络');
    await expect(page.locator('.article-lede time')).toHaveText('2026 年 3 月 1 日');
    await expect(page.locator('nav.toc')).toHaveAttribute('aria-label', '目录');
    await expect(page.getByText('你的笔记系统不是存储信息的仓库')).toBeVisible();
    const html = await (await request.get('/articles/pkm-method')).text();
    expect(html).not.toContain('My PKM practice: from notes to a knowledge network');
    expect(html).not.toContain('data-lang-split');
    expect(html).not.toContain('hreflang="en"');
  });

  test('旧 /zh 地址回到同一篇中文页面', async ({ page }) => {
    for (const path of ['/', '/now', '/articles/pkm-method']) {
      await page.goto(path === '/' ? '/zh' : '/zh' + path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(url => (url.pathname.replace(/\/$/, '') || '/') === path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'zh-CN');
    }
  });

  test('中文链接前后没有多余空白', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-about-howto] p').filter({ has: page.locator('a[href="/contact"]') }))
      .toHaveText('写信到联系。收集了什么、没收集什么，写在隐私。', { useInnerText: true });
  });

  test('Markdown 与 RSS 同样使用主版本', async ({ request }) => {
    const md = await (await request.get('/articles/pkm-method', { headers: { Accept: 'text/markdown' } })).text();
    expect(md).toContain('# 我的 PKM 实践：从笔记到知识网络');
    expect(md).not.toContain('My PKM practice');
    const rss = await (await request.get('/rss.xml')).text();
    expect(rss).toContain('<language>zh-CN</language>');
    expect(rss).not.toContain('My PKM practice');
  });

  test('没有 JavaScript 也能直接阅读中文', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto('http://localhost:4322/articles/pkm-method', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络');
    await expect(page.getByText('你的笔记系统不是存储信息的仓库')).toBeVisible();
    await context.close();
  });
});
