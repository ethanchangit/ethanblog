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

test('预览收到网页错误后显示可读原因，并能重新拉取恢复', async ({ page }) => {
  await openLocal(page);
  await page.route('**/dashboard/api/heptabase/preview', route => route.fulfill({
    status: 502, contentType: 'text/html', body: '<!DOCTYPE html><html>private diagnostic details</html>',
  }));
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.locator('#review-preview')).toHaveText('后台暂时无法完成请求（502），请稍后重新拉取。');
  await expect(page.locator('[data-review-group=new] .decisions button, [data-review-group=edited] .decisions button')).toHaveCount(0);
  await expect(page.locator('#studio')).not.toContainText('Unexpected token');
  await expect(page.locator('#studio')).not.toContainText('private diagnostic details');
  await page.unroute('**/dashboard/api/heptabase/preview');
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.frameLocator('iframe[title="网站发布样式预览"]').locator('h1')).toHaveText('知识管理，先从连接开始');
});

test('本地拉取被拒绝时不出现密码框', async ({ page }) => {
  await openLocal(page);
  await page.route('**/dashboard/api/heptabase/preview', route => route.fulfill({ status: 401, contentType: 'text/html', body: '<!DOCTYPE html><html>Login required</html>' }));
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByLabel('后台密码')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('本地后台请求被拒绝，请刷新后重试。');
});

