import { docsBySlot, includeDraftsInDev } from '@/lib/docs';
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
  'for-agents',
] as const;

/** Rest paths under `/zh/…` that should rewrite to the unprefixed English page. */
export async function zhRestPaths(): Promise<string[]> {
  const [articles, indexed, projects] = await Promise.all([
    docsBySlot('article', { includeDrafts: includeDraftsInDev }),
    publishedArticles(),
    docsBySlot('project', { includeDrafts: includeDraftsInDev }),
  ]);
  const paths = new Set<string>(STATIC_SEGMENTS);

  for (const article of articles) {
    if (/^\d+$/.test(article.id)) continue;
    paths.add(`articles/${article.id}`);
  }
  for (const project of projects) {
    paths.add(`projects/${project.id}`);
  }
  for (const tag of uniqueTags(indexed)) {
    paths.add(`tags/${tag}`);
  }
  return [...paths];
}
