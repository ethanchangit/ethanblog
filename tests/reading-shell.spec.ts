import { test, expect, type Locator, type Page } from '@playwright/test';

const inner = { useInnerText: true } as const;

async function revealHeadingControl(root: Locator, selector: '[data-reading-expand]' | '[data-reading-collapse]') {
  const control = root.locator(selector);
  await root.locator('.reading-index-heading').hover();
  await expect(control).toHaveCSS('opacity', '1');
  return control;
}

async function revealReadingExpand(index: Locator) {
  return revealHeadingControl(index, '[data-reading-expand]');
}

async function revealReadingCollapse(root: Locator) {
  return revealHeadingControl(root, '[data-reading-collapse]');
}

async function expectControlAtHeadingEnd(
  root: Locator,
  selector: '[data-reading-expand]' | '[data-reading-collapse]',
) {
  const headingBox = await root.locator('.reading-index-heading').boundingBox();
  const switchBox = await root.locator('[data-reading-index-switch]').boundingBox();
  const controlBox = await root.locator(selector).boundingBox();
  expect(headingBox).toBeTruthy();
  expect(switchBox).toBeTruthy();
  expect(controlBox).toBeTruthy();
  expect(controlBox!.x).toBeGreaterThan(switchBox!.x + switchBox!.width - 4);
  expect(headingBox!.x + headingBox!.width - (controlBox!.x + controlBox!.width)).toBeLessThan(8);
}

async function expectExpandAtHeadingEnd(index: Locator) {
  await expectControlAtHeadingEnd(index, '[data-reading-expand]');
}

async function expectCollapseAtHeadingEnd(root: Locator) {
  await expectControlAtHeadingEnd(root, '[data-reading-collapse]');
}

async function waitReadingLayoutSettled(page: Page) {
  await page.locator('[data-reading-shell]').evaluate((el) => {
    const duration = getComputedStyle(el).transitionDuration;
    if (!duration || duration.split(',').every((part) => part.trim() === '0s')) return;
    return new Promise<void>((resolve) => {
      const done = () => resolve();
      el.addEventListener('transitionend', done, { once: true });
      window.setTimeout(done, 450);
    });
  });
}

async function markReadingShell(page: Page) {
  await page.locator('[data-reading-shell]').evaluate((el) => {
    el.setAttribute('data-reading-keep', '1');
  });
}

async function expectKeptShell(page: Page, kind: 'index' | 'home' | 'article' | 'project') {
  await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', kind);
  await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-keep', '1');
}

async function expectExpandedIndex(page: Page, heading: 'Articles' | 'Projects', homeHref = '/') {
  const index = page.locator('[data-reading-index]');
  await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'index');
  await expect(index.getByRole('heading', { level: 1, name: heading })).toBeVisible();
  await expect(index.locator('[data-reading-expand]')).toBeHidden();
  await expect(page.locator('[data-about-panel]')).toBeHidden();
  const collapse = await revealReadingCollapse(index);
  await expect(collapse).toHaveAttribute('href', homeHref);
  await expectCollapseAtHeadingEnd(index);
  return collapse;
}

const READING_INDEX_REMS = 24;
const READING_RAIL_REMS = 24;
const READING_MEASURE_REMS = 42;

type ReadingPanePos = {
  articleLeft: number;
  articleRight: number;
  articleWidth: number;
  articleMid: number;
  docLeft: number;
  docRight: number;
  docWidth: number;
  indexWidth: number;
  indexRight: number;
  remainingMid: number;
  railLeft: number | null;
  railWidth: number | null;
  tocLeft: number | null;
  viewport: number;
};

type ReadingSplitPos = ReadingPanePos & {
  tocLeft: number;
  railLeft: number;
  railWidth: number;
};

async function rootRem(page: Page) {
  return page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize));
}

async function measureReadingPanes(page: Page) {
  return page.evaluate((): ReadingPanePos | null => {
    const article =
      document.querySelector('.article-shell') ?? document.querySelector('[data-about-panel]');
    const doc = document.querySelector('[data-reading-doc]');
    const index = document.querySelector('[data-reading-index]');
    if (!article || !doc || !index) return null;
    const a = article.getBoundingClientRect();
    const d = doc.getBoundingClientRect();
    const i = index.getBoundingClientRect();
    const rail = document.querySelector('[data-reading-rail]');
    const railVisible = rail instanceof HTMLElement && getComputedStyle(rail).display !== 'none';
    const r = railVisible ? rail.getBoundingClientRect() : null;
    const toc = railVisible ? document.querySelector('[data-reading-rail] nav.toc') : null;
    const t = toc?.getBoundingClientRect() ?? null;
    const rightEdge = r ? r.left : window.innerWidth;
    return {
      articleLeft: a.left,
      articleRight: a.right,
      articleWidth: a.width,
      articleMid: (a.left + a.right) / 2,
      docLeft: d.left,
      docRight: d.right,
      docWidth: d.width,
      indexWidth: i.width,
      indexRight: i.right,
      remainingMid: (i.right + rightEdge) / 2,
      railLeft: r ? r.left : null,
      railWidth: r ? r.width : null,
      tocLeft: t ? t.left : null,
      viewport: window.innerWidth,
    };
  });
}

async function measureReadingSplit(page: Page) {
  const pos = await measureReadingPanes(page);
  if (!pos || pos.tocLeft == null || pos.railLeft == null || pos.railWidth == null) return null;
  return pos as ReadingSplitPos;
}

function expectRailAfterDoc(pos: ReadingSplitPos) {
  expect(pos.tocLeft).toBeGreaterThanOrEqual(pos.articleRight - 1);
  expect(pos.railLeft).toBeGreaterThanOrEqual(pos.docRight - 2);
}

