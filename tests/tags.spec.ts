import { test, expect, type Page } from '@playwright/test';

const ARTICLE = '/articles/software-creation-journey/';

function selectedTag(url: string): string | null {
  return new URL(url).searchParams.get('tag');
}

function selectedGroup(url: string): string | null {
  return new URL(url).searchParams.get('group');
}

function tagCloudLink(page: Page, tag: string) {
  return page.locator('[data-tag-list]').getByRole('link', { name: tag, exact: true });
}

test.describe('Tags（内容集合过滤）', () => {
  test('导航有标签入口，/tags 默认全部标签加分组切换', async ({ page }) => {
    await page.goto('/');
    const nav = page.locator('header nav a[href="/tags"]');
    await expect(nav).toHaveText('标签', { useInnerText: true });

    await nav.click();
    await expect(page).toHaveURL(/\/tags\/?$/);
    await expect(page.getByRole('heading', { name: '标签' })).toBeVisible();
    await expect(page.getByRole('link', { name: '全部' })).toBeVisible();
    await expect(page.getByRole('link', { name: '写作与知识' })).toBeVisible();
    await expect(page.getByRole('link', { name: '软件与项目' })).toBeVisible();
    await expect(page.getByRole('link', { name: '媒介与研究' })).toBeVisible();
    await expect(tagCloudLink(page, '软件开发')).toBeVisible();
    await expect(tagCloudLink(page, '知识管理')).toBeVisible();
    await expect(page.getByRole('heading', { name: '文档' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '我的软件创建之路' })).toBeHidden();

    const item = page.locator('[data-tag-item][data-tag-name="知识管理"]');
    await expect(item.getByRole('link')).toHaveText('知识管理', { useInnerText: true });
    await expect(item.locator('.ui-meta')).toHaveText(/^\d+$/);
    await expect(page.locator('[data-tag-group-tabs]')).toBeVisible();
    await expect(page.locator('[data-tag-list]')).toBeVisible();
  });

  test('点分组标题只显示该组标签', async ({ page }) => {
    await page.goto('/tags');
    await page.getByRole('link', { name: '软件与项目' }).click();
    await expect.poll(() => selectedGroup(page.url())).toBe('software');
    await expect(tagCloudLink(page, '软件开发')).toBeVisible();
    await expect(tagCloudLink(page, '知识管理')).toBeHidden();

    await page.getByRole('link', { name: '全部' }).click();
    await expect.poll(() => selectedGroup(page.url())).toBeNull();
    await expect(tagCloudLink(page, '知识管理')).toBeVisible();
  });

  test('文章页眉标签可点，在 /tags 就地筛出该标签文档', async ({ page }) => {
    await page.goto(ARTICLE);
    const header = page.locator('article header');
    await expect(header.getByRole('link', { name: '#软件开发' })).toBeVisible();

    await header.getByRole('link', { name: '#软件开发' }).click();
    await expect.poll(() => selectedTag(page.url())).toBe('软件开发');
    await expect(page).toHaveURL(/\/tags\/?/);
    await expect(page.getByRole('link', { name: '全部' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '#软件开发' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: '我的软件创建之路' })).toBeVisible();
  });

  test('从 /tags 点标签不离开本页，只更新下方文档', async ({ page }) => {
    await page.goto('/tags');
    await tagCloudLink(page, '软件开发').click();
    await expect.poll(() => selectedTag(page.url())).toBe('软件开发');
    await expect(page).toHaveURL(/\/tags\/?/);
    await expect(page.getByRole('link', { name: '软件与项目' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '我的软件创建之路' })).toBeVisible();
    await expect(
      page.locator('[data-doc-item]:not([hidden]) .ui-tag').filter({ hasText: '软件开发' }),
    ).toHaveText('软件开发', { useInnerText: true });

    await page.getByRole('link', { name: '全部' }).click();
    await expect.poll(() => selectedTag(page.url())).toBeNull();
    await expect(page.getByRole('heading', { name: '我的软件创建之路' })).toBeHidden();
  });

  test('再点同一标签会清除筛选', async ({ page }) => {
    await page.goto('/tags');
    const tag = tagCloudLink(page, '软件开发');
    await tag.click();
    await expect(page.getByRole('heading', { name: '我的软件创建之路' })).toBeVisible();
    await tag.click();
    await expect.poll(() => selectedTag(page.url())).toBeNull();
    await expect(page.getByRole('heading', { name: '我的软件创建之路' })).toBeHidden();
  });

  test('标签页没有关键字输入，检索走全站搜索', async ({ page }) => {
    await page.goto('/tags');
    await expect(page.getByTestId('tag-filter')).toHaveCount(0);
    await expect(page.getByRole('searchbox')).toHaveCount(0);
    await expect(page.locator('header nav a[href="/search"]')).toBeVisible();
  });

  test('旧 /tags/{tag} 地址重定向到查询参数', async ({ page }) => {
    await page.goto('/tags/PKM');
    await expect.poll(() => selectedTag(page.url())).toBe('PKM');
    await expect(page.getByRole('heading', { name: '我的 PKM 实践：从笔记到知识网络' })).toBeVisible();
  });

  test('草稿专属标签不生成页面', async ({ page }) => {
    const response = await page.goto(`/tags/${encodeURIComponent('Realtalk')}`);
    expect(response?.status()).toBe(404);
  });
});
