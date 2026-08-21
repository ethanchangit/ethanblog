export const HOME_PATH = '/';
export const ARTICLES_PATH = '/articles';
export const PROJECTS_PATH = '/projects';
export const TAGS_PATH = '/tags';
export const SEARCH_PATH = '/search';

export function articleHref(id: string): string {
  return `${ARTICLES_PATH}/${id}`;
}

/** Page 1 is `/articles`; later pages are static `/articles/2`, `/articles/3`, … */
export function articlesPageHref(page: number): string {
  return page <= 1 ? ARTICLES_PATH : `${ARTICLES_PATH}/${page}`;
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
