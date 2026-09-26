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

/** Local preview already pulls on open. Another click starts a second pull that rebuilds the list when it finishes. */
async function pullLatest(page: Page) {
  const button = page.getByRole('button', { name: '拉取最新更新', exact: true });
  await expect(button).toBeEnabled();
  const cards = page.waitForResponse(response => response.request().method() === 'GET' && new URL(response.url()).pathname.endsWith('/heptabase/cards'));
  await button.click();
  await cards;
  await expect(button).toBeEnabled({ timeout: 15_000 });
}

test('本地预览打开后就是审核界面，不用先拉取', async ({ page }) => {
  await openLocal(page);
  await expect(page.getByRole('tab', { name: /New articles · 2/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Edited articles · 5/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Deleted articles · 2/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Pages/ })).toBeVisible();
  await expect(page.locator('#release')).not.toContainText('请先拉取');
});

test('合并成功但发布响应超时时仍显示发布中', async ({ page }) => {
  await openLocal(page);
  await page.route('**/dashboard/api/git/publish', async route => {
    const response = await route.fetch();
    expect(response.status()).toBe(200);
    await route.fulfill({ status: 524, contentType: 'text/html', body: '<html>timeout</html>' });
  });
  await page.getByRole('button', { name: '直接发布', exact: true }).click();
  await expect(page.locator('#release [data-release-notice]')).toHaveText('发布中…');
  await expect(page.locator('#release [data-release-notice]')).not.toHaveAttribute('role', 'alert');
});

