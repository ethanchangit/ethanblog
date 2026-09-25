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
      if (match) { clearTimeout(timer); resolve(match[0].replace(/\/?$/, '/')); }
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
  await expect(page.locator('.preview-title')).toHaveText('知识管理，先从连接开始');
  await expect(page.frameLocator('iframe[title="网站发布样式预览"]').locator('h1')).toHaveCount(0);
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

test('New References 用卡片列出新增引用，点击后弹窗显示全文', async ({ page }) => {
  await openLocal(page);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  const tab = page.getByRole('tab', { name: /New References · 1/ });
  await expect(tab).toBeVisible();
  await tab.click();
  await expect(page.locator('.review-items[data-review-group=new]')).toHaveCount(0);
  await expect(page.locator('#review-list .references-block')).toHaveCount(0);
  const card = page.getByRole('button', { name: '查看「原子笔记与连接」' });
  await expect(card).toBeVisible();
  await expect(card).toContainText('原子笔记与连接');
  await expect(card).toContainText('Reference');
  await card.click();
  const dialog = page.getByRole('dialog', { name: '原子笔记与连接' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('heading', { name: '原子笔记与连接' })).toBeVisible();
  await expect(dialog).toContainText('未填写 Summary');
  await expect(dialog).toContainText('没有标签');
  await expect(dialog.locator('.reference-popup-body')).toContainText('一张卡片只回答一个问题');
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('tab', { name: /New articles · 2/ }).click();
  await expect(page.locator('.review-items[data-review-group=new] .review-item')).toHaveCount(2);
  await expect(page.locator('.reference-card')).toHaveCount(0);
});

test('引用预览点遮罩关闭，点白卡片内部不关', async ({ page }) => {
  await openLocal(page);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await page.getByRole('tab', { name: /New References · 1/ }).click();
  await page.getByRole('button', { name: '查看「原子笔记与连接」' }).click();
  const dialog = page.getByRole('dialog', { name: '原子笔记与连接' });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('未填写 Summary');
  await dialog.getByRole('heading', { name: '原子笔记与连接' }).click();
  await dialog.locator('.reference-popup-body').click();
  await expect(dialog).toBeVisible();
  const box = await dialog.boundingBox();
  const viewport = page.viewportSize();
  expect(box).toBeTruthy();
  expect(viewport).toBeTruthy();
  expect(box!.width).toBeGreaterThan(viewport!.width * 0.6);
  expect(box!.x).toBeGreaterThan(48);
  expect(viewport!.width - (box!.x + box!.width)).toBeGreaterThan(48);
  expect(box!.height).toBeGreaterThan(480);
  expect(box!.y).toBeGreaterThan(24);
  expect(viewport!.height - (box!.y + box!.height)).toBeGreaterThan(24);
  await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height - 6);
  await expect(dialog).toBeVisible();
  await page.mouse.click(Math.max(4, box!.x - 24), box!.y + box!.height / 2);
  await expect(page.getByRole('dialog')).toHaveCount(0);
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
  await expect(page.getByRole('tab', { name: /New References · 1/ })).toBeVisible();
  await expect(page.getByText('这一版 ·')).toHaveCount(0);
  await page.getByRole('tab', { name: /New articles · 2/ }).click();
  await expect(page.locator('.review-items[data-review-group=new] .review-item')).toHaveCount(2);
  await expect(page.locator('#review-list .references-block')).toHaveCount(0);
  await expect(page.locator('#review-list')).not.toContainText('跟随资料');
  await page.getByRole('tab', { name: /Edited articles · 2/ }).click();
  await expect(page.locator('.review-items[data-review-group=edited] .review-item')).toHaveCount(2);
  const frame = page.frameLocator('iframe[title="网站发布样式预览"]');
  await expect(page.locator('.preview-title')).toHaveText('知识管理，先从连接开始');
  await expect(page.locator('.preview-date')).toContainText('2024 年 2 月 1 日');
  await expect(frame.locator('h1, time')).toHaveCount(0);
  await expect(frame.locator('.prose-site')).toContainText('只整理当下真正用得上的笔记');
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  await expect(page.locator('.diff-summary, .diff-basis, .diff-legend')).toHaveCount(0);
  await expect(page.locator('.diff-move-label, .paragraph-change.moved')).toHaveCount(0);
  await expect(page.getByText('原文 · 发布前')).toHaveCount(0);
  await expect(page.getByText('这一版 · 发布后')).toHaveCount(0);
  await expect(page.locator('.diff-original, .diff-revision, .diff-column-label, .diff-move-lines')).toHaveCount(0);
  await expect(page.locator('.full-diff article')).toHaveCount(1);
  await expect(page.locator('.full-diff article')).toHaveCSS('border-top-width', '0px');
  const modified = page.locator('.paragraph-change.modified').filter({ hasText: '过去，我会每周整理一次所有笔记' });
  await expect(modified.locator('.diff-removed')).toContainText('过去，我会每周整理一次所有笔记');
  await expect(modified.locator('.diff-added')).toContainText('现在，我会从正在写的文章出发');
  expect(await modified.evaluate(node => {
    const old = node.querySelector('.diff-removed')!.getBoundingClientRect();
    const next = node.querySelector('.diff-added')!.getBoundingClientRect();
    return Math.abs(old.top - next.top) < 2 && old.right <= next.left + 1;
  })).toBe(true);
  await expect(page.locator('.diff-removed ins, .diff-added del, .diff-change-label')).toHaveCount(0);
  await expect(page.locator('.full-diff')).not.toContainText('原有内容');
  await expect(page.locator('.full-diff')).not.toContainText('新内容');
  await expect(page.locator('.diff-removed[data-position="3"] table')).toBeVisible();
  await expect(page.locator('.diff-added[data-position="4"] table')).toBeVisible();
  expect(await page.locator('.diff-removed[data-position="3"]').evaluate(cell => {
    const table = cell.querySelector('table')!;
    const pad = parseFloat(getComputedStyle(cell).paddingLeft) + parseFloat(getComputedStyle(cell).paddingRight);
    return Math.abs(table.getBoundingClientRect().width - (cell.clientWidth - pad)) < 2;
  })).toBe(true);
  await expect(page.locator('.diff-move-path')).toHaveCount(0);
  await expect(page.locator('.full-diff details')).toHaveCount(0);
  await expect(page.locator('.full-diff .unchanged')).toHaveCount(1);
  await expect(page.locator('.full-diff article')).toContainText('知识管理并不是把更多资料放进一个地方');
  await expect(page.locator('.paragraph-change.unchanged').filter({ hasText: '现在，我会从正在写的文章出发' })).toHaveCount(0);
  await expect(page.locator('.modified .diff-removed', { hasText: '现在，我会从正在写的文章出发' })).toHaveCount(0);
  await expect(page.locator('.full-diff article')).toContainText('好的系统应该让写作更自然');
  await expect(modified.locator('.diff-removed del')).toContainText('过去，我会每周整理一次所有笔记');
  await expect(modified.locator('.diff-added ins')).toContainText('现在，我会从正在写的文章出发');
  await page.getByRole('button', { name: '让标签跟着想法生长', exact: true }).click();
  await expect(page.locator('#review-items .item-meta')).toHaveCount(0);
  await expect(page.getByText('article · 仅标签更新', { exact: true })).toHaveCount(0);
  await expect(page.locator('#review-preview .tag-added')).toHaveText('#Productivity');
  await expect(page.locator('#review-preview .tag-removed')).toHaveText('#AI Native');
  await expect(page.locator('.full-diff article')).toContainText('标签不是一次完成的分类');
  await expect(page.locator('.paragraph-change.unchanged').filter({ hasText: '标签不是一次完成的分类' })).toHaveCount(1);
  await expect(page.locator('.full-diff del, .full-diff ins')).toHaveCount(0);
  await expect(page.locator('.diff-move-lines')).toHaveCount(0);
  await expect(page.locator('#review-preview .tag-changes .meta-tags li')).toHaveText(['#Mission', '#Productivity', '#AI Native']);
  await expect(page.locator('#review-preview section.tag-changes, #review-preview details')).toHaveCount(0);
  await page.getByRole('button', { name: '发布预览', exact: true }).click();
  await expect(page.locator('#review-preview .tag-removed')).toBeVisible();
  await expect(frame.locator('.article-meta, .article-dek .ui-tag-link')).toHaveCount(0);
  await expect(page.locator('#review-preview .review-meta .meta-tags')).toContainText('#Mission');
  await expect(page.locator('#review-preview .review-meta .meta-tags')).toContainText('#Productivity');
  await page.getByRole('tab', { name: /New articles/ }).click();
  await page.getByRole('button', { name: '拒绝「一次还没想清楚的尝试」', exact: true }).click();
  const rejectDialog = page.getByRole('dialog');
  await expect(rejectDialog).toBeVisible();
  await expect(rejectDialog.getByRole('button', { name: '关闭', exact: true })).toBeVisible();
  await rejectDialog.getByRole('button', { name: '拒绝', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByText('article · 已拒绝，待发布')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '拒绝「一次还没想清楚的尝试」', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: '通过「一次还没想清楚的尝试」', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.getByRole('button', { name: '将笔记变成可以分享的文章', exact: true }).click();
  await page.getByRole('button', { name: '发布预览', exact: true }).click();
  await expect(page.locator('.preview-title')).toHaveText('将笔记变成可以分享的文章');
  await expect(frame.locator('h1')).toHaveCount(0);
  await expect(frame.locator('[data-doc-list] h3')).toHaveText('原子笔记与连接');
  await frame.getByRole('link', { name: /原子笔记与连接/ }).click();
  await expect(page.locator('.preview-title')).toHaveText('原子笔记与连接');
  await page.getByRole('button', { name: '通过「将笔记变成可以分享的文章」', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#review-preview #notice')).toHaveCount(0);
  await expect(page.getByText('article · 已通过，待发布')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '通过「将笔记变成可以分享的文章」', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByText('2 个页面已在本机通过', { exact: false })).toBeVisible();
  const before = await page.request.get(new URL('/dashboard/api/heptabase/cards', url).href);
  const beforeTitles = (await before.json()).cards.map((c: { title: string }) => c.title);
  expect(beforeTitles).toContain('将笔记变成可以分享的文章');
  expect(beforeTitles).toContain('一次还没想清楚的尝试');
  await page.getByRole('button', { name: '提交通过的更新到 GitHub' }).click();
  await expect(page.getByRole('button', { name: '确认发布', exact: true })).toBeVisible();
  const cards = await page.request.get(new URL('/dashboard/api/heptabase/cards', url).href);
  expect((await cards.json()).cards.map((c: { title: string }) => c.title)).toEqual(['知识管理，先从连接开始', '让标签跟着想法生长']);
  await page.getByRole('button', { name: '确认发布', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).not.toContainText('articles/example');
  await expect(dialog.locator('li')).toHaveCount(2);
  await expect(dialog.getByRole('button', { name: '关闭', exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: '确认发布到博客' })).toBeVisible();
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
  await expect(page.locator('.preview-title')).toBeVisible();
  await expect(page.frameLocator('iframe').locator('h1')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '退出', exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await page.reload();
  await expect(page.locator('input[type="password"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: '拉取最新更新', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('全文对比把换位段落显示成改写，并保留代码、列表和引用，两种主题及窄屏都可阅读', async ({ page }) => {
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
  const article = page.locator('.full-diff article');
  await expect(article.locator('.paragraph-change.unchanged').filter({ hasText: unchanged })).toHaveCount(1);
  await expect(article.locator('.modified .diff-removed ul li')).toHaveText(['旧项目', '保留项目']);
  await expect(article.locator('.modified del li')).toHaveText(['旧项目', '保留项目']);
  await expect(article.locator('.modified ins li')).toHaveText(['新项目', '保留项目']);
  await expect(page.locator('.diff-summary, .diff-basis, .diff-legend')).toHaveCount(0);
  await expect(article.locator('pre')).toHaveCount(2);
  await expect(article.locator('pre').first()).toContainText('<script>not executable</script>');
  await expect(page.locator('.full-diff script')).toHaveCount(0);
  await expect(article.locator('.moved, .diff-move-label')).toHaveCount(0);
  const departed = article.locator('.paragraph-change.modified').filter({ has: page.locator('.diff-removed', { hasText: '移动这一段。' }) });
  await expect(departed.locator('.diff-removed del')).toHaveText('移动这一段。');
  await expect(departed.locator('.diff-added')).toContainText('固定中间段落。');
  const arrived = article.locator('.paragraph-change.modified').filter({ has: page.locator('.diff-added', { hasText: '移动这一段。' }) });
  await expect(arrived.locator('.diff-added ins')).toHaveText('移动这一段。');
  const same = article.locator('.paragraph-change.unchanged').filter({ hasText: unchanged });
  await expect(same.locator('.diff-unchanged')).toHaveCount(2);
  await expect(same.locator('.diff-removed, .diff-added')).toHaveCount(0);
  expect(await same.evaluate(node => {
    const [left, right] = [...node.querySelectorAll('.diff-unchanged')].map(el => el.getBoundingClientRect());
    return Math.abs(left.top - right.top) < 2 && left.right <= right.left + 1 && left.width > 0 && right.width > 0;
  })).toBe(true);
  const inserted = article.locator('.paragraph-change.added').filter({ hasText: '外部资料' });
  await expect(inserted.locator('.diff-empty')).toHaveCount(1);
  await expect(inserted.locator('.diff-added')).toContainText('外部资料');
  expect(await inserted.evaluate(node => {
    const [left, right] = [...node.children];
    const old = left.getBoundingClientRect();
    const next = right.getBoundingClientRect();
    return left.classList.contains('diff-empty') && right.classList.contains('diff-added') && old.right <= next.left + 1;
  })).toBe(true);
  const external = article.getByRole('link', { name: '外部资料' });
  await expect(external).toHaveAttribute('href', 'https://example.com/review-private');
  await external.click(); await expect(page).toHaveURL(url);
  await expect(page.locator('#review-preview #notice')).toHaveCount(0);
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
      const boxes = [...document.querySelectorAll('.full-diff .paragraph-change')].map(node => node.getBoundingClientRect());
      const modified = document.querySelector('.paragraph-change.modified');
      const old = modified?.querySelector('.diff-removed')?.getBoundingClientRect();
      const next = modified?.querySelector('.diff-added')?.getBoundingClientRect();
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        oneColumn: boxes.length > 0 && boxes.every(box => Math.abs(box.left - boxes[0].left) < 2),
        stacked: boxes.every((box, index) => index === 0 || box.top >= boxes[index - 1].bottom - 1),
        sideBySide: Boolean(old && next && Math.abs(old.top - next.top) < 2 && old.right <= next.left + 1),
      };
    });
    expect(layout.overflow).toBe(false);
    expect(layout.oneColumn).toBe(true);
    expect(layout.stacked).toBe(true);
    expect(layout.sideBySide).toBe(true);
    await expect(page.locator('.diff-move-path, .diff-move-lines')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 1200, height: 900 });
  await expect(page.locator('.diff-move-path, .diff-move-lines, .diff-move-label')).toHaveCount(0);
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
  await expect(group.locator('.item-meta')).toHaveCount(0);
  await expect(group.getByText('已移出 #blog', { exact: true })).toHaveCount(0);
  await expect(group.getByText('Heptabase 卡片已删除', { exact: true })).toHaveCount(0);
  await expect(group.getByText('已确认删除，待发布', { exact: true })).toHaveCount(0);
  await expect(group.locator('.references-block')).toHaveCount(0);
  await expect(group).not.toContainText('跟随资料');
  await expect(group.getByRole('button', { name: '仅由旧笔记引用的资料', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '已经不再公开的旧笔记', exact: true }).click();
  await expect(page.locator('.preview-title')).toHaveText('已经不再公开的旧笔记');
  await expect(page.locator('.preview-date')).toBeVisible();
  await expect(page.frameLocator('iframe').locator('h1, time')).toHaveCount(0);
  await expect(page.locator('.removal-notice')).toHaveCount(0);
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  await expect(page.locator('.diff-removed [data-doc-list] h3')).toHaveText(['仅由旧笔记引用的资料']);
  const removedRow = page.locator('.paragraph-change.removed').filter({ has: page.locator('.diff-removed [data-doc-list]') });
  await expect(removedRow.locator('.diff-added')).toHaveCount(0);
  await expect(removedRow.locator('.diff-empty')).toHaveCount(1);
  expect(await removedRow.evaluate(node => {
    const [left, right] = [...node.children];
    return left.classList.contains('diff-removed') && right.classList.contains('diff-empty') && !right.textContent?.trim()
      && left.getBoundingClientRect().right <= right.getBoundingClientRect().left + 1;
  })).toBe(true);
  await expect(page.locator('.paragraph-change.added, .paragraph-change.modified, .diff-original, .diff-revision')).toHaveCount(0);
  await expect(page.locator('.full-diff')).toContainText('这一版将移除全文。');
  await page.getByRole('button', { name: '现有页面', exact: true }).click();
  await page.getByRole('button', { name: '暂不删除「已在 Heptabase 删除的文章」', exact: true }).click();
  await expect(group.locator('.item-meta')).toHaveCount(0);
  await expect(group.getByText('本次暂不删除', { exact: true })).toHaveCount(0);
  const remove = page.getByRole('button', { name: '删除「已经不再公开的旧笔记」', exact: true });
  const keep = page.getByRole('button', { name: '暂不删除「已经不再公开的旧笔记」', exact: true });
  await remove.click();
  await expect(group.getByText('已确认删除，待发布', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('#release')).toContainText('其中 2 个待删除');
  await expect(remove).toHaveAttribute('aria-pressed', 'true'); await expect(keep).toHaveAttribute('aria-pressed', 'false');
  await keep.click();
  await expect(page.locator('#release')).toContainText('还没有等待发布的更新');
  await expect(keep).toHaveAttribute('aria-pressed', 'true');
  await remove.click();
  await expect(page.locator('#release')).toContainText('其中 2 个待删除');
  await page.reload();
  const release = page.locator('#release');
  await expect(release).toContainText('还没有等待发布的更新');
  await expect(release.getByRole('button', { name: /取消删除/ })).toHaveCount(0);
  await expect(release.getByRole('button', { name: '直接发布', exact: true })).toBeVisible();
  await expect(release.getByRole('button', { name: '刷新发布状态', exact: true })).toBeVisible();
  await expect(release.getByRole('button', { name: '提交通过的更新到 GitHub', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: '拉取最新更新', exact: true }).click();
  await page.getByRole('tab', { name: /Deleted articles/ }).click();
  for (const title of ['已经不再公开的旧笔记', '已在 Heptabase 删除的文章']) {
    await page.getByRole('button', { name: `删除「${title}」`, exact: true }).click();
    await expect(page.getByRole('button', { name: `删除「${title}」`, exact: true })).toHaveAttribute('aria-pressed', 'true');
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
    await expect(page.getByRole('tab', { name: /Edited articles/ })).toBeVisible();
    await expect(page.locator('#review-preview .preview-title')).toBeVisible();
    await expect(page.locator('#review-preview')).not.toContainText('已拉取');
    await page.getByRole('tab', { name: /Edited articles/ }).click();
    await page.getByRole('button', { name: '让标签跟着想法生长', exact: true }).click();
  };
  await select();
  const changes = page.locator('#review-preview .tag-changes');
  await expect(changes.locator('.tag-removed')).toHaveText(['#Mission', '#AI Native']);
  await expect(changes).toContainText('更新后没有标签。');
  await expect(changes.locator('.tag-added')).toHaveCount(0);
  afterTags = ['AI Native', 'Mission', 'Mission']; await select();
  await expect(changes).toHaveCount(0);
  await expect(page.getByText('article · 仅标签更新', { exact: true })).toHaveCount(0);
  const special = '<img src=x onerror=alert(1)>', long = '很长的标签'.repeat(20);
  afterTags = [special, long]; await select();
  await expect(changes.locator('.tag-added')).toHaveText([`#${special}`, `#${long}`]);
  await expect(changes.locator('img')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('button', { name: '段落对比', exact: true }).click();
  await expect(changes.locator('.tag-removed')).toHaveCount(2);
  await expect(page.locator('.diff-summary, .diff-basis, .diff-legend')).toHaveCount(0);
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
