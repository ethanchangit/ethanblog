import { test, expect, type Locator, type Page } from '@playwright/test';

async function ready(page: Page) {
  await page.goto('/lab', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('[data-mention-preview-ready]')).toBeAttached();
  const section = page.getByTestId('mention-preview');
  await section.scrollIntoViewIfNeeded();
  return section;
}

function articleLink(section: Locator) {
  return section.locator('a[data-doc-mention][href="/pkm-method"]');
}

test.describe('mention 悬停预览', () => {
  test('悬停约 300ms 后显示标题、摘要和正文开头，鼠标能进入，移出后关闭', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 1100 });
    const section = await ready(page);
    const link = articleLink(section);
    const preview = page.locator('[data-mention-preview]');

    await expect(preview).toBeHidden();
    await link.evaluate((el) => el.scrollIntoView({ block: 'start', inline: 'nearest' }));
    await link.hover();
    await expect(preview).toBeHidden();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('我的 PKM 实践');
    await expect(preview).toContainText('分享我在 Obsidian');
    await expect(preview).toContainText('在信息爆炸的时代');
    await expect(preview).not.toContainText('未填写');
    const visible = await preview.innerText();
    expect(visible).not.toContain('2026 年 3 月');

    const box = await preview.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.width).toBeLessThanOrEqual(328);
    expect(box!.height / box!.width).toBeCloseTo(159 / 206, 2);
    const voice = await preview.evaluate((el) => {
      const summary = el.querySelector('.article-dek-text');
      const proseP = el.querySelector('.prose-site p');
      if (!(summary instanceof HTMLElement) || !(proseP instanceof HTMLElement)) return null;
      const s = getComputedStyle(summary);
      const p = getComputedStyle(proseP);
      return {
        summaryWeight: Number(s.fontWeight),
        proseWeight: Number(p.fontWeight),
        summarySize: parseFloat(s.fontSize),
        proseSize: parseFloat(p.fontSize),
        summaryLine: parseFloat(s.lineHeight),
        proseLine: parseFloat(p.lineHeight),
        summaryColor: s.color,
        proseColor: p.color,
        gap: proseP.getBoundingClientRect().top - summary.getBoundingClientRect().bottom,
        overflow: getComputedStyle(el).overflowY,
      };
    });
    expect(voice).not.toBeNull();
    expect(voice!.summaryWeight).toBeGreaterThan(voice!.proseWeight);
    expect(voice!.summaryLine / voice!.summarySize).toBeCloseTo(1.5, 1);
    expect(voice!.proseLine / voice!.proseSize).toBeCloseTo(1.5, 1);
    expect(voice!.summaryLine / voice!.summarySize - voice!.proseLine / voice!.proseSize).toBeLessThan(0.15);
    expect(voice!.gap).toBeGreaterThan(0);
    expect(voice!.gap).toBeLessThan(voice!.proseLine * 0.6);
    expect(voice!.summaryColor).not.toBe(voice!.proseColor);
    expect(voice!.overflow).toBe('hidden');
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(1101);

    const linkBox = await link.boundingBox();
    expect(linkBox).toBeTruthy();
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('a')?.getAttribute('href') ?? '';
    }, { x: linkBox!.x + linkBox!.width / 2, y: linkBox!.y + linkBox!.height / 2 });
    expect(hit).toBe('/pkm-method');

    await page.mouse.move(box!.x + 16, box!.y + 16);
    await page.waitForTimeout(450);
    await expect(preview).toBeVisible();

    await page.getByRole('heading', { name: '组件试验场' }).hover();
    await expect(preview).toBeHidden();
  });

  test('项目和 reference 用自己的类型，普通站内链接也预览，外站只显示地址，未知卡片不预览', async ({ page }) => {
    const section = await ready(page);
    const preview = page.locator('[data-mention-preview]');

    await section.locator('a[data-doc-mention][href="/aletheia"]').hover();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Aletheia');
    await expect(preview).toContainText('英文阅读时的语境查词');
    await expect(preview).toContainText('照亮');

    await section.locator('a[data-doc-mention][href="/bitwarden"]').hover();
    await expect(preview).toContainText('Bitwarden');
    await expect(preview).toContainText('Free Password Manager');
    await expect(preview).toContainText('支持全端同步');
    const metaText = await preview.locator('.mention-preview-meta').evaluate((el) => el.textContent ?? '');
    expect(metaText).toContain('资料');

    await page.getByRole('heading', { name: '组件试验场' }).hover();
    await expect(preview).toBeHidden();

    const plain = section.getByTestId('mention-preview-plain');
    await expect(plain).not.toHaveAttribute('data-doc-mention');
    await plain.hover();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('我的 PKM 实践');

    await page.getByRole('heading', { name: '组件试验场' }).hover();
    await expect(preview).toBeHidden();

    const external = section.getByTestId('mention-preview-external');
    const externalHref = await external.evaluate((el) => (el as HTMLAnchorElement).href);
    const externalTarget = await external.getAttribute('target');
    await external.hover();
    await expect(preview).toBeVisible();
    await expect(preview.locator('.mention-preview-title')).toHaveText('示例');
    await expect(preview.locator('.mention-preview-url')).toHaveText(externalHref);
    await expect(preview.locator('.mention-preview-summary, .mention-preview-body, .mention-preview-meta')).toHaveCount(0);
    await expect(preview).not.toContainText('未填写');
    expect(await external.getAttribute('target')).toBe(externalTarget);

    await page.getByRole('heading', { name: '组件试验场' }).hover();
    await expect(preview).toBeHidden();

    await section.getByTestId('mention-preview-missing').hover();
    await page.waitForTimeout(450);
    await expect(preview).toBeHidden();
  });

  test('正文里没有 data-doc-mention 的站内链接悬停出预览，点击仍进入该页', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/chunk', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mention-preview-ready]')).toBeAttached();
    const link = page.locator('[data-reading-doc] .prose-site a[href="/pkm-method"]', { hasText: 'PKM 实践' });
    await expect(link).toHaveCount(1);
    await expect(link).not.toHaveAttribute('data-doc-mention');
    const preview = page.locator('[data-mention-preview]');
    await link.hover();
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('我的 PKM 实践');
    await expect(preview).toContainText('分享我在 Obsidian');
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await link.click();
    await expect(page).toHaveURL(/\/pkm-method\/?$/);
    await expect(page.getByRole('heading', { level: 1, name: '我的 PKM 实践：从笔记到知识网络' })).toBeVisible();
  });

  test('右侧目录的标题和章节悬停不预览，点击标题仍回到页顶', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/my-toolset', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mention-preview-ready]')).toBeAttached();
    const preview = page.locator('[data-mention-preview]');
    const toc = page.locator('nav.toc');
    const title = toc.locator('a[data-toc-title]');
    await expect(title).toHaveText('My Toolset');
    await expect(title).toHaveAttribute('href', '#doc-title');

    await title.hover();
    await page.waitForTimeout(450);
    await expect(preview).toBeHidden();

    const section = toc.locator('a[data-depth="2"]').first();
    await expect(section).toBeVisible();
    await section.hover();
    await page.waitForTimeout(450);
    await expect(preview).toBeHidden();

    await page.evaluate(() => {
      const toc = document.querySelector('nav.toc');
      const link = document.createElement('a');
      link.href = 'https://example.com/toc-external';
      link.textContent = '目录外链';
      link.dataset.testid = 'toc-external';
      toc?.appendChild(link);
    });
    await page.getByTestId('toc-external').hover();
    await page.waitForTimeout(450);
    await expect(preview).toBeHidden();

    await section.click();
    await expect(page).toHaveURL(/#(?!doc-title).+/);
    await title.click();
    await expect(page).toHaveURL(/#doc-title$/);
    const top = await page.evaluate(() => {
      const pane = document.querySelector('[data-reading-pane]');
      return pane instanceof HTMLElement ? pane.scrollTop : window.scrollY;
    });
    expect(top).toBeLessThan(2);
  });

  test('键盘聚焦后可见，Esc 关闭，焦点还在原链接', async ({ page }) => {
    const section = await ready(page);
    const link = articleLink(section);
    const preview = page.locator('[data-mention-preview]');

    await link.focus();
    await expect(preview).toBeVisible();
    await expect(link).toBeFocused();
    const outline = await link.evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(outline).not.toBe('none');

    await page.keyboard.press('Escape');
    await expect(preview).toBeHidden();
    await expect(link).toBeFocused();
  });

  test('短按仍会打开链接；长按才打开预览且不导航', async ({ page }) => {
    const section = await ready(page);
    const link = articleLink(section);
    const preview = page.locator('[data-mention-preview]');

    await link.evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, clientX: 8, clientY: 8 }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, clientX: 8, clientY: 8 }));
    });
    await page.waitForTimeout(500);
    await expect(preview).toBeHidden();
    await expect(link).not.toHaveAttribute('data-mention-preview-suppress');

    await link.evaluate((el) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, pointerType: 'touch', pointerId: 1, clientX: 8, clientY: 8 }));
    });
    await expect(preview).toBeVisible();
    await expect(link).toHaveAttribute('data-mention-preview-suppress', '');
    const blocked = await link.evaluate((el) => {
      const event = new MouseEvent('click', { bubbles: true, cancelable: true });
      const followed = el.dispatchEvent(event);
      return { followed, path: location.pathname };
    });
    expect(blocked.followed).toBe(false);
    expect(blocked.path).toBe('/lab');
    await expect(preview).toBeVisible();
  });

  test('点击 mention 仍然进入目标页', async ({ page }) => {
    const section = await ready(page);
    await articleLink(section).click();
    await expect(page).toHaveURL(/\/pkm-method$/);
    await expect(page.getByRole('heading', { level: 1, name: '我的 PKM 实践：从笔记到知识网络' })).toBeVisible();
  });

  test('减少动效时预览没有过渡', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const section = await ready(page);
    const preview = page.locator('[data-mention-preview]');
    await articleLink(section).hover();
    await expect(preview).toBeVisible();
    const duration = await preview.evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration === '0s' || duration === '0ms').toBeTruthy();
  });

  test('Now 页外链悬停出同一张卡，点击仍打开原来的地址', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    const hits: string[] = [];
    await page.route(/https?:\/\/(?:www\.)?nownownow\.com/i, async (route) => {
      hits.push(route.request().url());
      await route.abort();
    });
    await page.goto('/now', { waitUntil: 'domcontentloaded' });
    await expect(page.locator('[data-mention-preview-ready]')).toBeAttached();
    const link = page.locator('main .prose-site a', { hasText: 'nownownow.com' });
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', 'https://nownownow.com/about');
    const target = await link.getAttribute('target');
    const preview = page.locator('[data-mention-preview]');

    await link.hover();
    await expect(preview).toBeVisible();
    await expect(preview.locator('.mention-preview-title')).toHaveText('nownownow.com');
    await expect(preview.locator('.mention-preview-url')).toHaveText('https://nownownow.com/about');
    await expect(preview.locator('.mention-preview-summary, .mention-preview-body, .article-dek-text, .prose-site')).toHaveCount(0);
    await expect(preview).not.toContainText('未填写');
    expect(hits).toEqual([]);
    const box = await preview.boundingBox();
    expect(box).toBeTruthy();
    expect(box!.width).toBeGreaterThan(300);
    expect(box!.width).toBeLessThanOrEqual(328);
    expect(box!.height / box!.width).toBeCloseTo(159 / 206, 2);
    const linkBox = await link.boundingBox();
    expect(linkBox).toBeTruthy();
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return el?.closest('a')?.getAttribute('href') ?? '';
    }, { x: linkBox!.x + linkBox!.width / 2, y: linkBox!.y + linkBox!.height / 2 });
    expect(hit).toBe('https://nownownow.com/about');

    await page.evaluate(() => {
      for (const [sel, id, text] of [
        ['.site-footer', 'footer-external', '页脚外链'],
        ['.site-nav', 'nav-external', '导航外链'],
      ] as const) {
        const host = document.querySelector(sel);
        const anchor = document.createElement('a');
        anchor.href = 'https://example.com/' + id;
        anchor.textContent = text;
        anchor.dataset.testid = id;
        anchor.style.pointerEvents = 'auto';
        anchor.style.position = 'relative';
        anchor.style.zIndex = '80';
        host?.appendChild(anchor);
      }
    });
    await page.getByTestId('footer-external').hover();
    await page.waitForTimeout(450);
    await expect(preview).toBeHidden();
    await page.getByTestId('nav-external').hover();
    await page.waitForTimeout(450);
    await expect(preview).toBeHidden();

    expect(await link.getAttribute('target')).toBe(target);
    const opened = page.waitForRequest((req) => req.url().includes('nownownow.com'));
    await link.click({ noWaitAfter: true });
    expect((await opened).url()).toBe('https://nownownow.com/about');
  });

  test('无 JS 时 mention 仍是紧贴汉字的链接，审核预览页没有这个岛屿', async ({ page }) => {
    const lab = await (await page.request.get('/lab')).text();
    expect(lab).toMatch(/悬停<a [^>]*data-doc-mention[^>]*>知识网络<\/a>/);
    expect(lab).not.toMatch(/悬停\s+<a/);
    expect(lab).toMatch(/知识网络<\/a>、/);
    expect(lab).toContain('data-mention-preview-root');

    const article = await (await page.request.get('/pkm-method')).text();
    expect(article).toContain('data-mention-preview-root');

    const preview = await (await page.request.get('/dashboard/preview')).text();
    expect(preview).not.toContain('data-mention-preview');
    expect(preview).not.toContain('MentionPreview');
    expect(preview).toContain('data-preview-body');
  });
});
