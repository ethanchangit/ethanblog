import { formatDate } from '@/lib/format';
import { docHref, docsBySlot, isIndexed, type DocEntry } from '@/lib/docs';

export type PublishedArticle = DocEntry;

export const ARTICLES_PER_PAGE = 7;

export async function publishedArticles(): Promise<PublishedArticle[]> {
  return (await docsBySlot('article'))
    .filter(isIndexed)
    .sort((a, b) => {
      const byDate = (b.data.date?.valueOf() ?? 0) - (a.data.date?.valueOf() ?? 0);
      if (byDate !== 0) return byDate;
      return a.id.localeCompare(b.id);
    });
}

export function articleYear(date: Date): number {
  return date.getUTCFullYear();
}

export function paginateArticles<T>(items: T[], page: number, perPage = ARTICLES_PER_PAGE) {
  const totalPages = Math.max(1, Math.ceil(items.length / perPage));
  const current = Math.min(Math.max(1, page), totalPages);
  const start = (current - 1) * perPage;
  return {
    items: items.slice(start, start + perPage),
    page: current,
    totalPages,
    hasPrev: current > 1,
    hasNext: current < totalPages,
  };
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
    titleEn: entry.data.titleEn,
    description: entry.data.description,
    descriptionEn: entry.data.descriptionEn,
    meta: undefined as string | undefined,
    metaEn: undefined as string | undefined,
    tags: entry.data.tags,
  };
}

export function articleCardProps(entry: PublishedArticle) {
  const date = entry.data.date;
  if (!date) {
    throw new Error(`slot: article 条目缺少 date：${entry.id}`);
  }
  const dateZh = formatDate(date, 'zh-CN');
  const dateEn = formatDate(date, 'en');
  return {
    href: docHref(entry),
    title: entry.data.title,
    titleEn: entry.data.titleEn,
    description: entry.data.description,
    descriptionEn: entry.data.descriptionEn,
    meta: dateZh,
    metaEn: dateEn,
    tags: entry.data.tags,
    haystack: [entry.data.title, entry.data.titleEn ?? '', ...entry.data.tags]
      .join('\n')
      .toLowerCase(),
  };
}
