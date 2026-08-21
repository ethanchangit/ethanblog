import { getCollection, type CollectionEntry } from 'astro:content';
import { articleHref, projectHref } from '@/lib/routes';

/** 哪份索引收录这条文档。与 topical `tags` 无关。 */
export type DocSlot = 'article' | 'project';
export type DocEntry = CollectionEntry<'articles'> | CollectionEntry<'projects'>;

export function docHref(entry: Pick<DocEntry, 'id' | 'data'>): string {
  return entry.data.slot === 'project' ? projectHref(entry.id) : articleHref(entry.id);
}

/**
 * `/articles`、标签、搜索、RSS 收不收录。
 * 默认：id 含 `/` 的是系列子文，不进索引。`listed: false` 可藏顶层文；`listed: true` 可把子文放进索引。
 */
export function isIndexed(entry: Pick<DocEntry, 'id' | 'data'>): boolean {
  if (entry.data.listed === false) return false;
  if (entry.data.listed === true) return true;
  return !entry.id.includes('/');
}

/** `tutorial/1` → `tutorial`。顶层文章没有父级。 */
export function seriesParentId(id: string): string | undefined {
  const slash = id.lastIndexOf('/');
  return slash === -1 ? undefined : id.slice(0, slash);
}

export function sortSeriesChapters(entries: DocEntry[]): DocEntry[] {
  return [...entries].sort((a, b) => {
    const byOrder = a.data.order - b.data.order;
    if (byOrder !== 0) return byOrder;
    return a.id.localeCompare(b.id);
  });
}

export async function loadDocs(opts: { includeDrafts?: boolean } = {}): Promise<DocEntry[]> {
  const [articles, projects] = await Promise.all([
    getCollection('articles', opts.includeDrafts ? undefined : ({ data }) => !data.draft),
    getCollection('projects', opts.includeDrafts ? undefined : ({ data }) => !data.draft),
  ]);
  return [...articles, ...projects];
}

export async function docsBySlot(
  slot: DocSlot,
  opts: { includeDrafts?: boolean } = {},
): Promise<DocEntry[]> {
  return (await loadDocs(opts)).filter((entry) => entry.data.slot === slot);
}

export type SeriesContext = {
  currentId: string;
  hub: DocEntry | undefined;
  chapters: DocEntry[];
  prev: DocEntry | undefined;
  next: DocEntry | undefined;
  isHub: boolean;
  isChapter: boolean;
};

export async function seriesContext(
  entry: DocEntry,
  opts: { includeDrafts?: boolean } = {},
): Promise<SeriesContext> {
  const parentId = seriesParentId(entry.id);
  const hubId = parentId ?? entry.id;
  const articles = await docsBySlot('article', opts);
  const hub = articles.find((article) => article.id === hubId);
  const chapters = sortSeriesChapters(
    articles.filter((article) => seriesParentId(article.id) === hubId),
  );
  const index = chapters.findIndex((chapter) => chapter.id === entry.id);
  return {
    currentId: entry.id,
    hub: hub ?? (!parentId ? entry : undefined),
    chapters,
    prev: index > 0 ? chapters[index - 1] : undefined,
    next: index >= 0 && index < chapters.length - 1 ? chapters[index + 1] : undefined,
    isHub: !parentId && chapters.length > 0,
    isChapter: Boolean(parentId),
  };
}
