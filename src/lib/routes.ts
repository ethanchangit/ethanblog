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

export function articleHref(id: string): string {
  return `${ARTICLES_PATH}/${id}`;
}

/**
 * Top-level paths the site already owns. A Heptabase URL may not take one of these.
 * Keep in sync with RESERVED_URLS in studio/online/card-properties.mjs.
 */
export const RESERVED_URLS = ['en', 'cn', 'now', 'tags', 'articles', 'projects', 'dashboard', 'contact', 'privacy', 'about', 'blogs', 'search', 'lab', 'for-agents', 'pages', 'zh', 'api', 'studio', 'index', 'rss', 'sitemap', 'robots', 'llms', 'llms-full', 'openapi', '404'] as const;

/** A Heptabase URL article is /<url> on its site (cn.ethanchang.io for Chinese, ethanchang.io for English). */
export function urlArticleHref(url: string): string {
  return `/${url}`;
}

export function projectHref(id: string): string {
  return `${PROJECTS_PATH}/${id}`;
}

/** Tag index query. Keeps the reader on /tags. `group=all` is omitted. */
export function tagsPageHref(opts: { tag?: string | null; group?: string | null } = {}): string {
  const params = new URLSearchParams();
  if (opts.group && opts.group !== 'all') params.set('group', opts.group);
  if (opts.tag) params.set('tag', opts.tag);
  const query = params.toString();
  return query ? `${TAGS_PATH}?${query}` : TAGS_PATH;
}

/** Tag index filtered to a label. Query keeps the reader on /tags. */
export function tagHref(tag: string): string {
  return tagsPageHref({ tag });
}
