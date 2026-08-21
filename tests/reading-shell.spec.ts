import { test, expect } from '@playwright/test';

const inner = { useInnerText: true } as const;

test.describe('分栏阅读', () => {
  test('/articles 未点开仍是单栏索引', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles');
    await expect(page.locator('[data-reading-shell]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1, name: '文章' })).toBeVisible();
    await expect(page.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
  });

  test('文章页左栏是完整索引，中栏是正文，长文第三栏是目录', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    const rail = page.locator('[data-reading-rail]');

    await expect(index).toBeVisible();
    await expect(index.getByRole('heading', { level: 1, name: '文章' })).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/pkm-method"] p').first()).toBeVisible();

    await expect(doc.locator('.article-lede h1')).toHaveText(
      '我的 PKM 实践：从笔记到知识网络',
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
      const doc = document.querySelector('[data-reading-doc]');
      if (!toc || !doc) return null;
      return {
        tocLeft: toc.getBoundingClientRect().left,
        docRight: doc.getBoundingClientRect().right,
      };
    });
    expect(pos).not.toBeNull();
    expect(pos!.tocLeft).toBeGreaterThanOrEqual(pos!.docRight - 1);
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

    await rail.locator('[data-series="hub"] a[href="/articles/series-demo/1"]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/1\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      '系列演示 · 第 1 页',
      inner,
    );
    await expect(
      page.locator('[data-reading-rail] a[href="/articles/series-demo/1"]'),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('项目页左栏是完整项目页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/aletheia');

    const index = page.locator('[data-reading-index]');
    await expect(index.getByRole('heading', { name: '项目是一条线' })).toBeVisible();
    await expect(index.getByRole('heading', { name: '时间线：从卡片到容器' })).toBeVisible();
    await expect(index.locator('[data-tl-item]').first()).toBeVisible();
    await expect(index.getByText('三条明确的能力传递：')).toBeVisible();
    await expect(
      index.locator('[data-tl-item] a[href="/projects/aletheia"]'),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'Aletheia',
      inner,
    );
  });

  test('左栏点另一篇会换正文并改当前项', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await index.locator('a[href="/articles/heptabase-method"]').click();
    await expect(page).toHaveURL(/\/articles\/heptabase-method\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      '我是如何使用 Heptabase 进行深度学习的',
      inner,
    );
    await expect(index.locator('a[href="/articles/heptabase-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/pkm-method"]')).not.toHaveAttribute(
      'aria-current',
    );
  });

  test('窄屏只显示正文和返回', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/articles/pkm-method');
    await expect(page.locator('[data-reading-index]')).toBeHidden();
    await expect(page.locator('[data-reading-rail]')).toBeHidden();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    await expect(page.getByRole('link', { name: '← 文章' })).toBeVisible();
  });
});
