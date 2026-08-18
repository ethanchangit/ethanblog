import { test, expect } from '@playwright/test';

test.describe('Projects 集合页', () => {
  test('/projects 是导语 + 时间线，不是项目长文', async ({ page }) => {
    await page.goto('/projects');

    await expect(page.getByRole('heading', { name: '项目是一条线' })).toBeVisible();
    await expect(page.locator('.ui-eyebrow')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '时间线：从卡片到容器' })).toBeVisible();
    await expect(page.locator('[data-tl-item]').first()).toBeVisible();

    // 旧版卡片网格不应存在
    await expect(page.locator('.grid.gap-4.sm\\:grid-cols-2')).toHaveCount(0);

    // 单项目长文与内嵌演示已迁到档案页
    await expect(page.getByRole('heading', { name: 'Aletheia → Trace：阅读时学词' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Network：卡片与键盘' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Robert：语音与块' })).toHaveCount(0);
    await expect(page.getByText('Network · 键盘笔记')).toHaveCount(0);
    await expect(page.getByText('Robert · 语音笔记')).toHaveCount(0);
  });

  test('时间线节点链到对应项目页，按 frontmatter order', async ({ page }) => {
    await page.goto('/projects');
    const links: [string, string][] = [
      ['0', '/projects/maker-plan'],
      ['1', '/projects/aletheia'],
      ['2', '/projects/network'],
      ['3', '/projects/robert'],
      ['4', '/projects/chunk'],
      ['5', '/projects/trace'],
      ['6', '/projects/craft-space'],
      ['7', '/projects/ethanchang-io'],
      ['8', '/projects/deeptalk'],
    ];
    for (const [idx, href] of links) {
      await expect(page.locator(`[data-tl-item="${idx}"] a[href="${href}"]`)).toBeVisible();
    }
  });

  test('时间线副标题用项目 description，不另造文案', async ({ page }) => {
    await page.goto('/projects');
    const row = page.locator('[data-tl-item] a[href="/projects/network"]');
    await expect(row.locator('p .i18n-zh')).toHaveText('卡片既是文件夹也是文档的笔记工具');
    await expect(row.locator('p .i18n-en')).toHaveText(
      'A notes app where every card is both folder and document',
    );
    await expect(
      page.getByText('在桌面上验证「卡片 + 键盘」能否让重度写作者双手不离开键盘完成全部操作。'),
    ).toHaveCount(0);
  });

  test('演示与长文在独立档案页', async ({ page }) => {
    await page.goto('/projects/network');
    await expect(page.getByText('Networks · 早期原型切片', { exact: true })).toBeVisible();
    await expect(page.getByText('双手永远放在键盘上')).toBeVisible();

    await page.goto('/projects/robert');
    await expect(page.getByText('Robert · 交互原型', { exact: true })).toBeVisible();
    await expect(page.getByText('把语音放在第一入口')).toBeVisible();
  });

  test('项目页标题在 lede，没有状态芯片', async ({ page }) => {
    await page.goto('/projects/trace');
    const lede = page.locator('header.article-lede');
    await expect(lede.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(lede.locator('.mb-3.flex.items-center.gap-3')).toHaveCount(0);
    await expect(page.getByText('构思中')).toHaveCount(0);
    await expect(page.getByText('已发布')).toHaveCount(0);
    await expect(page.getByText('活跃开发')).toHaveCount(0);
  });

  test('项目页是单栏文章，没有右侧技术栈组件', async ({ page }) => {
    await page.goto('/projects/robert');
    await expect(page.getByRole('heading', { name: '技术栈' })).toHaveCount(0);
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(page.locator('article .grid.lg\\:grid-cols-\\[1fr_240px\\]')).toHaveCount(0);
    await expect(page.locator('article.article-page > header .ui-tag-list .ui-tag').first()).toBeVisible();
  });

  test('项目页标题下可复制规范 URL，且在导语之上', async ({ page }) => {
    await page.goto('/projects/ethanchang-io');

    const copy = page.getByRole('button', { name: '复制本页链接' });
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
    await expect(page.getByRole('button', { name: '已复制' })).toBeVisible();

    const copied = await page.evaluate(
      () => (window as unknown as { __copiedUrl?: string }).__copiedUrl,
    );
    const canonical = await page.locator('link[rel="canonical"]').getAttribute('href');
    expect(copied).toBe(canonical);
    expect(copied).toMatch(/^https:\/\/ethanchang\.io\/projects\/ethanchang-io\/?$/);
  });

  test('项目索引不收录文章', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('a[href="/articles/pkm-method"]')).toHaveCount(0);
    await expect(page.locator('a[href="/projects/pkm-method"]')).toHaveCount(0);
  });
});
