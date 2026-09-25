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
  const pagesTab = page.getByRole('tab', { name: /Pages/ });
  if (await pagesTab.count() === 0) {
    const button = page.getByRole('button', { name: '拉取最新更新', exact: true });
    const cards = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/heptabase/cards'));
    await button.click();
    await cards;
    await expect(button).toBeEnabled({ timeout: 15_000 });
  }
  await pagesTab.click();
  const choice = page.locator('#review-preview .page-choice');
  await expect(page.locator('#page-nav, .review-sidebar .page-choice')).toHaveCount(0);
  await expect(choice.locator('.panel-head, .group-caption, #notice')).toHaveCount(0);
  await expect(choice.getByRole('heading', { name: 'Pages' })).toHaveCount(0);
  await expect(choice).not.toContainText('拖动手柄');
  await expect(choice).not.toContainText('已记下');
  const preview = choice.getByRole('navigation', { name: '导航预览' });
  await expect(preview).toBeVisible();
  await expect(preview.locator('button, a')).toHaveCount(0);
  await expect(preview.locator('[data-page-id]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '确认留下这些页面' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: '我确认就留下勾选的页面。' })).toHaveCount(0);
  const group = choice.getByRole('group', { name: '留下哪几页' });
  const list = page.getByRole('list', { name: '导航顺序' });
  const keptIds = () => list.locator('li[data-checked="true"]:not([data-hidden="true"])').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-page-id')));
  const shownIds = () => preview.locator('[data-page-id]').evaluateAll(nodes => nodes.map(node => node.getAttribute('data-page-id')));
  for (const name of [/关于/, /Now/, /联系/, /读书笔记/]) await group.getByRole('checkbox', { name }).check();
  await expect(page.locator('#notice')).toHaveCount(0);
  expect(await shownIds()).toEqual(await keptIds());
  await expect(preview.locator('[data-page-id]')).toHaveCount(4);
  await group.getByRole('checkbox', { name: /隐私/ }).click();
  await expect(group.getByRole('checkbox', { name: /隐私/ })).not.toBeChecked();
  await expect(page.locator('#review-preview #notice')).toHaveCount(0);
  await expect(page.locator('#review-preview [data-preview-alert]')).toHaveCount(0);
  await expect(page.locator('#review-preview')).not.toContainText('站点页面最多留下');
  expect(await shownIds()).toEqual(await keptIds());
  await expect(list).toHaveCount(1);
  await expect(list).toContainText('读书笔记');
  await expect(choice).not.toContainText('已在网站上');
  await expect(choice).not.toContainText('尚未上线');
  const reading = page.getByRole('button', { name: '拖动「读书笔记」调整顺序' });
  const contact = page.getByRole('button', { name: '拖动「联系」调整顺序' });
  await reading.dragTo(contact);
  const rows = list.locator('li[data-page-id]');
  await expect(rows).toHaveText([/关于/, /联系/, /读书笔记/, /隐私/, /Now/]);
  expect(await shownIds()).toEqual(await keptIds());
  await expect(rows).toHaveCount(5);
  const kept = rows.filter({ hasText: '关于' });
  expect(await kept.evaluate(node => ({
    drag: node.firstElementChild?.classList.contains('page-drag') ?? false,
    check: node.lastElementChild?.matches('input[type="checkbox"]') ?? false,
  }))).toEqual({ drag: true, check: true });
  for (const row of await rows.all()) {
    await expect(row).not.toHaveText(/^\s*[1-4]/);
    expect(await row.evaluate(node => getComputedStyle(node, '::after').content)).toBe('none');
  }
  await expect(choice.getByRole('button', { name: /在导航中隐藏|在导航中显示/ })).toHaveCount(0);
  await expect(choice.getByRole('link', { name: /在 Heptabase 打开/ })).toHaveCount(0);
  await expect(choice).not.toContainText('隐藏');
  await expect(choice).not.toContainText('打开');
  for (const row of await rows.all()) {
    expect((await row.boundingBox())!.height).toBeLessThan(44);
  }
  expect(await page.locator('#review-preview').evaluate(node => getComputedStyle(node).borderTopWidth)).toBe('0px');
  expect(await preview.evaluate(node => getComputedStyle(node).borderTopWidth)).toBe('1px');
  await expect(page.locator('#studio')).not.toContainText('已记下');
  await expect(page.locator('#studio')).not.toContainText('不进导航');
  expect(await shownIds()).toEqual(await keptIds());
  await expect(preview.locator('[data-page-id]')).toHaveCount(4);
  await page.getByRole('tab', { name: /New articles/ }).click();
  await page.getByRole('button', { name: '读书笔记', exact: true }).click();
  await expect(page.locator('#review-preview .review-meta')).toContainText('最多显示 4 页');
  await page.getByRole('button', { name: '通过「读书笔记」', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('article · 已通过，待发布')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '通过「读书笔记」', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('tab', { name: /Deleted articles · 3/ }).click();
  await expect(page.getByRole('tab', { name: /Deleted articles · 3/ })).toBeVisible();
  await expect(page.getByRole('button', { name: '隐私', exact: true })).toBeVisible();
});