test('Review 清单、真实排版、段落对比、单篇拒绝与通过、回写和发布完整流程', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await openLocal(page);
  await expect(page.locator('textarea, [contenteditable=true]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '浏览统计' })).toHaveCount(0);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.getByRole('tab', { name: /New articles · 2/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Edited articles · 2/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Deleted articles · 2/ })).toBeVisible();
  await expect(page.getByText('这一版 ·')).toHaveCount(0);
  await page.getByRole('tab', { name: /New articles · 2/ }).click();
  await expect(page.locator('.review-items[data-review-group=new] .review-item')).toHaveCount(2);
  await expect(page.locator('.review-items[data-review-group=new] .references li')).toHaveCount(1);
  await expect(page.locator('.references .decisions')).toHaveCount(0);
  await page.getByRole('tab', { name: /Edited articles · 2/ }).click();
  await expect(page.locator('.review-items[data-review-group=edited] .review-item')).toHaveCount(2);
  const frame = page.frameLocator('iframe[title="网站发布样式预览"]');
  await expect(frame.locator('h1')).toHaveText('知识管理，先从连接开始');
  await expect(frame.locator('.prose-site')).toContainText('只整理当下真正用得上的笔记');
  await expect(frame.locator('time')).toContainText('2024 年 2 月 1 日');
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  await expect(page.locator('.diff-summary')).toHaveText('新增 2 段 · 改写 1 段 · 删除 0 段 · 移动 1 段');
  await expect(page.locator('.diff-original .modified')).toContainText('过去，我会每周整理一次所有笔记');
  await expect(page.locator('.diff-revision .modified')).toContainText('现在，我会从正在写的文章出发');
  await expect(page.locator('.diff-original ins, .diff-revision del, .diff-change-label')).toHaveCount(0);
  await expect(page.locator('.full-diff')).not.toContainText('原有内容');
  await expect(page.locator('.full-diff')).not.toContainText('新内容');
  await expect(page.locator('.diff-original [data-position="3"] table')).toBeVisible();
  await expect(page.locator('.diff-revision [data-position="4"] table')).toBeVisible();
  await expect(page.locator('.diff-move-path[data-move="3-4"]')).toHaveCount(1);
  await expect(page.locator('.full-diff details')).toHaveCount(0);
  await expect(page.locator('.diff-original-body')).toContainText('知识管理并不是把更多资料放进一个地方');
  await expect(page.locator('.diff-original-body')).toContainText('过去，我会每周整理一次所有笔记');
  await expect(page.locator('.diff-original-body')).not.toContainText('现在，我会从正在写的文章出发');
  await expect(page.locator('.diff-revision .unchanged')).toHaveCount(2);
  await expect(page.locator('.diff-revision')).toContainText('好的系统应该让写作更自然');
  await expect(page.locator('.modified .diff-removed del')).toContainText('过去，我会每周整理一次所有笔记');
  await expect(page.locator('.modified .diff-added ins')).toContainText('现在，我会从正在写的文章出发');
  await expect(page.locator('.diff-basis')).toContainText('未提供段落 ID');
  await page.getByRole('button', { name: '让标签跟着想法生长', exact: true }).click();
  await expect(page.getByText('article · 仅标签更新', { exact: true })).toBeVisible();
  await expect(page.locator('#review-preview .tag-added')).toHaveText('+ Productivity');
  await expect(page.locator('#review-preview .tag-removed')).toHaveText('− AI Native');
  await expect(page.locator('.diff-summary')).toHaveText('正文未修改，本次只更新标签。');
  await expect(page.locator('.diff-original-body')).toContainText('标签不是一次完成的分类');
  await expect(page.locator('.diff-revision')).toContainText('标签不是一次完成的分类');
  await expect(page.locator('.full-diff del, .full-diff ins')).toHaveCount(0);
  await expect(page.locator('.diff-move-lines')).toHaveCount(0);
  await expect(page.locator('#review-preview .tag-changes details')).not.toHaveAttribute('open');
  await page.getByText('保留 1 个标签', { exact: true }).click();
  await expect(page.locator('#review-preview .tag-changes details li')).toHaveText('Mission');
  await page.getByRole('button', { name: '发布预览', exact: true }).click();
  await expect(page.locator('#review-preview .tag-removed')).toBeVisible();
  await expect(frame.locator('.article-dek .ui-tag-link')).toHaveText(['Mission', 'Productivity']);
  await page.getByRole('button', { name: '通过「让标签跟着想法生长」', exact: true }).click();
  await expect(page.getByRole('dialog').locator('.tag-added')).toHaveText('+ Productivity');
  await expect(page.getByRole('dialog').locator('.tag-removed')).toHaveText('− AI Native');
  await page.getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('tab', { name: /New articles/ }).click();
  await page.getByRole('button', { name: '拒绝「一次还没想清楚的尝试」', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('不修改发布日期');
  await page.getByRole('button', { name: '确认拒绝并回写' }).click();
  await expect(page.getByText('article · 已拒绝，已回写 Block')).toBeVisible();
  await page.getByRole('button', { name: '将笔记变成可以分享的文章', exact: true }).click();
  await page.getByRole('button', { name: '发布预览', exact: true }).click();
  await expect(frame.locator('h1')).toHaveText('将笔记变成可以分享的文章');
  await expect(frame.locator('[data-doc-list] h3')).toHaveText('原子笔记与连接');
  await frame.getByRole('link', { name: /原子笔记与连接/ }).click();
  await expect(frame.locator('h1')).toHaveText('原子笔记与连接');
  await page.getByRole('button', { name: '通过「将笔记变成可以分享的文章」', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await page.getByRole('button', { name: '确认通过并回写' }).click();
  await expect(dialog.getByRole('alert')).toHaveText('请先确认这篇博客和所有引用都可以公开。');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '确认通过并回写' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Reference');
  await page.getByRole('button', { name: '标记引用资料为 Reference' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '通过「将笔记变成可以分享的文章」', exact: true }).click();
  dialog = page.getByRole('dialog');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: '确认通过并回写' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('article · 已通过，待发布')).toBeVisible();
  await expect(page.getByText('2 个页面已准备好。', { exact: false })).toBeVisible();
  const cards = await page.request.get(new URL('/dashboard/api/heptabase/cards', url).href);
  expect((await cards.json()).cards.map((c: { title: string }) => c.title)).toEqual(['知识管理，先从连接开始', '让标签跟着想法生长']);
  await page.reload();
  await expect(page.getByText('2 个页面已准备好。', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: '提交通过的更新到 GitHub' }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  dialog = page.getByRole('dialog');
  await expect(dialog).not.toContainText('articles/example');
  await expect(dialog.locator('li')).toHaveCount(2);
  await page.getByRole('button', { name: '确认发布到博客' }).click();
  await expect(page.getByText('最近一次发布：正在确认线上版本')).toBeVisible();
  await request.post(new URL('/__test/deploy', url).href);
  await page.getByRole('button', { name: '刷新发布状态' }).click();
  await expect(page.getByText('最近一次发布：已上线', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.getByRole('tab', { name: /New articles · 0/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Edited articles · 2/ })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.frameLocator('iframe').locator('h1')).toBeVisible();
  await expect(page.getByRole('button', { name: '退出', exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

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

test('全文对比保留移动段落、代码、列表和引用，两种主题及窄屏都可阅读', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const unchanged = '没有改动的结尾段落，完整显示。';
  const code = '```js\nconst label = "<script>not executable</script>";\n' + 'x'.repeat(150) + '\n```';
  const before = ['第一段保持原样。', '移动这一段。', '固定中间段落。', '- 旧项目\n- 保留项目', code, unchanged].join('\n\n');
  const after = ['第一段保持原样。', '固定中间段落。', '- 新项目\n- 保留项目', code, '移动这一段。', unchanged, '[外部资料][ref]\n\n[ref]: https://example.com/review-private'].join('\n\n');
  await page.route('**/dashboard/api/heptabase/preview', async route => {
    const response = await route.fetch(), plan = await response.json();
    if (plan.id === '6353c916-e0a9-4a0d-aa07-7a3512b72e92') {
      plan.changes[0].beforeContent = before; plan.changes[0].afterContent = after;
    }
    await route.fulfill({ response, json: plan });
  });
  await openLocal(page);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  const original = page.locator('.diff-original'), revision = page.locator('.diff-revision');
  await expect(original).toContainText(unchanged); await expect(revision).toContainText(unchanged);
  await expect(original.locator('ul li')).toHaveText(['旧项目', '保留项目']);
  await expect(original.locator('.modified del li')).toHaveText(['旧项目', '保留项目']);
  await expect(revision.locator('.modified ins li')).toHaveText(['新项目', '保留项目']);
  await expect(original.locator('pre')).toContainText('<script>not executable</script>');
  await expect(revision.locator('pre')).toContainText('<script>not executable</script>');
  await expect(page.locator('.full-diff script')).toHaveCount(0);
  await expect(original.locator('.moved')).toHaveCount(1);
  await expect(revision.locator('.moved')).toHaveCount(1);
  await expect(original.locator('.moved del')).toHaveText('移动这一段。');
  await expect(revision.locator('.moved ins')).toHaveText('移动这一段。');
  await expect(original.locator('.moved .diff-move-label')).toContainText('移至');
  await expect(revision.locator('.moved .diff-move-label')).toContainText('移入');
  const external = revision.getByRole('link', { name: '外部资料' });
  await expect(external).toHaveAttribute('href', 'https://example.com/review-private');
  await external.click(); await expect(page).toHaveURL(url);
  await expect(page.locator('#notice')).toContainText('外部链接不会打开');
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: '切换明暗' }).click();
    const colors = await page.evaluate(() => {
      const read = (selector: string) => { const s = getComputedStyle(document.querySelector(selector)!); return { color: s.color, background: s.backgroundColor, decoration: s.textDecorationLine }; };
      return { old: read('.diff-removed'), next: read('.diff-added'), del: read('.full-diff del'), ins: read('.full-diff ins') };
    });
    expect(colors.old.background).not.toBe(colors.next.background);
    expect(colors.old.color).not.toBe(colors.next.color);
    expect(colors.del.decoration).toContain('line-through'); expect(colors.ins.decoration).toBe('none');
  }
  for (const width of [1440, 1200, 900, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const layout = await page.evaluate(() => {
      const old = document.querySelector('.diff-original')!.getBoundingClientRect(), next = document.querySelector('.diff-revision')!.getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, oldX: old.x, nextX: next.x, oldBottom: old.bottom, nextTop: next.top };
    });
    expect(layout.overflow).toBe(false);
    if (width > 640) expect(layout.nextX).toBeGreaterThan(layout.oldX);
    else expect(layout.nextTop).toBeGreaterThan(layout.oldBottom);
    if (width > 640) {
      // Wait for resize/font layout before checking the actual SVG endpoints.
      await expect.poll(() => page.evaluate(() => {
        const svg = document.querySelector('.diff-move-lines')!.getBoundingClientRect();
        const old = document.querySelector('.diff-original .moved')!.getBoundingClientRect();
        const next = document.querySelector('.diff-revision .moved')!.getBoundingClientRect();
        const path = document.querySelector<SVGPathElement>('.diff-move-path');
        if (!path) return Infinity;
        const start = path.getPointAtLength(0), end = path.getPointAtLength(path.getTotalLength());
        return Math.max(Math.abs(start.x + svg.left - old.right), Math.abs(start.y + svg.top - old.top - old.height / 2),
          Math.abs(end.x + svg.left - next.left), Math.abs(end.y + svg.top - next.top - next.height / 2));
      })).toBeLessThan(1);
    } else {
      await expect(page.locator('.diff-move-path')).toHaveCount(0);
      await original.getByRole('button', { name: '查看移入后的第 5 段' }).click();
      await expect(revision.getByRole('button', { name: '查看原来的第 2 段' })).toBeFocused();
    }
  }
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('.diff-move-path')).toHaveCount(1);
  await page.getByRole('button', { name: '发布预览', exact: true }).click();
  await expect(page.locator('.diff-move-lines')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('删除清单可预览、暂缓、确认、取消，并通过发布移除文章及独占资料', async ({ page, request }) => {
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  await openLocal(page);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await page.getByRole('tab', { name: /Deleted articles · 2/ }).click();
  const group = page.locator('.review-items[data-review-group=removed]');
  await expect(page.getByRole('tab', { name: /Deleted articles · 2/ })).toBeVisible();
  await expect(page.getByText('已移出 #blog 或已删除，确认后从网站撤下')).toHaveCount(0);
  await expect(page.getByText('新卡片与首次发布的文章')).toHaveCount(0);
  await expect(page.getByText('已有文章的修改与重新发布')).toHaveCount(0);
  await expect(group).toContainText('Heptabase 卡片已删除');
  await expect(group.getByRole('button', { name: '仅由旧笔记引用的资料', exact: true })).toHaveCount(1);
  await expect(group.locator('.references .decisions')).toHaveCount(0);
  await page.getByRole('button', { name: '已经不再公开的旧笔记', exact: true }).click();
  await expect(page.frameLocator('iframe').locator('h1')).toHaveText('已经不再公开的旧笔记');
  await expect(page.locator('.removal-notice')).toContainText('不是准备重新发布的版本');
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  await expect(page.locator('.diff-original [data-doc-list] h3')).toHaveText(['仅由旧笔记引用的资料']);
  await expect(page.locator('.diff-revision .paragraph-change')).toHaveCount(0);
  await expect(page.locator('.diff-revision')).toContainText('这一版将移除全文。');
  await page.getByRole('button', { name: '现有页面', exact: true }).click();
  await page.getByRole('button', { name: '暂不删除「已在 Heptabase 删除的文章」', exact: true }).click();
  await expect(group.getByText('本次暂不删除', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '删除「已经不再公开的旧笔记」', exact: true }).click();
  await expect(page.getByRole('dialog').locator('li')).toHaveText(['article · 已经不再公开的旧笔记', 'page · 仅由旧笔记引用的资料']);
  await page.getByRole('button', { name: '确认加入待删除' }).click();
  await expect(page.getByRole('dialog').getByRole('alert')).toHaveText('请先确认要删除的页面。');
  await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '确认加入待删除' }).click();
  await expect(page.locator('#release')).toContainText('其中 2 个待删除');
  await page.reload();
  await page.getByRole('button', { name: '取消删除「已经不再公开的旧笔记」', exact: true }).click();
  await expect(page.locator('#release')).toContainText('还没有等待发布的更新');
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await page.getByRole('tab', { name: /Deleted articles/ }).click();
  for (const title of ['已经不再公开的旧笔记', '已在 Heptabase 删除的文章']) {
    await page.getByRole('button', { name: `删除「${title}」`, exact: true }).click();
    await page.getByRole('checkbox').check(); await page.getByRole('button', { name: '确认加入待删除' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
  await expect(page.locator('#release')).toContainText('其中 3 个待删除');
  await page.getByRole('button', { name: '提交通过的更新到 GitHub' }).click();
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  const entries = page.getByRole('dialog').locator('li');
  await expect(entries).toHaveCount(4); await expect(entries.filter({ hasText: /^删除 ·/ })).toHaveCount(3);
  await expect(page.getByRole('dialog')).toContainText('更新 · pages/blogs');
  await page.getByRole('button', { name: '确认发布到博客' }).click();
  await expect(page.getByText('最近一次发布：正在确认线上版本')).toBeVisible();
  await request.post(new URL('/__test/deploy', url).href);
  await page.getByRole('button', { name: '刷新发布状态' }).click();
  await expect(page.getByText('最近一次发布：已上线', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.getByRole('tab', { name: /Deleted articles · 0/ })).toBeVisible();
  await page.getByRole('tab', { name: /Deleted articles · 0/ }).click();
  await expect(page.getByText('这一组没有待审文章。')).toBeVisible();
  const result = await page.request.get(new URL('/dashboard/api/docs', url).href);
  expect((await result.json()).articles.map((article: { title: string }) => article.title)).not.toContain('已经不再公开的旧笔记');
  expect(errors).toEqual([]);
});

test('标签全部移除、仅排序和重复、长标签与特殊字符都能清楚安全地审查', async ({ page }) => {
  await openLocal(page);
  let afterTags: string[] = [];
  await page.route('**/dashboard/api/heptabase/preview', async route => {
    const response = await route.fetch(), plan = await response.json();
    const card = plan.changes.find((c: { id: string }) => c.id === '6b6309a2-43a9-4c85-9b4f-037dcb0f898b');
    if (card) card.afterProperties.tags = afterTags;
    await route.fulfill({ response, json: plan });
  });
  const select = async () => {
    await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
    await expect(page.locator('#notice')).toContainText('已拉取 4 篇');
    await page.getByRole('tab', { name: /Edited articles/ }).click();
    await page.getByRole('button', { name: '让标签跟着想法生长', exact: true }).click();
  };
  await select();
  const changes = page.locator('#review-preview .tag-changes');
  await expect(changes.locator('.tag-removed')).toHaveText(['− Mission', '− AI Native']);
  await expect(changes).toContainText('更新后没有标签。');
  await expect(changes.locator('.tag-added')).toHaveCount(0);
  afterTags = ['AI Native', 'Mission', 'Mission']; await select();
  await expect(changes).toHaveCount(0);
  await expect(page.getByText('article · 仅标签更新', { exact: true })).toHaveCount(0);
  const special = '<img src=x onerror=alert(1)>', long = '很长的标签'.repeat(20);
  afterTags = [special, long]; await select();
  await expect(changes.locator('.tag-added')).toHaveText([`+ ${special}`, `+ ${long}`]);
  await expect(changes.locator('img')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  await expect(changes.locator('.tag-removed')).toHaveCount(2);
  await expect(page.locator('.diff-summary')).toHaveText('正文未修改，本次只更新标签。');
});

test('生产后台仍要密码', async ({ page }) => {
  const port = new URL(url).port;
  await page.goto(`http://dashboard.test:${port}/dashboard`);
  const password = page.getByLabel('后台密码');
  await expect(password).toBeVisible();
  await password.fill('wrong-password-long');
  await page.getByRole('button', { name: '进入发布后台' }).click();
  await expect(page.getByRole('alert')).toHaveText('密码不正确。');
  await password.fill('local-test-only-password');
  await page.getByRole('button', { name: '进入发布后台' }).click();
  await expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await expect(page.getByLabel('后台密码')).toBeVisible();
  await page.getByLabel('后台密码').fill('local-test-only-password');
  await page.getByRole('button', { name: '进入发布后台' }).click();
  await page.route('**/dashboard/api/heptabase/preview', route => route.fulfill({ status: 401, contentType: 'text/html', body: '<!DOCTYPE html><html>Login required</html>' }));
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await expect(page.getByLabel('后台密码')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveText('登录已过期，请重新输入后台密码。');
});
