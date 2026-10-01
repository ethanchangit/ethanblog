import { test, expect } from '@playwright/test';

const FINAL = '/pkm-method/';
const PROJECT = '/aletheia/';

test.describe('文章留言', () => {
  test('空正文的右栏留言保持在下方，窗口增高和增加一段正文都不会把它挤上去', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/my-toolset', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mention-preview-ready]')).toBeAttached();
    await page.locator('[data-reading-doc] a[href="/grokbot"]').click();
    const pane = page.locator('[data-reading-child]');
    await expect(pane.locator('#comments')).toBeVisible();

    for (const height of [900, 1100]) {
      await page.setViewportSize({ width: 1440, height });
      const layout = await pane.evaluate(root => {
        const pane = root.getBoundingClientRect();
        const body = root.querySelector('.prose-site')!.getBoundingClientRect();
        const comments = root.querySelector('#comments')!.getBoundingClientRect();
        return { gap: comments.top - body.bottom, remaining: pane.bottom - comments.bottom, position: (comments.top - pane.top) / pane.height };
      });
      expect(layout.gap).toBeGreaterThan(160);
      expect(layout.remaining).toBeGreaterThan(16);
      expect(layout.remaining).toBeLessThan(80);
      expect(layout.position).toBeGreaterThan(0.7);
    }

    const before = await pane.locator('#comments').boundingBox();
    await pane.locator('.prose-site').evaluate(root => {
      const paragraph = document.createElement('p');
      paragraph.textContent = '一小段正文，留言区仍在阅读区域下方。';
      root.appendChild(paragraph);
    });
    const after = await pane.locator('#comments').boundingBox();
    expect(Math.abs(after!.y - before!.y)).toBeLessThan(1);
  });

  test('直接打开空卡片也保留留白，长文和手机上的留言仍接在正文后面且可以输入', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto('/grokbot', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#comments')).toBeVisible();
    const short = await page.locator('[data-reading-doc]').evaluate(root => {
      const pane = root.getBoundingClientRect();
      const comments = root.querySelector('#comments')!.getBoundingClientRect();
      return (comments.top - pane.top) / pane.height;
    });
    expect(short).toBeGreaterThan(0.7);

    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.goto(FINAL, { waitUntil: 'domcontentloaded' });
      const spacing = await page.locator('.article-main').evaluate(root => {
        const body = root.querySelector('.prose-site')!.getBoundingClientRect();
        const comments = root.querySelector('#comments')!.getBoundingClientRect();
        return { gap: comments.top - body.bottom, overflow: document.documentElement.scrollWidth > innerWidth };
      });
      expect(spacing.gap).toBeGreaterThanOrEqual(64);
      expect(spacing.overflow).toBe(false);
      const input = page.locator('#comments textarea[name="body"]');
      await input.scrollIntoViewIfNeeded();
      await expect(page.locator('astro-island').filter({ has: input })).not.toHaveAttribute('ssr');
      await input.fill('第一行\n第二行\n第三行\n第四行');
      await expect(input).toBeVisible();
      await expect(input).toHaveValue('第一行\n第二行\n第三行\n第四行');
    }
  });

  test('定稿页文末是发信表单，不是留言板', async ({ page }) => {
    const response = await page.goto(FINAL, { waitUntil: 'domcontentloaded' });
    expect(response?.status()).toBe(200);

    const comments = page.locator('#comments');
    await expect(comments).toBeVisible();
    await expect(comments.getByRole('heading', { name: "留言", exact: true })).toBeVisible();
    await expect(
      comments.getByText("写完会发到我的邮箱，不会出现在这页上。"),
    ).toBeVisible();
    await expect(comments.getByText('No comments yet.')).toHaveCount(0);
    await expect(comments.getByText('还没有人留言')).toHaveCount(0);
    await expect(comments.locator('.comment-list')).toHaveCount(0);
    await expect(comments.locator('input[name="visibility"]')).toHaveCount(0);
    await expect(comments.getByText('Public', { exact: true })).toHaveCount(0);
    await expect(comments.getByText('Private', { exact: true })).toHaveCount(0);
    await expect(comments.getByText('公开', { exact: true })).toHaveCount(0);
    await expect(comments.getByText('私密', { exact: true })).toHaveCount(0);
    await expect(comments.locator('input[name="name"]')).toBeVisible();
    await expect(comments.locator('input[name="email"]')).toBeVisible();
    await expect(comments.locator('textarea[name="body"]')).toBeVisible();
    await expect(comments.getByRole('button', { name: "发送" })).toBeVisible();
    await expect(comments.locator('form')).toHaveAttribute('action', '/api/comments');
    await expect(comments.locator('form')).toHaveAttribute('method', /post/i);
    await expect(comments.locator('input[name="slug"]')).toHaveValue('pkm-method');
    await expect(comments.getByRole('button', { name: '写下' })).toHaveCount(0);
    await expect(comments.getByText('一两句话即可。')).toHaveCount(0);

    const honeypot = comments.locator('input[name="website"]');
    await expect(honeypot).toHaveCount(1);
    await expect(comments.locator('.comment-honeypot')).toHaveAttribute('aria-hidden', 'true');
    await expect(comments.getByRole('textbox', { name: 'Website' })).toHaveCount(0);

    const bodyBox = await comments.locator('textarea[name="body"]').boundingBox();
    const foot = comments.locator('.comment-compose-foot');
    const footBox = await foot.boundingBox();
    expect(bodyBox).toBeTruthy();
    expect(footBox).toBeTruthy();
    expect(footBox!.y).toBeLessThan(bodyBox!.y);
    await expect(foot.locator('input[name="name"]')).toBeVisible();
    await expect(foot.locator('input[name="email"]')).toBeVisible();
    await expect(foot.getByRole('button', { name: "发送" })).toBeVisible();

    const footer = page.locator('article footer');
    await expect(footer.getByText('请这样引用')).toHaveCount(0);
    await expect(footer.locator('a[href^="mailto:"]')).toHaveCount(0);
  });

  test('首页和项目页没有留言表单', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('#comments')).toHaveCount(0);

    const project = await page.goto(PROJECT, { waitUntil: 'domcontentloaded' });
    expect(project?.status()).toBe(200);
    await expect(page.locator('#comments')).toHaveCount(0);
  });
});
