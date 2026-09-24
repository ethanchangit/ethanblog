import { test, expect, type Page } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';

let process: ChildProcess, url: string;
test.beforeAll(async () => {
  process = spawn(globalThis.process.execPath, ['studio/online/preview.mjs'], {
    env: { ...globalThis.process.env, STUDIO_PREVIEW_PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  url = await new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error('Dashboard simulator did not start')), 15000);
    process.once('error', reject); process.once('exit', code => reject(new Error(`Dashboard simulator exited: ${code}`)));
    process.stdout!.on('data', data => {
      output += data.toString(); const match = output.match(/http:\/\/localhost:\d+\/dashboard/);
      if (match) { clearTimeout(timer); resolve(match[0]); }
    });
  });
});
test.afterAll(() => { process?.kill('SIGTERM'); });

async function openLocal(page: Page) {
  await page.goto(url);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByLabel('后台密码')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Audit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeVisible();
}

test('键盘逐条审核：J/K 移动，A/R 决定后自动跳到下一条未审，进度随之更新', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openLocal(page);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.locator('.progress-count')).toHaveText('已审 0 / 6');
  await expect(page.locator('#release')).toContainText('还有 6 条待审');
  const pressed = () => page.locator('#review-list .review-item[data-selected=true] > .card-select');
  const idle = () => expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeEnabled();
  await expect(pressed()).toHaveText('知识管理，先从连接开始'); await idle();
  await page.keyboard.press('j');
  await expect(pressed()).toHaveText('让标签跟着想法生长'); await idle();
  await page.keyboard.press('k');
  await page.keyboard.press('k');
  await expect(page.getByRole('tab', { name: /New articles/ })).toHaveAttribute('aria-selected', 'true');
  await expect(pressed()).toHaveText('一次还没想清楚的尝试'); await idle();
  await page.keyboard.press('j');
  await expect(page.getByRole('tab', { name: /Edited articles/ })).toHaveAttribute('aria-selected', 'true');
  await expect(pressed()).toHaveText('知识管理，先从连接开始'); await idle();
  await expect(pressed()).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await expect(pressed()).toHaveText('让标签跟着想法生长'); await idle();
  await expect(pressed()).toBeFocused();
  await page.keyboard.press('ArrowUp');
  await expect(pressed()).toHaveText('知识管理，先从连接开始'); await idle();
  await page.keyboard.press('d');
  await expect(page.locator('.diff-summary')).toBeVisible(); await idle();
  await page.keyboard.press('a');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('checkbox')).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pressed()).toHaveText('让标签跟着想法生长'); await idle();
  await expect(page.locator('.review-item[data-decision=approve] .item-state')).toHaveText('通过');
  await expect(page.locator('.progress-count')).toHaveText('已审 1 / 6');
  await page.keyboard.press('r');
  await expect(page.getByRole('button', { name: '确认拒绝并回写' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#notice')).toContainText('Edited articles 已全部审完');
  await expect(page.locator('.progress-count')).toHaveText('已审 2 / 6');
  await expect(page.locator('#release')).toContainText('还有 4 条待审');
  await expect(page.locator('#review-preview .detail-actions .item-state')).toHaveText('已拒绝，已回写 Block');
  expect(errors).toEqual([]);
});

test('宽屏左右分栏、清单独立滚动，窄屏上下堆叠', async ({ page }) => {
  await openLocal(page);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.locator('#review-list .review-item').first()).toBeVisible();
  const layout = () => page.evaluate(() => {
    const list = document.querySelector('.review-sidebar')!.getBoundingClientRect(), detail = document.querySelector('#review-preview')!.getBoundingClientRect();
    return { side: detail.left >= list.right, stacked: detail.top >= list.bottom, sticky: getComputedStyle(document.querySelector('.review-sidebar')!).position, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await layout()).toMatchObject({ side: true, sticky: 'sticky', overflow: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await layout()).toMatchObject({ stacked: true, sticky: 'static', overflow: false });
});