function expectFixedIndexWidth(width: number, rem: number) {
  expect(Math.abs(width - READING_INDEX_REMS * rem)).toBeLessThan(2);
}

function expectFixedRailWidth(width: number, rem: number) {
  expect(Math.abs(width - READING_RAIL_REMS * rem)).toBeLessThan(2);
}

function expectIndexAtMost(width: number, rem: number) {
  expect(width).toBeLessThanOrEqual(READING_INDEX_REMS * rem + 2);
}

function expectRailAtMost(width: number, rem: number) {
  expect(width).toBeLessThanOrEqual(READING_RAIL_REMS * rem + 2);
}

async function expectNoPageOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(
    true,
  );
}

async function expectPanesDoNotMicroScroll(page: Page) {
  const panes = await page.evaluate(() =>
    ['[data-reading-index]', '[data-reading-doc]', '[data-reading-rail]']
      .map((sel) => {
        const el = document.querySelector(sel);
        if (!(el instanceof HTMLElement) || getComputedStyle(el).display === 'none') return null;
        const x = getComputedStyle(el).overflowX;
        return {
          sel,
          overflowX: x,
          dx: el.scrollWidth - el.clientWidth,
          nudged: (() => {
            const before = el.scrollLeft;
            el.scrollLeft = before + 24;
            const moved = el.scrollLeft !== before;
            el.scrollLeft = before;
            return moved;
          })(),
        };
      })
      .filter((pane): pane is NonNullable<typeof pane> => pane != null),
  );
  expect(panes.length).toBeGreaterThan(0);
  for (const pane of panes) {
    expect(pane.overflowX, pane.sel).toMatch(/^(hidden|clip)$/);
    expect(pane.dx, pane.sel).toBeLessThanOrEqual(1);
    expect(pane.nudged, pane.sel).toBe(false);
  }
}

function expectCenteredArticleGutters(pos: Pick<ReadingPanePos, 'articleLeft' | 'articleRight' | 'docLeft' | 'docRight'>) {
  const left = pos.articleLeft - pos.docLeft;
  const right = pos.docRight - pos.articleRight;
  const room = pos.docRight - pos.docLeft - (pos.articleRight - pos.articleLeft);
  if (room < 24) {
    expect(Math.abs(left - right)).toBeLessThan(16);
    return;
  }
  expect(left).toBeGreaterThanOrEqual(12);
  expect(right).toBeGreaterThanOrEqual(12);
  expect(Math.abs(left - right)).toBeLessThan(16);
}

function expectLockedArticleMeasure(pos: Pick<ReadingPanePos, 'articleWidth' | 'docWidth'>, rem: number) {
  const measure = READING_MEASURE_REMS * rem;
  const expected = Math.min(measure, pos.docWidth);
  expect(Math.abs(pos.articleWidth - expected)).toBeLessThan(3);
}

function expectArticleCenteredInRemaining(pos: Pick<ReadingPanePos, 'articleMid' | 'remainingMid'>) {
  expect(Math.abs(pos.articleMid - pos.remainingMid)).toBeLessThan(16);
}

async function expectTightSplitInset(page: Page) {
  const gap = await page.evaluate(() => {
    const nav = document.querySelector('header.site-nav');
    const title = document.querySelector('.reading-index .reading-index-heading h1');
    const lede = document.querySelector('[data-reading-doc] .article-lede, [data-reading-doc] [data-about-panel] h1');
    const toc = document.querySelector('[data-reading-rail] nav.toc');
    const tocVisible =
      toc instanceof HTMLElement && getComputedStyle(toc).display !== 'none' && toc.getBoundingClientRect().height > 0;
    if (!(nav instanceof HTMLElement) || !(title instanceof HTMLElement) || !(lede instanceof HTMLElement)) {
      return null;
    }
    const navBottom = nav.getBoundingClientRect().bottom;
    return {
      index: title.getBoundingClientRect().top - navBottom,
      lede: lede.getBoundingClientRect().top - navBottom,
      toc: tocVisible && toc ? toc.getBoundingClientRect().top - navBottom : null,
    };
  });
  expect(gap).not.toBeNull();
  expect(gap!.index).toBeGreaterThanOrEqual(4);
  expect(gap!.index).toBeLessThan(28);
  expect(gap!.lede).toBeGreaterThanOrEqual(4);
  expect(gap!.lede).toBeLessThan(28);
  if (gap!.toc != null) {
    expect(gap!.toc).toBeGreaterThanOrEqual(4);
    expect(gap!.toc).toBeLessThan(28);
  }
}

