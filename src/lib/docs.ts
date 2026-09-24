import { getCollection, type CollectionEntry } from 'astro:content';
import { articleHref, projectHref, urlArticleHref } from '@/lib/routes';

/** 哪份索引收录这条文档。与 topical `tags` 无关。 */
export type DocSlot = 'article' | 'project';
export type DocEntry = CollectionEntry<'articles'> | CollectionEntry<'projects'>;
type EntryLike = Pick<DocEntry, 'id' | 'data'>;

/** 译文（#blogi18n）存在原文旁边：articles/<id>/<language>.mdx。中文站不收录它们。 */
export function isTranslation(entry: EntryLike): boolean {
  return Boolean(entry.data.translationOf);
}

/**
 * Path of a document on its own site. Chinese articles live on cn.ethanchang.io and their
 * translations on ethanchang.io at the same path: /<url>, or /articles/<id> without URL.
 */
export function docHref(entry: EntryLike): string {
  if (entry.data.slot === 'project') return projectHref(entry.id);
  if (entry.data.url) return urlArticleHref(entry.data.url);
  return articleHref(isTranslation(entry) ? entry.id.replace(/\/[a-z]{2,3}$/, '') : entry.id);
}

/**
 * `/articles`、标签、RSS 收不收录。全文搜索单独包含所有已发布资料。
 * 默认：id 含 `/` 的是系列子文，不进索引。`listed: false` 可藏顶层文；`listed: true` 可把子文放进索引。
 */
export function isIndexed(entry: EntryLike): boolean {
  // Reference 有自己的地址，不进文章列表。没写类型的旧文仍视为 article。
  if (entry.data.heptabaseType === 'reference') return false;
  if (isTranslation(entry)) return false;
  if (entry.data.listed === false) return false;
  if (entry.data.listed === true) return true;
  return !entry.id.includes('/');
}

/** Published English translations: the article list of ethanchang.io. */
export async function englishArticles(opts: { includeDrafts?: boolean } = {}): Promise<CollectionEntry<'articles'>[]> {
  return getCollection('articles', ({ data }) => Boolean(data.translationOf) && data.language === 'en' && (opts.includeDrafts || !data.draft));
}

/** The #blog article a translation belongs to. */
export async function translationSource(entry: EntryLike, opts: { includeDrafts?: boolean } = {}): Promise<CollectionEntry<'articles'> | undefined> {
  if (!entry.data.translationOf) return undefined;
  return (await getCollection('articles', ({ data }) => !data.translationOf && (opts.includeDrafts || !data.draft)))
    .find((other) => other.data.heptabaseCardLink === entry.data.translationOf);
}

export type LanguageVersion = { lang: 'zh' | 'en'; label: string; href: string };

/**
 * Other language versions of an article that have a page: the Chinese source on
 * cn.ethanchang.io and the English translation on ethanchang.io. Missing ones are left out.
 */
export async function languageVersions(entry: DocEntry, opts: { includeDrafts?: boolean } = {}): Promise<LanguageVersion[]> {
  if (entry.data.slot !== 'article') return [];
  const source = isTranslation(entry) ? await translationSource(entry, opts) : entry;
  if (!source?.data.heptabaseCardLink) return [];
  const english = (await englishArticles(opts)).find((other) => other.data.translationOf === source.data.heptabaseCardLink);
  const versions: LanguageVersion[] = [];
  if (isTranslation(entry)) versions.push({ lang: 'zh', label: '中文', href: docHref(source) });
  else if (english) versions.push({ lang: 'en', label: 'English', href: docHref(english) });
  return versions;
}

/** `tutorial/1` → `tutorial`。顶层文章没有父级。译文 `<id>/en` 不是系列子文。 */
export function seriesParentId(id: string): string | undefined {
  if (/\/[a-z]{2,3}$/.test(id)) return undefined;
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
    // Translations belong to the English site; every Chinese list, index and feed skips them.
    getCollection('articles', ({ data }) => !data.translationOf && (opts.includeDrafts || !data.draft)),
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

/** `astro dev` 收录草稿，方便本机看未发布页面；生产构建仍排除。 */
export const includeDraftsInDev = import.meta.env.DEV;

export async function findDoc(
  collection: 'articles',
  id: string,
  opts?: { includeDrafts?: boolean },
): Promise<CollectionEntry<'articles'> | undefined>;
export async function findDoc(
  collection: 'projects',
  id: string,
  opts?: { includeDrafts?: boolean },
): Promise<CollectionEntry<'projects'> | undefined>;
export async function findDoc(
  collection: 'articles' | 'projects',
  id: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<DocEntry | undefined> {
  const entries = await getCollection(
    collection,
    ({ data }) => !('translationOf' in data && data.translationOf) && (opts.includeDrafts || !data.draft),
  );
  return entries.find((item) => item.id === id);
}


/** MDX `<DocRef of="articles/pkm-method" />` / `projects/aletheia`。 */
export function parseDocRef(of: string): { collection: 'articles' | 'projects'; id: string } {
  const trimmed = of.trim().replace(/^\/+/, '');
  const match = /^(articles|projects)\/(.+)$/.exec(trimmed);
  if (!match) {
    throw new Error(`DocRef of="${of}" 应为 articles/<id> 或 projects/<id>`);
  }
  return { collection: match[1] as 'articles' | 'projects', id: match[2] };
}

export async function resolveDocRef(
  of: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<DocEntry> {
  const { collection, id } = parseDocRef(of);
  const entries = await getCollection(
    collection,
    opts.includeDrafts ? undefined : ({ data }) => !data.draft,
  );
  const entry = entries.find((item) => item.id === id);
  if (!entry) {
    throw new Error(`DocRef 找不到 ${of}`);
  }
  return entry;
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
