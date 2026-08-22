import { test, expect } from '@playwright/test';

const FINAL = '/articles/pkm-method/';
const PROJECT = '/projects/aletheia/';

test.describe('文章留言', () => {
  test('定稿页文末是发信表单，不是留言板', async ({ page }) => {
    const response = await page.goto(FINAL);
    expect(response?.status()).toBe(200);

    const comments = page.locator('#comments');
    await expect(comments).toBeVisible();
    await expect(comments.getByRole('heading', { name: 'Comments', exact: true })).toBeVisible();
    await expect(
      comments.getByText('After you send it, it goes to my inbox. It will not appear on this page.'),
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
    await expect(comments.getByRole('button', { name: 'Send' })).toBeVisible();
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
    expect(bodyBox!.y).toBeLessThan(footBox!.y);
    await expect(foot.locator('input[name="name"]')).toBeVisible();
    await expect(foot.locator('input[name="email"]')).toBeVisible();
    await expect(foot.getByRole('button', { name: 'Send' })).toBeVisible();

    const footer = page.locator('article footer');
    await expect(footer.getByText('请这样引用')).toHaveCount(0);
    await expect(footer.locator('a[href^="mailto:"]')).toHaveCount(0);
  });

  test('首页和项目页没有留言表单', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#comments')).toHaveCount(0);

    const project = await page.goto(PROJECT);
    expect(project?.status()).toBe(200);
    await expect(page.locator('#comments')).toHaveCount(0);
  });
});