test.describe('分栏阅读', () => {
  test('/ 是左栏索引 + 中栏 About，列表无选中', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');

    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(index).toBeVisible();
    await expect(index.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(index.locator('[data-reading-index-switch] a')).toHaveCount(1);
    await expect(index.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    await expect(index.locator('a[aria-current="page"]')).toHaveCount(0);
    await expect(doc.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(doc.getByRole('heading', { name: 'What I do' })).toBeVisible();
    await expect(page.locator('header.site-nav a[href="/articles"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/projects"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/tags"]')).toBeVisible();
    await expect(page.locator('header.site-nav a[href="/now"]')).toBeVisible();
    const expand = index.locator('[data-reading-expand]');
    await expect(expand).toHaveAttribute('href', '/articles');
    await expect(expand).toHaveCSS('opacity', '0');
    await expect(index.locator('[data-reading-collapse]')).toBeHidden();
    await revealReadingExpand(index);
    await expectExpandAtHeadingEnd(index);
  });

  test('首页点卡片把 About 换成文章，左栏仍在并标当前项', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const index = page.locator('[data-reading-index]');
    await index.locator('a[href="/articles/pkm-method"]').click({ force: true });

    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(page.locator('[data-about-panel]')).toHaveCount(0);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  test('首页点「项目」只换左栏，中栏仍是 About', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    const index = page.locator('[data-reading-index]');
    await index.locator('[data-reading-index-switch]').getByRole('link', { name: 'Projects' }).click();

    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(index.locator('[data-tl-item]').first()).toBeVisible();
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(index.locator('a[aria-current="page"]')).toHaveCount(0);
  });

  test('/articles 未点开是展开的索引壳', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'index');
    const switcher = page.locator('[data-reading-index-switch]');
    await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(switcher.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(switcher.getByRole('heading', { name: 'Projects' })).toHaveCount(0);
    await expect(switcher.locator('a[href="/projects"]')).toBeVisible();
    await expect(switcher.locator('a[href="/blogs"]')).toHaveCount(0);
    await expect(switcher.locator('a')).toHaveCount(1);
    const titleSize = await switcher.locator('h1').evaluate((el) => getComputedStyle(el).fontSize);
    const altSize = await switcher.locator('a').first().evaluate((el) => getComputedStyle(el).fontSize);
    expect(parseFloat(altSize)).toBeLessThan(parseFloat(titleSize) * 0.55);
    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/tags"]')).toBeVisible();
    await expect(page.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
    const index = page.locator('[data-reading-index]');
    await expect(index.locator('[data-reading-expand]')).toBeHidden();
    const collapse = index.locator('[data-reading-collapse]');
    await expect(collapse).toHaveAttribute('href', '/');
    await expect(collapse).toHaveAttribute('aria-label', 'Show About');
    await expect(collapse).toHaveCSS('opacity', '0');
    await revealReadingCollapse(index);
    await expectCollapseAtHeadingEnd(index);
  });

  test('/projects 未点开显示收起，不显示展开', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'index');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/articles"]')).toBeVisible();
    await expect(page.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();
    const index = page.locator('[data-reading-index]');
    await expect(index.locator('[data-reading-expand]')).toBeHidden();
    const collapse = index.locator('[data-reading-collapse]');
    await expect(collapse).toHaveAttribute('href', '/');
    await expect(collapse).toHaveCSS('opacity', '0');
    await revealReadingCollapse(index);
    await expectCollapseAtHeadingEnd(index);
  });

  test('文章页左栏是完整索引，中栏是正文，长文第三栏是目录', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    const rail = page.locator('[data-reading-rail]');

    await expect(index).toBeVisible();
    await expect(index.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/projects"]')).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/blogs"]')).toHaveCount(0);
    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/tags"]')).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/pkm-method"] p').first()).toBeVisible();

    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(rail).toBeVisible();
    await expect(rail.locator('nav.toc')).toBeVisible();
  });

  test('heptabase 长文左栏是完整卡片，目录在第三栏不悬挂', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/heptabase-method');

    const index = page.locator('[data-reading-index]');
    const rail = page.locator('[data-reading-rail]');
    await expect(index.locator('a[href="/articles/heptabase-method"] h3')).toBeVisible();
    await expect(index.locator('a[href="/articles/heptabase-method"] p').first()).toBeVisible();
    await expect(rail.locator('nav.toc')).toBeVisible();
    await expect(page.locator('[data-reading-doc] nav.toc')).toHaveCount(0);

    const pos = await measureReadingSplit(page);
    expect(pos).not.toBeNull();
    const rem = await rootRem(page);
    expectIndexAtMost(pos!.indexWidth, rem);
    expectRailAtMost(pos!.railWidth, rem);
    expectRailAfterDoc(pos!);
    expectCenteredArticleGutters(pos!);
    expectArticleCenteredInRemaining(pos!);
    expect(pos!.indexRight).toBeLessThanOrEqual(pos!.docLeft + 1);
    expect(pos!.docWidth).toBeGreaterThan(36 * 16);
    await expectNoPageOverflow(page);
    await expectTightSplitInset(page);

    await page.setViewportSize({ width: 1512, height: 720 });
    const wide = await measureReadingSplit(page);
    expect(wide).not.toBeNull();
    expectFixedIndexWidth(wide!.indexWidth, rem);
    expectFixedRailWidth(wide!.railWidth, rem);
    expectRailAfterDoc(wide!);
    expectCenteredArticleGutters(wide!);
    expectArticleCenteredInRemaining(wide!);
    expectLockedArticleMeasure(wide!, rem);

    await page.setViewportSize({ width: 1728, height: 720 });
    const ultra = await measureReadingSplit(page);
    expect(ultra).not.toBeNull();
    expectFixedIndexWidth(ultra!.indexWidth, rem);
    expectFixedRailWidth(ultra!.railWidth, rem);
    expectRailAfterDoc(ultra!);
    expectCenteredArticleGutters(ultra!);
    expectArticleCenteredInRemaining(ultra!);
    expectLockedArticleMeasure(ultra!, rem);
    expect(Math.abs(ultra!.articleWidth - wide!.articleWidth)).toBeLessThan(2);
    expect(Math.abs(ultra!.railWidth - wide!.railWidth)).toBeLessThan(2);
    expect(ultra!.articleLeft).toBeGreaterThan(wide!.articleLeft + 8);
    expect(ultra!.indexWidth).toBeLessThan(ultra!.articleLeft - 4);
  });

  test('短文没有第三栏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/embed-preview');
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(page.locator('nav.toc')).toHaveCount(0);
  });

  test('左栏宽度不随目录栏出现或消失而变', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const rem = await rootRem(page);

    await page.goto('/');
    const home = await measureReadingPanes(page);
    expect(home).not.toBeNull();
    expectFixedIndexWidth(home!.indexWidth, rem);

    await page.goto('/articles/embed-preview');
    const noToc = await measureReadingPanes(page);
    expect(noToc).not.toBeNull();
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    expectFixedIndexWidth(noToc!.indexWidth, rem);
    expectArticleCenteredInRemaining(noToc!);
    expect(Math.abs(noToc!.indexWidth - home!.indexWidth)).toBeLessThan(2);

    await page.goto('/articles/pkm-method');
    const withToc = await measureReadingSplit(page);
    expect(withToc).not.toBeNull();
    expectIndexAtMost(withToc!.indexWidth, rem);
    expectRailAtMost(withToc!.railWidth, rem);
    expectArticleCenteredInRemaining(withToc!);
    expectCenteredArticleGutters(withToc!);
    expect(withToc!.indexRight).toBeLessThanOrEqual(withToc!.docLeft + 1);
    await expectNoPageOverflow(page);
    await expectTightSplitInset(page);
  });

  test('有无目录时正文宽度不变，只改两侧空隙', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 720 });
    const rem = await rootRem(page);

    await page.goto('/articles/embed-preview');
    const noToc = await measureReadingPanes(page);
    expect(noToc).not.toBeNull();
    expectLockedArticleMeasure(noToc!, rem);
    expectFixedIndexWidth(noToc!.indexWidth, rem);

    await page.goto('/articles/pkm-method');
    const withToc = await measureReadingSplit(page);
    expect(withToc).not.toBeNull();
    expectLockedArticleMeasure(withToc!, rem);
    expectFixedIndexWidth(withToc!.indexWidth, rem);
    expectFixedRailWidth(withToc!.railWidth, rem);
    expect(Math.abs(withToc!.articleWidth - noToc!.articleWidth)).toBeLessThan(2);
    expect(Math.abs(withToc!.indexWidth - noToc!.indexWidth)).toBeLessThan(2);
  });

  test('分栏点无目录文章再点有目录文章，左栏宽度不变', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 720 });
    await page.goto('/articles/embed-preview');
    const index = page.locator('[data-reading-index]');
    const before = await measureReadingPanes(page);
    expect(before).not.toBeNull();
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);

    await index.locator('a[href="/articles/pkm-method"]').click({ force: true });
    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(page.locator('[data-reading-rail] nav.toc')).toBeVisible();
    const after = await measureReadingSplit(page);
    expect(after).not.toBeNull();
    expect(Math.abs(after!.indexWidth - before!.indexWidth)).toBeLessThan(2);
    expectArticleCenteredInRemaining(after!);
  });

  test('768 宽两栏按比例收，目录收起且不横向溢出', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 800 });
    await page.goto('/articles/pkm-method');
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-rail]')).toBeHidden();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();

    const pos = await measureReadingPanes(page);
    expect(pos).not.toBeNull();
    const rem = await rootRem(page);
    expectIndexAtMost(pos!.indexWidth, rem);
    expect(pos!.indexWidth).toBeLessThan(READING_INDEX_REMS * rem - 8);
    expect(pos!.articleWidth).toBeLessThan(READING_MEASURE_REMS * rem - 8);
    expect(pos!.indexRight).toBeLessThanOrEqual(pos!.docLeft + 1);
    expect(pos!.railWidth).toBeNull();
    await expectNoPageOverflow(page);
  });

  test('三栏只竖滚，触控板左右微移不动', async ({ page }) => {
    for (const width of [768, 1280, 1512] as const) {
      await page.setViewportSize({ width, height: 800 });
      await page.goto('/articles/pkm-method');
      await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
      await expectPanesDoNotMicroScroll(page);
    }
  });

  test('合集正文列出篇目，点开会进第三栏；子页不进左栏索引', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/series-demo');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    const listing = doc.locator('.article-shell [data-series="hub-inline"]');
    const rail = page.locator('[data-reading-rail]');
    await expect(index.locator('a[href="/articles/series-demo"] h3')).toBeVisible();
    await expect(index.locator('a[href="/articles/series-demo/1"]')).toHaveCount(0);
    await expect(rail).toHaveCount(0);
    await expect(page.locator('nav.reading-series')).toHaveCount(0);
    await expect(listing.locator('a[href="/articles/series-demo/1"] h3')).toBeVisible();
    await expect(listing.locator('a[href="/articles/series-demo/2"] h3')).toBeVisible();

    const part1 = listing.locator('a[href="/articles/series-demo/1"]');
    const part2 = listing.locator('a[href="/articles/series-demo/2"]');
    await part1.click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText('A demo of a series of content', inner);
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 1',
      inner,
    );
    await expect(rail).toHaveAttribute('data-reading-child-open', '');
    await expect(rail.locator('nav.reading-series')).toHaveCount(0);
    await expect(rail.locator('nav.toc')).toHaveCount(0);
    await expect(page.locator('[data-reading-rail] > .reading-child-dismiss')).toHaveCount(0);
    const dateRow = page.locator(
      '[data-reading-child] header.article-lede > div.flex.justify-between',
    );
    const close = dateRow.locator('[data-reading-child-close]');
    await expect(close).toBeVisible();
    await expect(close).toHaveText('Close', inner);
    await expect(dateRow.locator('time.ui-meta')).toBeVisible();
    const dateBox = await dateRow.locator('time.ui-meta').boundingBox();
    const closeBox = await close.boundingBox();
    expect(dateBox).toBeTruthy();
    expect(closeBox).toBeTruthy();
    const dateMid = dateBox!.y + dateBox!.height / 2;
    const closeMid = closeBox!.y + closeBox!.height / 2;
    expect(Math.abs(dateMid - closeMid)).toBeLessThan(8);
    expect(closeBox!.x).toBeGreaterThan(dateBox!.x + dateBox!.width);
    await expect(part1).toHaveAttribute('aria-current', 'page');
    await expect(part2).not.toHaveAttribute('aria-current');

    const railBox = await rail.boundingBox();
    expect(railBox).not.toBeNull();
    expect(railBox!.width).toBeGreaterThan(280);
  });

  test('总览正文点篇目在第三栏打开，换篇不换总览', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/series-demo');

    const doc = page.locator('[data-reading-doc]');
    const rail = page.locator('[data-reading-rail]');
    const listing = doc.locator('.article-shell [data-series="hub-inline"]');

    await listing.locator('a[href="/articles/series-demo/1"]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText('A demo of a series of content', inner);
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 1',
      inner,
    );
    await expect(rail.locator('nav.reading-series')).toHaveCount(0);
    await expect(page.locator('[data-reading-child-close]')).toBeVisible();

    await listing.locator('a[href="/articles/series-demo/2"]').click();
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText('A demo of a series of content', inner);
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 2',
      inner,
    );
    await expect(listing.locator('a[href="/articles/series-demo/2"]')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.locator('[data-reading-child-close]').click();
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(rail).toHaveCount(0);
    await expect(page.locator('nav.reading-series')).toHaveCount(0);
    await expect(doc.locator('.article-lede h1')).toHaveText('A demo of a series of content', inner);
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
  });

  test('第三栏打开子文时 Escape 只收起子文，不关总览', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/series-demo');
    await page
      .locator('[data-reading-doc] .article-shell [data-series="hub-inline"] a[href="/articles/series-demo/1"]')
      .click();
    await expect(page.locator('[data-reading-child] .article-lede h1')).toHaveText(
      'Series demo · Part 1',
      inner,
    );
    await expect(page.locator('[data-reading-rail] nav.reading-series')).toHaveCount(0);

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(page.locator('nav.reading-series')).toHaveCount(0);
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(page.locator('[data-reading-shell]')).toBeVisible();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'A demo of a series of content',
      inner,
    );
  });

  test('项目页左栏是完整项目页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/aletheia');

    const index = page.locator('[data-reading-index]');
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(index.locator('[data-reading-index-switch] a[href="/articles"]')).toBeVisible();
    await expect(index.getByRole('heading', { name: 'Timeline: from cards to a container' })).toBeVisible();
    await expect(index.locator('[data-tl-item]').first()).toBeVisible();
    await expect(index.getByText('Three explicit hand-offs:')).toBeVisible();
    await expect(
      index.locator('[data-tl-item] a[href="/projects/aletheia"]'),
    ).toHaveAttribute('aria-current', 'page');
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'Aletheia',
      inner,
    );
  });

  test('项目页有标题时目录浮在阅读区右侧', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/aletheia');

    const rail = page.locator('[data-reading-rail]');
    await expect(rail.locator('nav.toc')).toBeVisible();
    await expect(page.locator('[data-reading-doc] nav.toc')).toHaveCount(0);

    const pos = await measureReadingSplit(page);
    expect(pos).not.toBeNull();
    const rem = await rootRem(page);
    expectIndexAtMost(pos!.indexWidth, rem);
    expectRailAtMost(pos!.railWidth, rem);
    expectRailAfterDoc(pos!);
    expectCenteredArticleGutters(pos!);
    expectArticleCenteredInRemaining(pos!);
    await expectNoPageOverflow(page);
  });

  test('左栏点另一个项目只换正文，时间线滚动保留', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/projects/aletheia');

    const index = page.locator('[data-reading-index]');
    const before = await index.evaluate((el: HTMLElement) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(80, max);
      el.setAttribute('data-keep-index', '1');
      return el.scrollTop;
    });

    await index.locator('[data-tl-item] a[href="/projects/network"]').evaluate((a) => {
      a.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
      a.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
    });
    await expect(page).toHaveURL(/\/projects\/network\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText('Networks', inner);
    await expect(index).toHaveAttribute('data-keep-index', '1');
    expect(await index.evaluate((el: HTMLElement) => el.scrollTop)).toBe(before);
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(
      index.locator('[data-tl-item] a[href="/projects/network"]'),
    ).toHaveAttribute('aria-current', 'page');
  });

  test('点当前文章不换页也不滚左栏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/articles/heptabase-method');

    const index = page.locator('[data-reading-index]');
    const card = index.locator('a[href="/articles/heptabase-method"]');
    await expect(card).toHaveAttribute('aria-current', 'page');

    await card.evaluate((el) => el.scrollIntoView({ block: 'nearest' }));
    const before = await index.evaluate((el: HTMLElement) => {
      el.setAttribute('data-keep-index', '1');
      return { top: el.scrollTop, html: el.innerHTML };
    });

    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(
      box!.x + Math.min(24, box!.width / 2),
      box!.y + Math.min(12, box!.height / 2),
    );

    await expect(page).toHaveURL(/\/articles\/heptabase-method\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'How I use Heptabase for deep learning',
      inner,
    );
    await expect(index).toHaveAttribute('data-keep-index', '1');
    const after = await index.evaluate((el: HTMLElement) => ({
      top: el.scrollTop,
      html: el.innerHTML,
    }));
    expect(after.top).toBe(before.top);
    expect(after.html).toBe(before.html);
  });

  test('左栏点另一篇只换正文和目录，左栏滚动保留', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(page.locator('[data-reading-rail] nav.toc')).toBeVisible();

    const before = await index.evaluate((el: HTMLElement) => {
      const max = Math.max(0, el.scrollHeight - el.clientHeight);
      el.scrollTop = Math.min(120, max);
      el.setAttribute('data-keep-index', '1');
      return el.scrollTop;
    });

    await index.locator('a[href="/articles/heptabase-method"]').evaluate((a) => {
      a.dispatchEvent(
        new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
      a.dispatchEvent(
        new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, view: window }),
      );
    });
    await expect(page).toHaveURL(/\/articles\/heptabase-method\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'How I use Heptabase for deep learning',
      inner,
    );
    await expect(index.locator('a[href="/articles/heptabase-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/pkm-method"]')).not.toHaveAttribute(
      'aria-current',
    );
    await expect(page.locator('[data-reading-rail] nav.toc')).toBeVisible();
    await expect(page.locator('[data-reading-doc] nav.toc')).toHaveCount(0);
    await expect(index).toHaveAttribute('data-keep-index', '1');
    expect(await index.evaluate((el: HTMLElement) => el.scrollTop)).toBe(before);
    await expect(index.getByRole('heading', { level: 2, name: '2026' })).toBeVisible();
  });

  test('从长文点短文只换正文，目录栏拿掉，左栏不动', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 560 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    await expect(page.locator('[data-reading-rail] nav.toc')).toBeVisible();
    const beforeWidth = await index.evaluate((el) => el.getBoundingClientRect().width);
    await index.evaluate((el: HTMLElement) => el.setAttribute('data-keep-index', '1'));

    await index.locator('a[href="/articles/embed-preview"]').click({ force: true });
    await expect(page).toHaveURL(/\/articles\/embed-preview\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(index).toHaveAttribute('data-keep-index', '1');
    await expect(index.locator('a[href="/articles/embed-preview"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    const after = await measureReadingPanes(page);
    expect(after).not.toBeNull();
    expect(Math.abs(after!.indexWidth - beforeWidth)).toBeLessThan(2);
  });

  test('左栏点合集总览在中栏打开，不进第三栏', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    await index.locator('a[href="/articles/series-demo"]').click({ force: true });
    await expect(page).toHaveURL(/\/articles\/series-demo\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toHaveText(
      'A demo of a series of content',
      inner,
    );
    await expect(page.locator('[data-reading-child]')).toHaveCount(0);
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
    await expect(page.locator('nav.reading-series')).toHaveCount(0);
    await expect(
      page.locator(
        '[data-reading-doc] .article-shell [data-series="hub-inline"] a[href="/articles/series-demo/1"]',
      ),
    ).toBeVisible();
  });

  test('分栏点「更早」只换左栏，正文与 URL 不变', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const doc = page.locator('[data-reading-doc]');
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );

    await index.getByRole('link', { name: 'Earlier' }).click();

    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(page.locator('[data-reading-shell]')).toBeVisible();
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    await expect(index.locator('a[href="/articles/embed-preview"]')).toHaveCount(0);
    await expect(index.getByRole('link', { name: 'Newer' })).toBeVisible();

    await index.locator('a[href="/articles/dummy-2026-01"]').click({ force: true });
    await expect(page).toHaveURL(/\/articles\/dummy-2026-01\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText('Placeholder 2026-01', inner);
    await expect(index.locator('a[href="/articles/dummy-2026-01"]')).toHaveAttribute(
      'aria-current',
      'page',
    );
    await expect(index.locator('a[href="/articles/embed-preview"]')).toHaveCount(0);
  });

  test('分栏点左栏标题「项目」只换左栏，正文与 URL 不变', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const switcher = index.locator('[data-reading-index-switch]');
    const doc = page.locator('[data-reading-doc]');

    await expect(page.locator('header.site-nav a[href="/articles"]')).toBeHidden();
    await expect(page.locator('header.site-nav a[href="/projects"]')).toBeHidden();

    await switcher.getByRole('link', { name: 'Projects' }).click();

    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(page.locator('[data-reading-shell]')).toBeVisible();
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    await expect(index.locator('[data-tl-item]').first()).toBeVisible();
    await expect(switcher.locator('h1')).toHaveAttribute('aria-current', 'page');

    await switcher.getByRole('link', { name: 'Articles' }).click();
    await expect(page).toHaveURL(/\/articles\/pkm-method\/?$/);
    await expect(doc.locator('.article-lede h1')).toHaveText(
      'My PKM practice: from notes to a knowledge network',
      inner,
    );
    await expect(index.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(index.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
  });

  test('窄屏从文章回列表再切项目', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/articles/pkm-method');
    await page.getByRole('link', { name: '← Articles' }).click();
    await expect(page).toHaveURL(/\/articles\/?$/);
    await page.locator('[data-reading-index-switch]').getByRole('link', { name: 'Projects' }).click();
    await expect(page).toHaveURL(/\/projects\/?$/);
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'index');
  });

  test('窄屏只显示正文和返回', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/articles/pkm-method');
    await expect(page.locator('[data-reading-index]')).toBeHidden();
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
    const back = page.getByRole('link', { name: '← Articles' });
    await expect(back).toBeVisible();
    const navBox = await page.locator('header.site-nav').boundingBox();
    const backBox = await back.boundingBox();
    const titleBox = await page.locator('[data-reading-doc] .article-lede h1').boundingBox();
    expect(navBox).toBeTruthy();
    expect(backBox).toBeTruthy();
    expect(titleBox).toBeTruthy();
    expect(backBox!.y).toBeGreaterThanOrEqual(navBox!.y + navBox!.height - 2);
    expect(titleBox!.y).toBeGreaterThan(backBox!.y);
    await expect(page.locator('[data-reading-rail]')).toBeHidden();
    await expect(page.locator('.reading-toc-entry')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Contents' })).toHaveCount(0);
    expect(backBox!.x).toBeLessThan(48);
    expect(Math.abs(backBox!.x - titleBox!.x)).toBeLessThan(8);
  });

  test('分栏点 EthanChang 回到首页 About', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const index = page.locator('[data-reading-index]');
    await expect(index.locator('a[href="/articles/pkm-method"]')).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.locator('header.site-nav a[href="/"]').click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(index.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
    await expect(index.locator('a[aria-current="page"]')).toHaveCount(0);
    await expect(page.locator('[data-reading-rail]')).toHaveCount(0);
  });

  test('从文章列表点 EthanChang 进分栏首页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'index');
    await markReadingShell(page);

    await page.locator('header.site-nav a[href="/"]').click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expectKeptShell(page, 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
    await expect(page.locator('[data-reading-index]')).toBeVisible();
  });

  test('分栏点展开进入完整文章列表', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const index = page.locator('[data-reading-index]');
    const expand = index.locator('[data-reading-expand]');
    await expect(expand).toHaveAttribute('href', '/articles');
    await expect(expand).toHaveAttribute('aria-label', 'Open full index');
    await expect(expand).toHaveCSS('opacity', '0');
    await expect(page.locator('[data-reading-doc] [data-reading-expand]')).toHaveCount(0);
    await expect(index.locator('[data-reading-collapse]')).toBeHidden();
    await expect(page.locator('.reading-close-mark')).toHaveCount(0);

    await index.locator('[data-reading-index-switch] a').first().focus();
    await expect(expand).toHaveCSS('opacity', '1');
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.mouse.move(0, 0);
    await expect(expand).toHaveCSS('opacity', '0');

    await revealReadingExpand(index);
    await expectExpandAtHeadingEnd(index);
    await markReadingShell(page);
    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/articles');
    await expectKeptShell(page, 'index');
    await expectExpandedIndex(page, 'Articles');
  });

  test('分栏从项目展开进入完整项目列表', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects/aletheia');
    const index = page.locator('[data-reading-index]');
    const expand = await revealReadingExpand(index);
    await expect(expand).toHaveAttribute('href', '/projects');
    await expect(page.locator('[data-reading-doc] [data-reading-expand]')).toHaveCount(0);
    await markReadingShell(page);
    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/projects');
    await expectKeptShell(page, 'index');
    await expect(page.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  });

  test('左栏翻页后展开仍进完整文章列表', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const index = page.locator('[data-reading-index]');
    await index.getByRole('link', { name: 'Earlier' }).click();
    await expect(index.locator('a[href="/articles/dummy-2026-01"] h3')).toBeVisible();
    const expand = await revealReadingExpand(index);
    await expect(expand).toHaveAttribute('href', '/articles');
    await markReadingShell(page);

    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/articles');
    await expectKeptShell(page, 'index');
    await expect(index.locator('a[href="/articles/pkm-method"] h3')).toBeVisible();
  });

  test('左栏换成项目后展开进完整项目列表', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    await page
      .locator('[data-reading-index] [data-reading-index-switch]')
      .getByRole('link', { name: 'Projects' })
      .click();
    const index = page.locator('[data-reading-index]');
    await expect(index.getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
    const expand = await revealReadingExpand(index);
    await expect(expand).toHaveAttribute('href', '/projects');
    await markReadingShell(page);

    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/projects');
    await expectKeptShell(page, 'index');
  });

  test('首页展开打开完整文章列表', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    const index = page.locator('[data-reading-index]');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    const expand = await revealReadingExpand(index);
    await expect(expand).toHaveAttribute('href', '/articles');
    await expectExpandAtHeadingEnd(index);
    await markReadingShell(page);
    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/articles');
    await expectKeptShell(page, 'index');
  });

  test('文章页展开后再收起回到 About，不整页刷新', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    await markReadingShell(page);
    const expand = await revealReadingExpand(page.locator('[data-reading-index]'));
    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/articles');
    await expectKeptShell(page, 'index');
    await waitReadingLayoutSettled(page);

    const collapse = await revealReadingCollapse(page.locator('[data-reading-index]'));
    await collapse.click({ force: true });
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expectKeptShell(page, 'home');
    await expect(page.locator('[data-about-panel]')).toBeVisible();
    await expect(page.locator('[data-reading-index] [data-reading-expand]')).toHaveAttribute(
      'href',
      '/articles',
    );
    await expect(page.locator('[data-reading-index] [data-reading-collapse]')).toBeHidden();
  });

  test('展开后点文章|项目只换索引，不刷新', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    await markReadingShell(page);
    const expand = await revealReadingExpand(page.locator('[data-reading-index]'));
    await expand.click();
    await expectKeptShell(page, 'index');

    await page
      .locator('[data-reading-index] [data-reading-index-switch]')
      .getByRole('link', { name: 'Projects' })
      .click();
    await expect(page).toHaveURL((url) => url.pathname === '/projects');
    await expectKeptShell(page, 'index');
    await expect(page.locator('[data-reading-index]').getByRole('heading', { level: 1, name: 'Projects' })).toBeVisible();
  });

  test('展开尊重 reduced motion，立刻铺满', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const expand = await revealReadingExpand(page.locator('[data-reading-index]'));
    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/articles');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'index');
    const duration = await page.locator('[data-reading-shell]').evaluate((el) => getComputedStyle(el).transitionDuration);
    expect(duration.split(',').every((part) => part.trim() === '0s')).toBe(true);
    const indexWidth = await page.locator('[data-reading-index]').evaluate((el) => el.getBoundingClientRect().width);
    expect(indexWidth).toBeGreaterThan(600);
  });

  test('文章列表收起回到首页 About', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles');
    await markReadingShell(page);
    const collapse = await revealReadingCollapse(page.locator('[data-reading-index]'));
    await expect(collapse).toHaveAttribute('href', '/');
    await collapse.click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expectKeptShell(page, 'home');
    await expect(page.locator('[data-about-panel]')).toBeVisible();
    await expect(page.locator('[data-reading-index]')).toBeVisible();
    await expect(page.locator('[data-reading-index] [data-reading-expand]')).toHaveAttribute(
      'href',
      '/articles',
    );
    await expect(page.locator('[data-reading-index] [data-reading-collapse]')).toBeHidden();
  });

  test('项目列表收起回到首页 About', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/projects');
    await markReadingShell(page);
    const collapse = await revealReadingCollapse(page.locator('[data-reading-index]'));
    await expect(collapse).toHaveAttribute('href', '/');
    await collapse.click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expectKeptShell(page, 'home');
    await expect(page.locator('[data-about-panel]')).toBeVisible();
    await expect(page.locator('[data-reading-index]')).toBeVisible();
  });

  test('/zh/articles 收起指向 /zh', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/zh/articles');
    await markReadingShell(page);
    const collapse = await revealReadingCollapse(page.locator('[data-reading-index]'));
    await expect(collapse).toHaveAttribute('href', '/zh');
    await collapse.click();
    await expect(page).toHaveURL((url) => url.pathname === '/zh');
    await expectKeptShell(page, 'home');
    await expect(page.locator('[data-about-panel]')).toBeVisible();
    await expect(page.locator('[data-reading-index]')).toBeVisible();
  });

  test('Escape 关闭正文回到首页', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    await expect(page.locator('[data-reading-doc]')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'home');
    await expect(page.locator('[data-about-panel] h1')).toHaveText('Ethan Chang · 张峻源', inner);
  });
});

