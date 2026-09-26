import { getCollection, type CollectionEntry } from 'astro:content';
import { articleAliasRedirects, articleHref, findByDocIdentity, FIXED_PAGE_IDS, projectHref, reservedPathSegment, sitePageHref, urlArticleHref } from '@/lib/routes';

export { sitePageHref };

/** 哪份索引收录这条文档。与 topical `tags` 无关。 */
export type DocSlot = 'article' | 'project';
export type DocEntry = CollectionEntry<'articles'> | CollectionEntry<'projects'>;
type EntryLike = Pick<DocEntry, 'id' | 'data'>;

/** 译文（#blogi18n）存在原文旁边：articles/<id>/<language>.mdx。中文站不收录它们。 */
export function isTranslation(entry: EntryLike): boolean {
  return Boolean(entry.data.translationOf);
}

/** `<id>/en` is the translation file, not a different public path. */
export function translationSourceId(id: string): string {
  return id.replace(/\/[a-z]{2,3}$/, '');
}

/**
 * Path of a document on its own site. Chinese pages live on cn.ethanchang.io and English
 * translations on ethanchang.io at the same path: /<url> when the card sets URL, otherwise /<id>.
 */
export function docHref(entry: EntryLike): string {
  const id = isTranslation(entry) ? translationSourceId(entry.id) : entry.id;
  if (entry.data.slot === 'project') return projectHref(id);
  if (entry.data.url) return urlArticleHref(entry.data.url);
  return articleHref(id);
}

/** reference 不进文章列表、项目列表和站点页面。地址还在，提到它的链接不断。 */
export function isReference(entry: { data: { heptabaseType?: string | null } }): boolean {
  return entry.data.heptabaseType === 'reference';
}

/**
 * `/articles`、标签、RSS 收不收录。全文搜索单独包含所有已发布资料。
 * 默认：id 含 `/` 的是系列子文，不进索引。`listed: false` 可藏顶层文；`listed: true` 可把子文放进索引。
 */
export function isIndexed(entry: EntryLike): boolean {
  // Reference 有自己的地址，不进文章列表。没写类型的旧文仍视为 article。
  if (isReference(entry)) return false;
  if (isTranslation(entry)) return false;
  if (entry.data.listed === false) return false;
  if (entry.data.listed === true) return true;
  return !entry.id.includes('/');
}

/** Published English translations: the article list of ethanchang.io. */
export async function englishArticles(opts: { includeDrafts?: boolean } = {}): Promise<CollectionEntry<'articles'>[]> {
  return getCollection('articles', ({ data }) => Boolean(data.translationOf) && data.language === 'en' && (opts.includeDrafts || !data.draft));
}

/** English project pages. A project without a translation is not listed here. */
export async function englishProjects(opts: { includeDrafts?: boolean } = {}): Promise<CollectionEntry<'projects'>[]> {
  return getCollection('projects', ({ data }) => Boolean(data.translationOf) && data.language === 'en' && (opts.includeDrafts || !data.draft));
}

/** English site pages. The file id is `<source>/<language>`; the public path stays the source page's path. */
export async function englishPages(opts: { includeDrafts?: boolean } = {}): Promise<CollectionEntry<'pages'>[]> {
  return getCollection('pages', ({ data }) => Boolean(data.translationOf) && data.language === 'en' && (opts.includeDrafts || !data.draft));
}

/** The #blog card a translation belongs to. */
export async function translationSource(entry: EntryLike, opts: { includeDrafts?: boolean } = {}): Promise<DocEntry | undefined> {
  if (!entry.data.translationOf) return undefined;
  const collection = entry.data.slot === 'project' ? 'projects' : 'articles';
  return (await getCollection(collection, ({ data }) => !data.translationOf && (opts.includeDrafts || !data.draft)))
    .find((other) => other.data.heptabaseCardLink === entry.data.translationOf);
}

export type LanguageVersion = { lang: 'zh' | 'en'; label: string; href: string };

