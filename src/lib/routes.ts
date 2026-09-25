export const HOME_PATH = '/';
export const ARTICLES_PATH = '/articles';
export const PROJECTS_PATH = '/projects';
export const BLOGS_PATH = '/blogs';
export const TAGS_PATH = '/tags';
export const SEARCH_PATH = '/search';
export const NOW_PATH = '/now';
export const CONTACT_PATH = '/contact';
export const PRIVACY_PATH = '/privacy';
export const FOR_AGENTS_PATH = '/for-agents';

/** 单篇文章的公开地址。系列子文的 id 含 `/`，例如 `/series-demo/1`。 */
export function articleHref(id: string): string {
  return `/${id}`;
}

/**
 * Top-level paths the site already owns. A Heptabase URL may not take one of these.
 * Keep in sync with RESERVED_URLS in studio/online/card-properties.mjs.
 */
export const RESERVED_URLS = ['en', 'cn', 'now', 'tags', 'articles', 'projects', 'dashboard', 'contact', 'privacy', 'about', 'blogs', 'search', 'for-agents', 'pages', 'zh', 'api', 'studio', 'index', 'rss', 'sitemap', 'robots', 'llms', 'llms-full', 'openapi', '404'] as const;

/** A Heptabase URL is /<url> on its site (cn.ethanchang.io for Chinese, ethanchang.io for English). */
export function urlArticleHref(url: string): string {
  return `/${url}`;
}

/** 单个项目的公开地址。 */
export function projectHref(id: string): string {
  return `/${id}`;
}

/** Now、联系、隐私、关于和博客目录用固定地址。关于在 `/about`，首页 `/` 是文章列表。其余站点页是 `/<id>`。译文 id 的语言后缀不进地址。 */
export function sitePageHref(id: string): string {
  const source = id.replace(/\/[a-z]{2,3}$/, '');
  return `/${source}`;
}

/** 公开路径的第一段如果是固定地址，返回那段；否则返回空。 */
export function reservedPathSegment(publicPath: string): string | null {
  const segment = publicPath.replace(/^\/+|\/+$/g, '').split('/')[0] ?? '';
  if (segment && (RESERVED_URLS as readonly string[]).includes(segment)) return segment;
  return null;
}

const FIXED_PAGE_LIST = ['about', 'now', 'contact', 'privacy', 'blogs'] as const;

/** 这些站点页有自己的页面文件，不由根路径catchall再生成一次。 */
export const FIXED_PAGE_IDS = new Set<string>(FIXED_PAGE_LIST);

/**
 * 旧的单篇地址。`/articles`、`/projects` 列表以及 `/articles/1` 这类分页不在这里。
 * 返回同一站点上的新路径。
 */
export function legacyContentRedirect(pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  const article = /^\/articles\/(.+)$/.exec(path);
  if (article) {
    if (/^\d+$/.test(article[1])) return null;
    return `/${article[1]}`;
  }
  const project = /^\/projects\/(.+)$/.exec(path);
  if (project) return `/${project[1]}`;
  const page = /^\/pages\/(.+)$/.exec(path);
  if (page) return sitePageHref(page[1]);
  return null;
}

/** Tag index query. Keeps the reader on /tags. */
export function tagsPageHref(opts: { tag?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (opts.tag) params.set('tag', opts.tag);
  const query = params.toString();
  return query ? `${TAGS_PATH}?${query}` : TAGS_PATH;
}

/** Tag index filtered to a label. Query keeps the reader on /tags. */
export function tagHref(tag: string): string {
  return tagsPageHref({ tag });
}
