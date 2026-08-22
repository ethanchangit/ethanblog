import { test, expect } from '@playwright/test';

const FINAL = '/articles/pkm-method/';

test.describe('Article 论文化接口（T2）', () => {
  test('定稿页无摘要小标，无页眉作者行', async ({ page }) => {
    const response = await page.goto(FINAL);
    expect(response?.status()).toBe(200);

    const header = page.locator('article header');
    await expect(header.locator('.article-dek-label')).toHaveCount(0);
    await expect(header.getByText('摘要', { exact: true })).toHaveCount(0);
    await expect(header.getByText('Abstract', { exact: true })).toHaveCount(0);
    await expect(header.locator('.article-dek-text')).toBeVisible();
    await expect(header.getByText(/文 \//)).toHaveCount(0);
  });

  test('摘要是导语档：字号行距与正文不同，底下有发丝线', async ({ page }) => {
    await page.goto(FINAL);

    const dek = page.locator('header.article-dek');
    await expect(dek.locator('.article-dek-label')).toHaveCount(0);
    await expect(dek.locator('.article-dek-text')).toBeVisible();
    await expect(dek.locator('.i18n-en').first()).toHaveText(
      'The personal knowledge system I run in Obsidian: three layers, naming rules, and a bias toward links.',
    );

    const styles = await page.evaluate(() => {
      const dekEl = document.querySelector('.article-dek');
      const dekText = document.querySelector('.article-dek-text');
      const column = document.querySelector('.article-page');
      const proseP = [...document.querySelectorAll('.prose-site p')].find(
        (el) => el.getClientRects().length > 0,
      );
      if (!dekEl || !dekText || !column || !proseP) return null;
      const d = getComputedStyle(dekEl);
      const t = getComputedStyle(dekText);
      const p = getComputedStyle(proseP);
      return {
        borderBottomWidth: parseFloat(d.borderBottomWidth),
        dekSize: parseFloat(t.fontSize),
        dekLine: parseFloat(t.lineHeight),
        dekWidth: dekText.getBoundingClientRect().width,
        columnWidth: column.getBoundingClientRect().width,
        proseWidth: proseP.getBoundingClientRect().width,
        proseSize: parseFloat(p.fontSize),
        proseLine: parseFloat(p.lineHeight),
        dekColor: t.color,
        proseColor: p.color,
        marginBottom: parseFloat(d.marginBottom),
      };
    });

    expect(styles).not.toBeNull();
    expect(styles!.borderBottomWidth).toBe(1);
    expect(styles!.dekSize).toBeGreaterThan(styles!.proseSize);
    expect(styles!.dekLine).toBeGreaterThan(styles!.proseLine);
    expect(Math.abs(styles!.dekWidth - styles!.proseWidth)).toBeLessThan(2);
    expect(styles!.dekWidth).toBeLessThanOrEqual(styles!.columnWidth + 1);
    expect(styles!.dekColor).not.toBe(styles!.proseColor);
    expect(styles!.marginBottom).toBeGreaterThanOrEqual(40);
  });

  test('标题下可复制规范 URL，且在摘要之上', async ({ page }) => {
    await page.goto(FINAL);

    const copy = page.getByRole('button', { name: 'Copy page URL' });
    const island = page.locator('astro-island').filter({ has: copy });
    await expect(copy).toBeVisible();
    await expect(island).not.toHaveAttribute('ssr');

    const ledeBottom = await page.locator('header.article-lede').evaluate((el) => {
      return el.getBoundingClientRect().bottom;
    });
    const copyTop = await copy.evaluate((el) => el.getBoundingClientRect().top);
    const abstractTop = await page.locator('.article-dek').evaluate((el) => {
      return el.getBoundingClientRect().top;
    });
    expect(copyTop).toBeGreaterThan(ledeBottom - 1);
    expect(copyTop).toBeLessThan(abstractTop);

    await page.evaluate(() => {
      Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: {
          writeText: async (text: string) => {
            (window as unknown as { __copiedUrl?: string }).__copiedUrl = text;
          },
        },
      });
    });

    await copy.click();
    await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();

    const copied = await page.evaluate(
      () => (window as unknown as { __copiedUrl?: string }).__copiedUrl,
    );
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(copied).toBe(canonical);
    expect(copied).toMatch(/^https:\/\/ethanchang\.io\/articles\/pkm-method\/?$/);
  });

  test('1440×900 下第三栏目录可见、H3 有缩进、可点锚点', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(FINAL);

    const toc = page.locator('nav.toc');
    await expect(toc).toBeVisible();
    await expect(toc).toHaveAttribute('aria-label', 'Table of contents');
    await expect(toc.locator('.toc-title')).toHaveCount(0);
    await expect(toc.getByText('目录', { exact: true })).toHaveCount(0);
    await expect(toc.getByText('Contents', { exact: true })).toHaveCount(0);
    await expect(page.locator('[data-reading-rail]')).toBeVisible();

    const firstLabel = toc.locator('a .toc-label').filter({ visible: true }).first();
    await expect(firstLabel).toBeVisible();
    await expect(firstLabel).toHaveCSS('opacity', '1');

    const h3 = toc.locator('a[data-depth="3"]').filter({ visible: true }).first();
    await expect(h3).toBeVisible();
    const indent = await h3.evaluate((el) => parseFloat(getComputedStyle(el).paddingLeft));
    expect(indent).toBeGreaterThanOrEqual(12);

    const firstLink = toc.locator('a').filter({ visible: true }).first();
    await firstLink.focus();
    await expect(firstLink).toBeFocused();

    await firstLink.click();
    await expect(page).toHaveURL(/#.+/);
    await expect(firstLink).toHaveAttribute('aria-current', 'true');
  });

  test('390×844 下左栏与目录都隐藏，只显示正文，无横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(FINAL);

    await expect(page.locator('details.toc-mobile')).toHaveCount(0);
    await expect(page.locator('[data-reading-index]')).toBeHidden();
    await expect(page.locator('[data-reading-rail]')).toBeHidden();
    await expect(page.locator('.reading-toc-entry')).toHaveCount(0);
    await expect(page.locator('.article-body-row > details')).toHaveCount(0);
    await expect(page.getByRole('link', { name: '← Articles' })).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();

    const stacked = await page.evaluate(() => {
      const row = document.querySelector('.article-body-row');
      const article = document.querySelector('article.article-page');
      if (!row || !article) return null;
      return {
        rowTop: row.getBoundingClientRect().top,
        articleTop: article.getBoundingClientRect().top,
      };
    });
    expect(stacked).not.toBeNull();
    expect(Math.abs(stacked!.articleTop - stacked!.rowTop)).toBeLessThan(4);

    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth
    );
    expect(fits).toBe(true);
  });

  test('1024×800 下目录在正文右侧第三栏，不进正文，标签可截断', async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 800 });
    await page.goto(FINAL);

    const toc = page.locator('nav.toc');
    await expect(toc).toBeVisible();
    await expect(page.locator('details.toc-mobile')).toHaveCount(0);

    const geometry = await page.evaluate(() => {
      const nav = document.querySelector('nav.toc');
      const article = document.querySelector('article.article-page');
      if (!nav || !article) return null;
      const t = nav.getBoundingClientRect();
      const a = article.getBoundingClientRect();
      const link = nav.querySelector('a');
      const linkStyle = link ? getComputedStyle(link) : null;
      return {
        tocRight: t.right,
        tocLeft: t.left,
        articleLeft: a.left,
        articleRight: a.right,
        tocWidth: t.width,
        ellipsis: linkStyle?.textOverflow ?? '',
        nowrap: linkStyle?.whiteSpace ?? '',
      };
    });

    expect(geometry).not.toBeNull();
    expect(geometry!.tocLeft).toBeGreaterThanOrEqual(geometry!.articleRight - 1);
    expect(geometry!.tocWidth).toBeGreaterThan(40);
    expect(geometry!.ellipsis).toBe('ellipsis');
    expect(geometry!.nowrap).toBe('nowrap');

    const fits = await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    );
    expect(fits).toBe(true);
  });
});
