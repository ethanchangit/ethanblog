import { test, expect } from '@playwright/test';

const FINAL = '/articles/pkm-method/';

test.describe('文章留言', () => {
  test('定稿页文末是私信表单，不是留言板', async ({ page }) => {
    const response = await page.goto(FINAL);
    expect(response?.status()).toBe(200);

    const comments = page.locator('#comments');
    await expect(comments).toBeVisible();
    await expect(comments.getByRole('heading', { name: 'Comments', exact: true })).toBeVisible();
    await expect(
      comments.getByText("This sends a private note to my inbox. It won't be published here."),
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
    await expect(comments.getByRole('button', { name: '写下' })).toHaveCount(0);
    await expect(comments.getByText('一两句话即可。')).toHaveCount(0);

    const footer = page.locator('article footer');
    await expect(footer.getByText('请这样引用')).toHaveCount(0);
    await expect(footer.locator('a[href^="mailto:"]')).toHaveCount(0);
  });
});
