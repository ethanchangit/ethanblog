import { docsBySlot } from '@/lib/docs';
import { ARTICLES_PER_PAGE, publishedArticles, uniqueTags } from '@/lib/tags';

const STATIC_SEGMENTS = ['articles', 'projects', 'now', 'search', 'tags', 'lab', '404'] as const;

/** Rest paths under `/zh/…` that should rewrite to the unprefixed English page. */
export async function zhRestPaths(): Promise<string[]> {
  const [articles, indexed, projects] = await Promise.all([
    docsBySlot('article'),
    publishedArticles(),
    docsBySlot('project'),
  ]);
  const totalPages = Math.max(1, Math.ceil(indexed.length / ARTICLES_PER_PAGE));
  const paths = new Set<string>(STATIC_SEGMENTS);

  for (let page = 2; page <= totalPages; page++) {
    paths.add(`articles/${page}`);
  }
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
