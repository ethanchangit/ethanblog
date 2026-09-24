import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';

let child: ChildProcess, url: string;
test.beforeAll(async () => {
  child = spawn(globalThis.process.execPath, ['studio/online/preview.mjs'], {
    env: { ...globalThis.process.env, STUDIO_PREVIEW_PORT: '0', STUDIO_PAGE_CAP_FIXTURE: '1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Dashboard simulator did not start')), 15000);
    child.once('error', reject);
    child.once('exit', code => reject(new Error(`Dashboard simulator exited: ${code}`)));
    child.stdout!.on('data', data => {
      output += data.toString();
      const match = output.match(/http:\/\/localhost:\d+\/dashboard/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
});
test.afterAll(() => { child?.kill('SIGTERM'); });

test('超过 4 张站点页时要在审核清单里选择留下哪几页', async ({ page }) => {
  await page.goto(url);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByLabel('后台密码')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  const choice = page.locator('[data-review-group=pages]');
  await expect(choice.getByRole('heading', { name: '站点页面' })).toBeVisible();
  await expect(choice).toContainText('站点页面最多显示 4 页');
  await expect(choice).toContainText('现在有 5 张 Page 卡片');
  await expect(choice).toContainText('项目、博客和 Reference 没有上限');
  await expect(choice).toContainText('拖动手柄排列导航顺序');
  await expect(page.getByRole('button', { name: '确认留下这些页面' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '我确认就留下勾选的页面。' })).toHaveCount(0);
  const group = choice.getByRole('group', { name: '留下哪几页' });
  for (const name of [/关于/, /Now/, /联系/, /读书笔记/]) await group.getByRole('checkbox', { name }).check();
  await expect(page.locator('#notice')).toContainText('已记下留下的 4 页', { timeout: 5000 });
  await group.getByRole('checkbox', { name: /隐私/ }).click();
  await expect(group.getByRole('checkbox', { name: /隐私/ })).not.toBeChecked();
  await expect(page.locator('#notice')).toContainText('站点页面最多留下 4 页');
  await expect(page.getByRole('list', { name: '导航顺序' })).toContainText('读书笔记');
  const reading = page.getByRole('button', { name: '拖动「读书笔记」调整顺序' });
  const contact = page.getByRole('button', { name: '拖动「联系」调整顺序' });
  await reading.dragTo(contact);
  await expect(page.getByRole('list', { name: '导航顺序' }).locator('li')).toHaveText([/关于/, /Now/, /读书笔记/, /联系/]);
  await expect(page.locator('#notice')).toContainText('导航顺序：');
  await page.getByRole('tab', { name: /New articles/ }).click();
  await page.getByRole('button', { name: '读书笔记', exact: true }).click();
  await expect(page.locator('#review-preview .review-meta')).toContainText('最多显示 4 页');
  await page.getByRole('button', { name: '通过「读书笔记」', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('article · 已通过，待发布')).toBeVisible();
  await page.getByRole('tab', { name: /Deleted articles · 3/ }).click();
  await expect(page.getByRole('tab', { name: /Deleted articles · 3/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '隐私', exact: true })).toBeVisible();
});
