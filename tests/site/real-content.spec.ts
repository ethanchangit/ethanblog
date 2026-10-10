import { test, expect, type APIRequestContext } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import { pageOrder } from '../../src/data/page-order';

// Runs against dist/, the real content that gets deployed (project "site").
// Dashboard publishes add, rename and take down pages, so nothing here names a title, a count or a slug.

const ORIGIN = /^https?:\/\/(?:www\.|cn\.)?ethanchang\.io/;

async function sitemapPaths(request: APIRequestContext): Promise<string[]> {
  const xml = await (await request.get('/sitemap.xml')).text();
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname);
}

function internalLinks(html: string): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*\bhref="([^"#]+)/gi)) {
    let href = m[1].replace(/&amp;/g, '&');
    if (ORIGIN.test(href)) href = href.replace(ORIGIN, '') || '/';
    if (!href.startsWith('/') || href.startsWith('//')) continue;
    out.add(href.split('#')[0]);
  }
  return [...out];
}

/** Same filter as Nav.astro: a published site page that is not a translation and not a reference page. */
function published(id: string): boolean {
  const file = `src/content/pages/${id}.mdx`;
  if (id === 'blogs' || !existsSync(file)) return false;
  const frontmatter = readFileSync(file, 'utf8').split(/^---\s*$/m)[1] ?? '';
  const field = (key: string) => new RegExp(`^${key}:\\s*["']?([^"'\\n]*)["']?\\s*$`, 'm').exec(frontmatter)?.[1]?.trim();
  return field('draft') !== 'true' && !field('translationOf') && field('heptabaseType') !== 'reference';
}

test('every sitemap page answers 200 and every internal link on it resolves', async ({ request }) => {
  const paths = await sitemapPaths(request);
  expect(paths.length).toBeGreaterThan(0);
  const links = new Map<string, string>();
  for (const path of paths) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    for (const href of internalLinks(await response.text())) if (!links.has(href)) links.set(href, path);
  }
  const broken: string[] = [];
  for (const [href, from] of links) {
    if (href.startsWith('/dashboard') || href.startsWith('/api/')) continue;
    const response = await request.get(href);
    if (response.status() >= 400) broken.push(`${href} (${response.status()}) on ${from}`);
  }
  expect(broken).toEqual([]);
});

test('llms.txt lists only pages that exist', async ({ request }) => {
  const text = await (await request.get('/llms.txt')).text();
  const hrefs = [...text.matchAll(/\]\((https?:\/\/ethanchang\.io[^)\s]*)\)/g)].map((m) => new URL(m[1]).pathname);
  expect(hrefs.length).toBeGreaterThan(0);
  for (const path of new Set(hrefs)) expect((await request.get(path)).status(), path).toBe(200);
});

test('nav stations follow page-order.ts, limited to published pages', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const stations = await page.locator('header.site-nav [data-page-station]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-page-station')),
  );
  expect(stations).toEqual(pageOrder.filter(published).slice(0, 4));
});

test('the footer reaches About and Blog', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const footer = page.getByRole('contentinfo');
  for (const [name, path] of [['About', '/about'], ['Blog', '/blogs']] as const) {
    const response = await page.request.get(await footer.getByRole('link', { name, exact: true }).getAttribute('href') ?? '');
    expect(response.status(), path).toBe(200);
    expect(new URL(response.url()).pathname.replace(/\/$/, ''), path).toBe(path);
  }
});
