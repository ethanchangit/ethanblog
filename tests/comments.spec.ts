import { test, expect } from '@playwright/test';

const FINAL = '/articles/pkm-method/';

test.describe('文章留言', () => {
  test('定稿页文末有留言区，不再出现邮件 CTA 与引用块', async ({ page }) => {
    const response = await page.goto(FINAL);
    expect(response?.status()).toBe(200);

    const comments = page.locator('#comments');
    await expect(comments).toBeVisible();
    await expect(comments.getByRole('heading', { name: '留言', exact: true })).toBeVisible();
    await expect(comments.getByText('还没有人留言。')).toBeVisible();
    await expect(comments.locator('input[name="name"]')).toBeVisible();
    await expect(comments.locator('textarea[name="body"]')).toBeVisible();
    await expect(comments.getByRole('button', { name: '发送' })).toBeVisible();
    const vis = comments.locator('input[name="visibility"]');
    await expect(vis).toHaveAttribute('value', 'private');
    await expect(vis).not.toBeChecked();
    await expect(comments.getByText('公开', { exact: true })).toBeVisible();
    await expect(comments.getByText('私密', { exact: true })).toBeHidden();
    await comments.locator('.comment-vis').click();
    await expect(vis).toBeChecked();
    await expect(comments.getByText('私密', { exact: true })).toBeVisible();
    await expect(comments.getByText('公开', { exact: true })).toBeHidden();
    await expect(comments.locator('form')).toHaveAttribute('action', '/api/comments');
    await expect(comments.getByRole('button', { name: '写下' })).toHaveCount(0);
    await expect(comments.getByText('一两句话即可。')).toHaveCount(0);

    const footer = page.locator('article footer');
    await expect(footer.getByText('请这样引用')).toHaveCount(0);
    await expect(footer.locator('a[href^="mailto:"]')).toHaveCount(0);
  });
});