/**
 * Other language versions of an article that have a page: the Chinese source on
 * cn.ethanchang.io and the English translation on ethanchang.io. Missing ones are left out.
 */
export async function languageVersions(entry: DocEntry, opts: { includeDrafts?: boolean } = {}): Promise<LanguageVersion[]> {
  if (entry.data.slot !== 'article' && entry.data.slot !== 'project') return [];
  const source = isTranslation(entry) ? await translationSource(entry, opts) : entry;
  if (!source?.data.heptabaseCardLink) return [];
  const englishPool = entry.data.slot === 'project' ? await englishProjects(opts) : await englishArticles(opts);
  const english = englishPool.find((other) => other.data.translationOf === source.data.heptabaseCardLink);
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
    getCollection('projects', ({ data }) => !data.translationOf && (opts.includeDrafts || !data.draft)),
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
  return findByDocIdentity(entries, id, (item) => ({
    id: item.id,
    url: item.data.url,
    aliases: item.data.aliases,
  }));
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
  const entry = findByDocIdentity(entries, id, (item) => ({
    id: item.id,
    url: 'url' in item.data ? item.data.url : null,
    aliases: 'aliases' in item.data ? item.data.aliases : null,
  }));
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

export type PublicRoute =
  | { path: string; kind: 'article'; article: CollectionEntry<'articles'> }
  | { path: string; kind: 'project'; project: CollectionEntry<'projects'> }
  | { path: string; kind: 'page'; page: CollectionEntry<'pages'> }
  | { path: string; kind: 'redirect'; target: string };

function claimPublicPath(owners: Map<string, string>, path: string, label: string): void {
  const reserved = reservedPathSegment(path);
  if (reserved) throw new Error(`「${label}」的地址 /${path} 与网站固定地址 /${reserved} 冲突。`);
  const previous = owners.get(path);
  if (previous) throw new Error(`地址 /${path} 同时被「${previous}」和「${label}」使用。`);
  owners.set(path, label);
}

/** 中文站根路径上的文章、项目和站点页。固定地址和重复 slug 在构建时拒绝。 */
export async function publicContentRoutes(opts: { includeDrafts?: boolean } = {}): Promise<PublicRoute[]> {
  const [articles, projects, pages] = await Promise.all([
    docsBySlot('article', opts),
    docsBySlot('project', opts),
    getCollection(
      'pages',
      ({ id, data }) => !data.translationOf && !FIXED_PAGE_IDS.has(id) && (opts.includeDrafts || !data.draft),
    ),
  ]);
  const routes: PublicRoute[] = [];
  const owners = new Map<string, string>();
  for (const article of articles) {
    if (/^\d+$/.test(article.id)) continue;
    const path = docHref(article).replace(/^\//, '');
    claimPublicPath(owners, path, article.data.title);
    routes.push({ path, kind: 'article', article: article as CollectionEntry<'articles'> });
    if (article.id !== path) {
      claimPublicPath(owners, article.id, `${article.data.title} 的文件名`);
      routes.push({ path: article.id, kind: 'redirect', target: `/${path}` });
    }
    for (const alias of articleAliasRedirects(article.id, article.data)) {
      claimPublicPath(owners, alias, `${article.data.title} 的旧地址`);
      routes.push({ path: alias, kind: 'redirect', target: `/${path}` });
    }
  }
  for (const project of projects) {
    const path = docHref(project).replace(/^\//, '');
    claimPublicPath(owners, path, project.data.title);
    routes.push({ path, kind: 'project', project: project as CollectionEntry<'projects'> });
  }
  for (const page of pages) {
    const path = sitePageHref(page.id).replace(/^\//, '');
    if (!path) continue;
    claimPublicPath(owners, path, page.data.title);
    routes.push({ path, kind: 'page', page });
  }
  return routes;
}

export async function resolvePublicPath(
  path: string,
  opts: { includeDrafts?: boolean } = {},
): Promise<PublicRoute | undefined> {
  const normalized = path.replace(/^\/+|\/+$/g, '');
  return (await publicContentRoutes(opts)).find((route) => route.path === normalized);
}