test.describe('分栏关闭（无 JS）', () => {
  test.use({ javaScriptEnabled: false });

  test('左栏卡片仍是指向文章的真实链接', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const card = page.locator('[data-reading-index] a[href="/articles/heptabase-method"]');
    await expect(card).toHaveAttribute('href', '/articles/heptabase-method');
    await card.click();
    await expect(page).toHaveURL(/\/articles\/heptabase-method\/?$/);
    await expect(page.locator('[data-reading-doc] .article-lede h1')).toBeVisible();
  });

  test('左栏标题钉在栏顶，年份从下方滚过', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await page.goto('/articles/pkm-method');

    const index = page.locator('[data-reading-index]');
    const heading = index.locator('.reading-index-heading');
    await expect(heading.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();

    const rest = await page.evaluate(() => {
      const pane = document.querySelector('[data-reading-index]');
      const bar = pane?.querySelector('.reading-index-heading');
      if (!(pane instanceof HTMLElement) || !(bar instanceof HTMLElement)) return null;
      const style = getComputedStyle(bar);
      return {
        sticky: style.position,
        paneTop: pane.getBoundingClientRect().top,
        headingTop: bar.getBoundingClientRect().top,
        padBottom: Number.parseFloat(style.paddingBottom),
        backgroundImage: style.backgroundImage,
      };
    });
    expect(rest).not.toBeNull();
    expect(rest!.sticky).toBe('sticky');
    expect(Math.abs(rest!.headingTop - rest!.paneTop)).toBeLessThan(1);
    expect(rest!.padBottom).toBeGreaterThanOrEqual(16);
    expect(rest!.backgroundImage).toMatch(/linear-gradient/i);

    const scrolled = await page.evaluate(() => {
      const pane = document.querySelector('[data-reading-index]');
      const bar = pane?.querySelector('.reading-index-heading');
      const year = pane?.querySelector('h2');
      if (
        !(pane instanceof HTMLElement) ||
        !(bar instanceof HTMLElement) ||
        !(year instanceof HTMLElement)
      ) {
        return null;
      }
      const yearTopBefore = year.getBoundingClientRect().top;
      pane.scrollTop = Math.min(240, pane.scrollHeight - pane.clientHeight);
      return {
        paneTop: pane.getBoundingClientRect().top,
        headingTop: bar.getBoundingClientRect().top,
        yearTopBefore,
        yearTopAfter: year.getBoundingClientRect().top,
        scrollTop: pane.scrollTop,
      };
    });
    expect(scrolled).not.toBeNull();
    expect(scrolled!.scrollTop).toBeGreaterThan(80);
    expect(Math.abs(scrolled!.headingTop - scrolled!.paneTop)).toBeLessThan(1);
    expect(scrolled!.yearTopAfter).toBeLessThan(scrolled!.yearTopBefore - 40);
  });

  test('展开是指向完整索引的真实链接', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles/pkm-method');
    const index = page.locator('[data-reading-index]');
    const expand = await revealReadingExpand(index);
    await expect(expand).toHaveAttribute('href', '/articles');
    await expect(page.locator('[data-reading-doc] [data-reading-expand]')).toHaveCount(0);
    await expand.click();
    await expect(page).toHaveURL((url) => url.pathname === '/articles');
    await expect(page.locator('[data-reading-shell]')).toHaveAttribute('data-reading-shell', 'index');
    await expect(page.getByRole('heading', { level: 1, name: 'Articles' })).toBeVisible();
  });

  test('收起是指向首页的真实链接', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/articles');
    const collapse = await revealReadingCollapse(page.locator('[data-reading-index]'));
    await expect(collapse).toHaveAttribute('href', '/');
    await collapse.click();
    await expect(page).toHaveURL((url) => url.pathname === '/');
    await expect(page.locator('[data-about-panel]')).toBeVisible();
    await expect(page.locator('[data-reading-index]')).toBeVisible();
  });
});
