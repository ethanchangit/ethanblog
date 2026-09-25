import { test, expect } from '@playwright/test';

test.describe('英文站', () => {
  test('界面是英文，没有语言切换', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('[data-reading-index-switch] h1')).toHaveText('Articles');
    await expect(page.locator('header.site-nav a[href="/tags"]')).toHaveText('Tags');
    await expect(page.locator('header.site-nav a[href="/search"]')).toHaveAttribute('aria-label', 'Search');
    await expect(page.getByRole('button', { name: /选择语言|Choose language/ })).toHaveCount(0);
    await expect(page.locator('header.site-nav [data-site-switch]')).toHaveCount(0);
  });

  test('旧的语言偏好不会切回另一套站点', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('lang', 'zh-CN'));
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.locator('header.site-nav a[href="/now"]').click();
    await expect(page).toHaveURL(/\/now\/?$/);
    await expect(page.locator('h1')).toHaveText('Now');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.getByText('写博客，打磨笔记与项目页')).toBeVisible();
  });

  test('正文、日期和目录都是中文，没有英文正文副本', async ({ page, request }) => {
    await page.goto('/pkm-method', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络');
    await expect(page.locator('.article-lede time')).toHaveCount(0);
    await expect(page.locator('.article-meta time')).toHaveText('March 1, 2026');
    await expect(page.locator('.article-meta dt', { hasText: 'Published' })).toBeVisible();
    await expect(page.locator('nav.toc')).toHaveAttribute('aria-label', 'Contents');
    await expect(page.locator('nav.toc a').first()).toHaveText('我的 PKM 实践：从笔记到知识网络');
    await expect(page.locator('nav.toc a').first()).toHaveAttribute('href', '#doc-title');
    await expect(page.getByText('你的笔记系统不是存储信息的仓库')).toBeVisible();
    const html = await (await request.get('/pkm-method')).text();
    expect(html).not.toContain('My PKM practice: from notes to a knowledge network');
    expect(html).not.toContain('data-lang-split');
    // Not translated yet: no English alternate. The nav still links to the English blog's home.
    expect(html).not.toContain('rel="alternate" hreflang="en"');
  });

  test('旧 /zh 地址回到同一篇中文页面', async ({ page }) => {
    for (const path of ['/', '/now', '/pkm-method']) {
      await page.goto(path === '/' ? '/zh' : '/zh' + path, { waitUntil: 'domcontentloaded' });
      await expect(page).toHaveURL(url => (url.pathname.replace(/\/$/, '') || '/') === path);
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    }
  });

  test('中文链接前后没有多余空白', async ({ page }) => {
    await page.goto('/about', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-about-howto] p').filter({ has: page.locator('a[href="/contact"]') }))
      .toHaveText('写信到联系。收集了什么、没收集什么，写在隐私。', { useInnerText: true });
  });

  test('Markdown 与 RSS 同样使用主版本', async ({ request }) => {
    const md = await (await request.get('/pkm-method', { headers: { Accept: 'text/markdown' } })).text();
    expect(md).toContain('# 我的 PKM 实践：从笔记到知识网络');
    expect(md).not.toContain('My PKM practice');
    const rss = await (await request.get('/rss.xml')).text();
    expect(rss).toContain('<language>en</language>');
    expect(rss).not.toContain('My PKM practice');
  });

  test('没有 JavaScript 也能直接阅读中文', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('http://localhost:4322/pkm-method', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('.article-lede h1')).toHaveText('我的 PKM 实践：从笔记到知识网络');
    await expect(page.getByText('你的笔记系统不是存储信息的仓库')).toBeVisible();
    const sectionHref = await page.locator('nav.toc a[data-depth="2"]').first().getAttribute('href');
    expect(sectionHref).toMatch(/^#.+/);
    await page.goto(`http://localhost:4322/pkm-method${sectionHref}`, { waitUntil: 'domcontentloaded' });
    const titleLink = page.locator('nav.toc a').first();
    await expect(titleLink).toHaveAttribute('href', '#doc-title');
    await titleLink.click();
    await expect(page).toHaveURL(/#doc-title$/);
    const titleTop = await page.evaluate(() => {
      const pane = document.querySelector('[data-reading-pane]');
      const title = document.querySelector('.article-lede h1');
      if (!(pane instanceof HTMLElement) || !(title instanceof HTMLElement)) return null;
      return title.getBoundingClientRect().top - pane.getBoundingClientRect().top;
    });
    expect(titleTop).not.toBeNull();
    expect(titleTop!).toBeGreaterThanOrEqual(-4);
    expect(titleTop!).toBeLessThan(160);
    await context.close();
  });
});
