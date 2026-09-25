import { getCollection } from 'astro:content';
import { docHref, docsBySlot, includeDraftsInDev, sitePageHref } from '@/lib/docs';
import { publishedArticles, uniqueTags } from '@/lib/tags';

const STATIC_SEGMENTS = [
  'articles',
  'projects',
  'blogs',
  'now',
  'search',
  'tags',
  'lab',
  '404',
  'contact',
  'privacy',
  'about',
  'for-agents',
] as const;

/** Rest paths under `/zh/…` that should rewrite to the unprefixed English page. */
export async function zhRestPaths(): Promise<string[]> {
  const [articles, indexed, projects, sitePages] = await Promise.all([
    docsBySlot('article', { includeDrafts: includeDraftsInDev }),
    publishedArticles(),
    docsBySlot('project', { includeDrafts: includeDraftsInDev }),
    getCollection('pages', ({ id, data }) => !['blogs', 'about', 'now', 'contact', 'privacy'].includes(id) && !data.translationOf && (includeDraftsInDev || !data.draft)),
  ]);
  const paths = new Set<string>(STATIC_SEGMENTS);

  for (const article of articles) {
    if (/^\d+$/.test(article.id)) continue;
    paths.add(`articles/${article.id}`);
    paths.add(docHref(article).replace(/^\//, ''));
  }
  for (const project of projects) {
    paths.add(`projects/${project.id}`);
    paths.add(docHref(project).replace(/^\//, ''));
  }
  for (const page of sitePages) {
    paths.add(`pages/${page.id}`);
    const href = sitePageHref(page.id);
    if (href !== '/') paths.add(href.replace(/^\//, ''));
  }
  for (const tag of uniqueTags(indexed)) {
    paths.add(`tags/${tag}`);
  }
  return [...paths];
}