test('点击通过或拒绝后跳到下一条未审', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openLocal(page);
  await pullLatest(page);
  await expect(page.locator('#release')).toContainText('还有 9 条待审');
  const pressed = () => page.locator('#review-list .review-item[data-selected=true] > .card-select');
  const idle = () => expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeEnabled();
  await expect(pressed()).toHaveText('知识管理，先从连接开始'); await idle();
  await expect(page.locator('iframe.article-preview')).toBeVisible();
  const edges = await page.evaluate(() => {
    const box = (selector: string) => document.querySelector(selector)?.getBoundingClientRect();
    const frame = box('iframe.article-preview');
    if (!frame) return [];
    return ['.preview-heading', 'section.review-meta', 'p.preview-summary'].map(selector => {
      const node = box(selector);
      return node ? { selector, left: node.left - frame.left, right: node.right - frame.right, width: node.width } : { selector, missing: true };
    });
  });
  for (const edge of edges) {
    expect(edge, edge.selector).not.toHaveProperty('missing');
    expect(Math.abs(edge.left ?? 99)).toBeLessThan(1);
    expect(Math.abs(edge.right ?? 99)).toBeLessThan(1);
    expect(edge.width).toBeGreaterThan(700);
  }
  expect(await page.locator('#review-preview').evaluate(node => getComputedStyle(node).borderTopWidth)).toBe('0px');
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  await expect(page.locator('.full-diff')).toBeVisible(); await idle();
  await expect(page.locator('#release .muted')).not.toHaveText('');
  const reviewRequests = { decision: 0, preview: 0, git: 0 };
  page.on('request', request => {
    const path = new URL(request.url()).pathname;
    if (path.endsWith('/heptabase/decision') || path.endsWith('/heptabase/removal') || path.endsWith('/heptabase/removal-cancel')) reviewRequests.decision += 1;
    if (path.endsWith('/heptabase/preview')) reviewRequests.preview += 1;
    if (path.endsWith('/git') || path.endsWith('/docs')) reviewRequests.git += 1;
  });
  const detail = page.locator('#review-preview .detail-actions');
  await page.getByRole('button', { name: '通过「知识管理，先从连接开始」', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pressed()).toHaveText('痕迹'); await idle();
  await expect(page.getByRole('button', { name: '通过「知识管理，先从连接开始」', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '拒绝「知识管理，先从连接开始」', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.review-meta code').first()).toHaveText(/^\/[^/].*/);
  await expect(page.locator('.review-meta')).not.toContainText('ethanchang.io');
  await expect(page.locator('.review-meta')).not.toContainText('/articles/');
  await detail.getByRole('button', { name: '拒绝', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('textbox', { name: '备注' }).fill('标签还要再想想');
  await dialog.getByRole('button', { name: '拒绝', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#review-preview #notice')).toHaveCount(0);
  await expect(page.locator('#release')).toContainText('还有 7 条待审');
  await expect(pressed()).toHaveText('让标签跟着想法生长');
  await expect(page.locator('#release').getByRole('button', { name: '直接发布', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '拒绝「痕迹」', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '通过「痕迹」', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('.remark-field')).toHaveCount(0);
  await detail.getByRole('button', { name: '通过', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(pressed()).toHaveText('笔记');
  await expect(page.getByRole('button', { name: '通过「让标签跟着想法生长」', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '拒绝「让标签跟着想法生长」', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#review-preview #notice')).toHaveCount(0);
  expect(reviewRequests).toEqual({ decision: 0, preview: 0, git: 0 });
  expect(errors).toEqual([]);
});

test('审核列表只有标题，Shift 连选停在当前可见条目', async ({ page }) => {
  await openLocal(page);
  await pullLatest(page);
  await page.getByRole('tab', { name: /New articles/ }).click();
  const fresh = page.locator('#review-items');
  await expect(fresh.locator('.item-meta')).toHaveCount(0);
  await expect(fresh).not.toContainText('article ·');
  await expect(fresh).not.toContainText('标签：');
  const boxes = fresh.locator('> .review-item > .batch-pick');
  await expect(boxes).toHaveCount(2);
  const preview = page.locator('.preview-title');
  const before = await preview.innerText();
  await boxes.nth(0).click();
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).not.toBeChecked();
  await boxes.nth(1).click({ modifiers: ['Shift'] });
  await expect(boxes.nth(0)).toBeChecked();
  await expect(boxes.nth(1)).toBeChecked();
  await expect(preview).toHaveText(before);
  await page.getByRole('tab', { name: /Edited articles/ }).click();
  const edited = page.locator('#review-items');
  await expect(edited.locator('.item-meta')).toHaveCount(0);
  await expect(edited).not.toContainText('仅标签更新');
  await expect(edited).not.toContainText('已通过，待发布');
  const editedBoxes = edited.locator('> .review-item > .batch-pick');
  await expect(editedBoxes).toHaveCount(5);
  await expect(editedBoxes.nth(0)).not.toBeChecked();
  await expect(editedBoxes.nth(1)).not.toBeChecked();
  await editedBoxes.nth(1).click({ modifiers: ['Shift'] });
  await expect(editedBoxes.nth(0)).not.toBeChecked();
  await expect(editedBoxes.nth(1)).toBeChecked();
  await editedBoxes.nth(0).click({ modifiers: ['Shift'] });
  await expect(editedBoxes.nth(0)).toBeChecked();
  await expect(editedBoxes.nth(1)).toBeChecked();
  await page.getByRole('tab', { name: /Deleted articles/ }).click();
  const removed = page.locator('#review-items');
  await expect(removed.locator('.item-meta')).toHaveCount(0);
  await expect(removed.locator('> .review-item > .batch-pick').first()).not.toBeChecked();
  await page.getByRole('tab', { name: /New articles/ }).click();
  await expect(page.locator('#review-items > .review-item > .batch-pick')).toHaveCount(2);
  await expect(page.locator('#review-items > .review-item > .batch-pick').nth(0)).toBeChecked();
  await expect(page.locator('#review-items > .review-item > .batch-pick').nth(1)).toBeChecked();
});

test('宽屏左右分栏、两栏各自滚动，窄屏上下堆叠', async ({ page }) => {
  await openLocal(page);
  await pullLatest(page);
  await expect(page.locator('#review-list .review-item').first()).toBeVisible();
  const layout = () => page.evaluate(() => {
    const list = document.querySelector('.review-sidebar')!.getBoundingClientRect(), detail = document.querySelector('#review-preview')!.getBoundingClientRect();
    return { side: detail.left >= list.right, stacked: detail.top >= list.bottom, scroll: getComputedStyle(document.querySelector('.review-sidebar')!).overflowY, page: document.documentElement.scrollHeight <= innerHeight, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  expect(await layout()).toMatchObject({ side: true, scroll: 'auto', page: true, overflow: false });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await layout()).toMatchObject({ stacked: true, scroll: 'visible', overflow: false });
});

test('拉取后点直接发布会送出计划，发布栏不会保持沉默', async ({ page }) => {
  await openLocal(page);
  await pullLatest(page);
  const commit = page.waitForRequest(request => request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/git/commit'));
  await page.getByRole('button', { name: '直接发布', exact: true }).click();
  await commit;
  const notice = page.locator('#release [data-release-notice]');
  await expect(page.getByRole('button', { name: '直接发布', exact: true })).toBeEnabled();
  await expect(notice).toBeVisible();
  await expect(notice).not.toHaveText('');
  await expect(notice).not.toHaveText('正在直接发布…');
});
