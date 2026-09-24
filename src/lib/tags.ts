import { formatDate } from '@/lib/format';
import { docHref, docsBySlot, englishArticles, isIndexed, type DocEntry } from '@/lib/docs';

export type PublishedArticle = DocEntry;

export async function publishedArticles(): Promise<PublishedArticle[]> {
  return (await docsBySlot('article'))
    .filter(isIndexed)
    .sort((a, b) => {
      const byDate = (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });
}

const byDateDesc = (a: DocEntry, b: DocEntry) => (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0) || a.id.localeCompare(b.id);

/** Published English translations. ethanchang.io lists these only. */
export async function englishSiteArticles(): Promise<PublishedArticle[]> {
  return (await englishArticles()).sort(byDateDesc);
}

/**
 * English tag index. Tags stay on the Chinese source card. Only indexed articles that
 * have an English translation are listed; a Chinese-only article is left out.
 */
export async function englishTaggedArticles(): Promise<PublishedArticle[]> {
  const [english, sources] = await Promise.all([englishArticles(), publishedArticles()]);
  const byLink = new Map(
    sources.flatMap((entry) => (entry.data.heptabaseCardLink ? [[entry.data.heptabaseCardLink, entry] as const] : [])),
  );
  const paired: PublishedArticle[] = [];
  for (const entry of english) {
    const source = entry.data.translationOf ? byLink.get(entry.data.translationOf) : undefined;
    if (!source) continue;
    paired.push({ ...entry, data: { ...entry.data, tags: source.data.tags, date: entry.data.date ?? source.data.date } });
  }
  return paired.sort(byDateDesc);
}

export function articleYear(date: Date): number {
  return date.getUTCFullYear();
}

export function groupArticlesByYear(articles: PublishedArticle[]): { year: number; items: PublishedArticle[] }[] {
  const groups: { year: number; items: PublishedArticle[] }[] = [];
  for (const entry of articles) {
    const date = entry.data.date;
    if (!date) continue;
    const year = articleYear(date);
    const last = groups[groups.length - 1];
    if (last?.year === year) last.items.push(entry);
    else groups.push({ year, items: [entry] });
  }
  return groups;
}

export function uniqueTags(articles: PublishedArticle[]): string[] {
  return [...new Set(articles.flatMap((entry) => entry.data.tags).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, 'zh-CN')
  );
}

export function articlesWithTag(articles: PublishedArticle[], tag: string): PublishedArticle[] {
  return articles.filter((entry) => entry.data.tags.includes(tag));
}

export function docCardProps(entry: DocEntry) {
  if (entry.data.slot === 'article') return articleCardProps(entry);
  return {
    href: docHref(entry),
    title: entry.data.title,
    description: entry.data.description,
    meta: undefined as string | undefined,
    tags: entry.data.tags,
  };
}

export function articleCardProps(entry: PublishedArticle, lang: 'zh-CN' | 'en' = 'zh-CN') {
  const date = entry.data.date;
  if (!date) {
    throw new Error(`slot: article 条目缺少 date：${entry.id}`);
  }
  const dateZh = formatDate(date, lang);
  return {
    href: docHref(entry),
    title: entry.data.title,
    description: entry.data.description,
    meta: dateZh,
    tags: entry.data.tags,
    haystack: [entry.data.title, ...entry.data.tags]
      .join('\n')
      .toLowerCase(),
  };
}
