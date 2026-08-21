import { test, expect } from '@playwright/test';

const inner = { useInnerText: true } as const;

test.describe('分栏阅读', () => {
  test('/ 是左栏索引 + 中栏 About，列表无选中', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');

    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(index).toBeVisible();
    await expect(index.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    await expect(index.locator('a[aria-current="page"]')).toHaveCount(0);
    await expect(doc.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(doc.getByRole('heading', { name: 'What I do' })).toBeVisible();
    await expect(page.locator('header.site-nav a[href="/articles"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/projects"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/tags"]')).toBeVisible();
    await expect(page.locator('header.site-nav a[href="/now"]')).toBeVisible();
    await expect(page.locator('[data-reading-close]')).toBeHidden();
  });

  test('首页点卡片把 About 换成文章，左栏仍在并标当前项', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const index = page.locator('[data-reading-index]');
    await index.locator('a[href="/articles/pkm-method"]').click({ force: true });

    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(page.locator('[data-about-panel]')).toHaveCount(0);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('首页点「项目」只换左栏，中栏仍是 About', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const index = page.locator('[data-reading-index]');
    await index.locator('[data-reading-index-switch]').getByRole('link', { name: 'Projects' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(index.locator('[data-tl-item]').first()).toBeVisible();
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(index.locator('a[aria-current="page"]')).toHaveCount(0);
  });

  test('/articles 未点开仍是单栏索引', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles');
    await expect(page.locator('[data-reading-shell]')).toHaveCount(0);
    const switcher = page.locator('[data-reading-index-switch]');
    await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(switcher.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(switcher.getByRole('heading', { name: 'Projects' })).toHaveCount(0);
    await expect(switcher.locator('a[href="/projects"]')).toBeVisible();
    const titleSize = await switcher.locator('h1').evaluate((el) => getComputedStyle(el).fontSize);
    const altSize = await switcher.locator('a').evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(altSize)).toBeLessThan(parseFloat(titleSize) * 0.55);
    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/tags"]')).toBeVisible();
    await expect(page.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    await expect(page.locator('[data-reading-close]')).toBeHidden();
  });

  test('/projects 未点开不显示展开关闭', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');
    await expect(page.locator('[data-reading-shell]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/articles"]')).toBeVisible();
    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();
    await expect(page.locator('[data-reading-close]')).toBeHidden();
  });

  test('文章页左栏是完整索引，中栏是正文，长文第三栏是目录', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    const rail = page.locator('[data-reading-rail]');

    await expect(index).toBeVisible();
    await expect(index.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/tags"]')).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/pkm-method"] p').first()).toBeVisible();

    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(rail).toBeVisible();
    await expect(rail.locator('nav.toc')).toBeVisible();
  });

  test('heptabase 长文左栏是完整卡片，目录在第三栏不悬挂', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/heptabase-method');

    const index = page.locator('[data-reading-index]');
    const rail = page.locator('[data-reading-rail]');
    await expect(index.locator('a[href="/articles/heptabase-method"] h3')).toBeVisible();
    await expect(index.locator('a[href="/articles/heptabase-method"] p').first()).toBeVisible();
    await expect(rail.locator('nav.toc')).toBeVisible();
    await expect(page.locator('[data-reading-doc] nav.toc')).toHaveCount(0);

    const pos = await page.evaluate(() => {
      const toc = document.querySelector('[data-reading-rail] nav.toc');
      const article = document.querySelector('article.article-page');
      const doc = document.querySelector('[data-reading-doc]');
      const index = document.querySelector('[data-reading-index]');
      if (!toc || !article || !doc || !index) return null;
      const t = toc.getBoundingClientRect();
      const a = article.getBoundingClientRect();
      const d = doc.getBoundingClientRect();
      return {
        tocLeft: t.left,
        tocRight: t.right,
        articleRight: a.right,
        docLeft: d.left,
        docRight: d.right,
        indexWidth: index.getBoundingClientRect().width,
      };
    });
    expect(pos).not.toBeNull();
    expect(pos!.indexWidth).toBeGreaterThan(410);
    expect(pos!.indexWidth).toBeLessThan(490);
    expect(pos!.tocLeft).toBeGreaterThanOrEqual(pos!.articleRight - 1);
    expect(pos!.tocLeft).toBeGreaterThanOrEqual(pos!.docLeft);
    expect(pos!.tocRight).toBeLessThanOrEqual(pos!.docRight + 1);
  });

  test('短文没有第三栏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/embed-preview');
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(page.locator('nav.toc')).toHaveCount(0);
  });

  test('合集第三栏列出篇目，子页不进左栏索引', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/series-demo');

    const index = page.locator('[data-reading-index]');
    const rail = page.locator('[data-reading-rail]');
    await expect(index.locator('a[href="/articles/series-demo"] h3')).toBeVisible();
    await expect(index.locator('a[href="/articles/series-demo/1"]')).toHaveCount(0);
    await expect(rail.locator('[data-series="hub"] a[href="/articles/series-demo/1"]')).toBeVisible();
    await expect(rail.locator('[data-series="hub"] a[href="/articles/series-demo/2"]')).toBeVisible();
    await expect(
      page.locator('[data-reading-doc] .article-shell [data-series="hub-inline"] a[href="/articles/series-demo/1"] h3'),
    ).toBeVisible();
    await expect(
      page.locator('[data-reading-doc] .article-shell [data-series="hub-inline"] a[href="/articles/series-demo/2"] h3'),
    ).toBeVisible();

    const part1 = rail.locator('[data-series="hub"] a[href="/articles/series-demo/1"]');
    const part2 = rail.locator('[data-series="hub"] a[href="/articles/series-demo/2"]');
    await expect(part1).toHaveCSS('text-decoration-line', 'none');
    await expect(part2).toHaveCSS('text-decoration-line', 'none');

    await part1.click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'Series demo: a tutorial',
      inner,
    );
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 1',
      inner,
    );
    await expect(rail).toHaveAttribute('data-reading-child-open', '');
    await expect(rail.locator('nav.reading-series')).toBeHidden();
    await expect(page.locator('[data-reading-rail] > .reading-child-dismiss')).toHaveCount(0);
    const dateRow = page.locator(
      '[data-reading-child] header.article-lede > div.flex.justify-between',
    );
    const close = dateRow.locator('[data-reading-child-close]');
    await expect(close).toBeVisible();
    await expect(close).toHaveText('Close', inner);
    await expect(dateRow.locator('time.ui-meta')).toBeVisible();
    const dateBox = await dateRow.locator('time.ui-meta').boundingBox();
    const closeBox = await close.boundingBox();
    expect(dateBox).toBeTruthy();
    expect(closeBox).toBeTruthy();
    const dateMid = dateBox!.y + dateBox!.height / 2;
    const closeMid = closeBox!.y + closeBox!.height / 2;
    expect(Math.abs(dateMid - closeMid)).toBeLessThan(8);
    expect(closeBox!.x).toBeGreaterThan(dateBox!.x + dateBox!.width);
    await expect(part1).toHaveAttribute('aria-current', 'page');
    await expect(part1).toHaveCSS('text-decoration-line', 'underline');
    await expect(part2).toHaveCSS('text-decoration-line', 'none');

    const railBox = await rail.boundingBox();
    expect(railBox).not.toBeNull();
    expect(railBox!.width).toBeGreaterThan(280);
  });

  test('总览正文点篇目在第三栏打开，换篇不换总览', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/series-demo');

    const doc = page.locator('[data-reading-doc]');
    const rail = page.locator('[data-reading-rail]');
    const listing = doc.locator('.article-shell [data-series="hub-inline"]');

    await listing.locator('a[href="/articles/series-demo/1"]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText('Series demo: a tutorial', inner);
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 1',
      inner,
    );
    await expect(rail.locator('nav.reading-series')).toBeHidden();
    await expect(page.locator('[data-reading-child-close]')).toBeVisible();

    await listing.locator('a[href="/articles/series-demo/2"]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText('Series demo: a tutorial', inner);
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 2',
      inner,
    );
    await expect(
      rail.locator('[data-series="hub"] a[href="/articles/series-demo/2"]'),
    ).toHaveAttribute('aria-current', 'page');

    await page.locator('[data-reading-child-close]').click();
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(rail).not.toHaveAttribute('data-reading-child-open');
    await expect(rail.locator('nav.reading-series')).toBeVisible();
    await expect(doc.locator('.article-lede h1')).toHaveText('Series demo: a tutorial', inner);
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
  });

  test('第三栏打开子文时 Escape 只收起子文，不关总览', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/series-demo');
    await page
      .locator('[data-reading-doc] .article-shell [data-series="hub-inline"] a[href="/articles/series-demo/1"]')
      .click();
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 1',
      inner,
    );
    await expect(page.locator('[data-reading-rail] nav.reading-series')).toBeHidden();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(page.locator('[data-reading-rail] nav.reading-series')).toBeVisible();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(page.locator('[data-reading-shell]')).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'Series demo: a tutorial',
      inner,
    );
  });

  test('项目页左栏是完整项目页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/aletheia');

    const index = page.locator('[data-reading-index]');
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/articles"]')).toBeVisible();
    await expect(index.getByRole('heading', { name: 'Timeline: from cards to a container' })).toBeVisible();
    await expect(index.locator('[data-tl-item]').first()).toBeVisible();
    await expect(index.getByText('Three explicit hand-offs:')).toBeVisible();
    await expect(
      index.locator('[data-tl-item] a[href="/projects/aletheia"]'),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'Aletheia',
      inner,
    );
  });

  test('项目页有标题时目录浮在阅读区右侧', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/aletheia');

    const rail = page.locator('[data-reading-rail]');
    await expect(rail.locator('nav.toc')).toBeVisible();
    await expect(page.locator('[data-reading-doc] nav.toc')).toHaveCount(0);

    const pos = await page.evaluate(() => {
      const toc = document.querySelector('[data-reading-rail] nav.toc');
      const article = document.querySelector('article.article-page');
      const doc = document.querySelector('[data-reading-doc]');
      if (!toc || !article || !doc) return null;
      const t = toc.getBoundingClientRect();
      const a = article.getBoundingClientRect();
      const d = doc.getBoundingClientRect();
      return {
        tocLeft: t.left,
        tocRight: t.right,
        articleRight: a.right,
        docLeft: d.left,
        docRight: d.right,
      };
    });
    expect(pos).not.toBeNull();
    expect(pos!.tocLeft).toBeGreaterThanOrEqual(pos!.articleRight - 1);
    expect(pos!.tocLeft).toBeGreaterThanOrEqual(pos!.docLeft);
    expect(pos!.tocRight).toBeLessThanOrEqual(pos!.docRight + 1);
  });

  test('左栏点另一个项目只换正文，时间线滚动保留', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/projects/aletheia');

    const index = page.locator('[data-reading-index]');
    const before = await index.evaluate((el: HTMLElement) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(80, max);
      el.setAttribute('data-keep-index', '1');
      return el.scrollTop;
    });

    await index.locator('[data-tl-item] a[href="/projects/network"]').evaluate((a) => {
      a.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
      a.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
    });
    await expect(page).toHaveURL(/\/projects\/network\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText('Networks', inner);
    await expect(index).toHaveAttribute('data-keep-index', '1');
    expect(await index.evaluate((el: HTMLElement) => el.scrollTop)).toBe(before);
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(
      index.locator('[data-tl-item] a[href="/projects/network"]'),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('点当前文章不换页也不滚左栏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/articles/heptabase-method');

    const index = page.locator('[data-reading-index]');
    const card = index.locator('a[href="/articles/heptabase-method"]');
    await expect(card).toHaveAttribute('aria-current', 'page');

    await card.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
    const before = await index.evaluate((el: HTMLElement) => {
      el.setAttribute('data-keep-index', '1');
      return { top: el.scrollTop, html: el.innerHTML };
    });

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(
      box!.x + Math.min(24, box!.width / 2),
      box!.y + Math.min(12, box!.height / 2),
    );

    await expect(page).toHaveURL(/\/articles\/heptabase-method\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'How I use Heptabase for deep learning',
      inner,
    );
    await expect(index).toHaveAttribute('data-keep-index', '1');
    const after = await index.evaluate((el: HTMLElement) => ({
      top: el.scrollTop,
      html: el.innerHTML,
    }));
    expect(after.top).toBe(before.top);
    expect(after.html).toBe(before.html);
  });

  test('左栏点另一篇只换正文和目录，左栏滚动保留', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('[data-reading-rail] nav.toc')).toBeVisible();

    const before = await index.evaluate((el: HTMLElement) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(120, max);
      el.setAttribute('data-keep-index', '1');
      return el.scrollTop;
    });

    await index.locator('a[href="/articles/heptabase-method"]').evaluate((a) => {
      a.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
      a.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
    });
    await expect(page).toHaveURL(/\/articles\/heptabase-method\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'How I use Heptabase for deep learning',
      inner,
    );
    await expect(index.locator('a[href="/articles/heptabase-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/pkm-method"]')).not.toHaveAttribute(
      'aria-current',
    );
    await expect(page.locator('[data-reading-rail] nav.toc')).toBeVisible();
    await expect(page.locator('[data-reading-doc] nav.toc')).toHaveCount(0);
    await expect(index).toHaveAttribute('data-keep-index', '1');
    expect(await index.evaluate((el: HTMLElement) => el.scrollTop)).toBe(before);
    await expect(index.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();
  });

  test('从长文点短文只换正文，目录栏拿掉，左栏不动', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    await expect(page.locator('[data-reading-rail] nav.toc')).toBeVisible();
    await index.evaluate((el: HTMLElement) => el.setAttribute('data-keep-index', '1'));

    await index.locator('a[href="/articles/embed-preview"]').click({ force: true });
    await expect(page).toHaveURL(/\/articles\/embed-preview\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(index).toHaveAttribute('data-keep-index', '1');
    await expect(index.locator('a[href="/articles/embed-preview"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('左栏点合集总览在中栏打开，不进第三栏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    await index.locator('a[href="/articles/series-demo"]').click({ force: true });
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'Series demo: a tutorial',
      inner,
    );
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(
      page.locator('[data-reading-rail] [data-series="hub"] a[href="/articles/series-demo/1"]'),
    ).toBeVisible();
  });

  test('分栏点「更早」只换左栏，正文与 URL 不变', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );

    await index.getByRole('link', { name: 'Earlier' }).click();

    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(page.locator('[data-reading-shell]')).toBeVisible();
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(index.locator('a[href="/articles/embed-preview"]')).toHaveCount(0);
    await expect(index.getByRole('link', { name: 'Newer' })).toBeVisible();

    await index.locator('a[href="/articles/dummy-2026-01"]').click({ force: true });
    await expect(page).toHaveURL(/\/articles\/dummy-2026-01\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText('Placeholder 2026-01', inner);
    await expect(index.locator('a[href="/articles/dummy-2026-01"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/embed-preview"]')).toHaveCount(0);
  });

  test('分栏点左栏标题「项目」只换左栏，正文与 URL 不变', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const switcher = index.locator('[data-reading-index-switch]');
    const doc = page.locator('[data-reading-doc]');

    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();

    await switcher.getByRole('link', { name: 'Projects' }).click();

    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(page.locator('[data-reading-shell]')).toBeVisible();
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(index.locator('[data-tl-item]').first()).toBeVisible();
    await expect(switcher.locator('h1')).toHaveAttribute('aria-current', 'page');

    await switcher.getByRole('link', { name: 'Articles' }).click();
    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
  });

  test('窄屏从文章回列表再切项目', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/articles/pkm-method');
    await page.getByRole('link', { name: '← Articles' }).click();
    await expect(page).toHaveURL(/\/articles\/?$/);
    await page.locator('[data-reading-index-switch]').getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('[data-reading-shell]')).toHaveCount(0);
  });

  test('窄屏只显示正文和返回', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/articles/pkm-method');
    await expect(page.locator('[data-reading-index]')).toBeHidden();
    await expect(page.locator('[data-reading-rail]')).toBeHidden();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    await expect(page.getByRole('link', { name: '← Articles' })).toBeVisible();
  });

  test('分栏点关闭回到首页 About', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const index = page.locator('[data-reading-index]');
    const heading = index.getByRole('heading', { level: 1, name: 'Articles' });
    const close = index.locator('[data-reading-close]');
    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute('href', '/');
    await expect(page.getByRole('link', { name: 'Close' })).toBeVisible();
    await expect(page.locator('[data-reading-doc] [data-reading-close]')).toHaveCount(0);
    await expect(page.locator('.reading-close-mark')).toHaveCount(0);

    const headingBox = await heading.boundingBox();
    const closeBox = await close.boundingBox();
    expect(headingBox).toBeTruthy();
    expect(closeBox).toBeTruthy();
    expect(closeBox!.x).toBeGreaterThan(headingBox!.x + headingBox!.width - 4);

    await close.click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(index.locator('a[aria-current="page"]')).toHaveCount(0);
  });

  test('分栏从项目关闭也回到首页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/aletheia');
    const index = page.locator('[data-reading-index]');
    const close = index.locator('[data-reading-close]');
    await expect(close).toBeVisible();
    await expect(close).toHaveAttribute('href', '/');
    await expect(page.locator('[data-reading-doc] [data-reading-close]')).toHaveCount(0);
    await close.click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
  });

  test('左栏翻页后关闭仍回首页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const index = page.locator('[data-reading-index]');
    await index.getByRole('link', { name: 'Earlier' }).click();
    await expect(index.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(page.locator('[data-reading-close]')).toHaveAttribute('href', '/');

    await page.locator('[data-reading-close]').click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(index.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
  });

  test('左栏换成项目后关闭仍回首页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    await page
      .locator('[data-reading-index] [data-reading-index-switch]')
      .getByRole('link', { name: 'Projects' })
      .click();
    await expect(
      page.locator('[data-reading-index]').getByRole('heading', { level: 1, name: 'Projects' }),
    ).toBeVisible();
    await expect(page.locator('[data-reading-close]')).toHaveAttribute('href', '/');

    await page.locator('[data-reading-close]').click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
  });

  test('Escape 关闭正文回到首页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    await expect(page.locator('[data-reading-doc]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
  });
});

test.describe('分栏关闭（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('左栏卡片仍是指向文章的真实链接', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const card = page.locator('[data-reading-index] a[href="/articles/heptabase-method"]');
    await expect(card).toHaveAttribute('href', '/articles/heptabase-method');
    await card.click();
    await expect(page).toHaveURL(/\/articles\/heptabase-method\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
  });

  test('关闭是指向索引的真实链接', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const close = page.locator('[data-reading-index] [data-reading-close]');
    await expect(close).toHaveAttribute('href', '/');
    await expect(page.locator('[data-reading-doc] [data-reading-close]')).toHaveCount(0);
    await close.click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(page.locator('[data-reading-index]')).toBeVisible();
  });
});
