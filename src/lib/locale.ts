/**
 * URL-level locale. English stays unprefixed; Chinese is `/zh` and `/zh/…`
 * so a shared link opens the Chinese site without relying on localStorage.
 */

export const ZH_PREFIX = '/zh';
export type UrlLocale = 'en' | 'zh';

const LOCALIZABLE_PREFIXES = [
  '/articles',
  '/projects',
  '/blogs',
  '/tags',
  '/search',
  '/now',
  '/lab',
  '/about',
  '/contact',
  '/privacy',
  '/for-agents',
] as const;

export function isZhPath(pathname: string): boolean {
  return pathname === ZH_PREFIX || pathname === `${ZH_PREFIX}/` || pathname.startsWith(`${ZH_PREFIX}/`);
}

export function localeFromPath(pathname: string): UrlLocale {
  return isZhPath(pathname) ? 'zh' : 'en';
}

export function langFromPath(pathname: string): 'zh-CN' | 'en' {
  return isZhPath(pathname) ? 'zh-CN' : 'en';
}

export function stripLocalePrefix(pathname: string): string {
  if (pathname === ZH_PREFIX || pathname === `${ZH_PREFIX}/`) return '/';
  if (pathname.startsWith(`${ZH_PREFIX}/`)) {
    const rest = pathname.slice(ZH_PREFIX.length);
    return rest.startsWith('/') ? rest : `/${rest}`;
  }
  return pathname;
}

export function pagePath(pathname: string): string {
  return stripLocalePrefix(pathname.replace(/\/+$/, '') || '/');
}

export function withLocalePrefix(pathname: string, locale: string | undefined): string {
  const path = stripLocalePrefix(pathname || '/');
  const zh = locale === 'zh' || locale === 'zh-CN';
  if (!zh) return path;
  return path === '/' ? ZH_PREFIX : `${ZH_PREFIX}${path}`;
}

export function isLocalizablePath(pathname: string): boolean {
  const path = pagePath(pathname);
  if (path === '/') return true;
  return LOCALIZABLE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function localizeHref(href: string, locale: string | undefined): string {
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return href;
  }
  if (href.startsWith('http://') || href.startsWith('https://') || href.startsWith('//')) {
    return href;
  }
  if (!href.startsWith('/')) return href;

  const hashIndex = href.indexOf('#');
  const searchIndex = href.indexOf('?');
  let pathEnd = href.length;
  if (searchIndex >= 0) pathEnd = Math.min(pathEnd, searchIndex);
  if (hashIndex >= 0) pathEnd = Math.min(pathEnd, hashIndex);
  const path = href.slice(0, pathEnd);
  const rest = href.slice(pathEnd);
  if (!isLocalizablePath(path)) return href;
  return withLocalePrefix(path, locale) + rest;
}

export function localeHrefForLang(pathname: string, lang: 'zh-CN' | 'en'): string {
  return withLocalePrefix(pathname, lang === 'zh-CN' ? 'zh' : 'en');
}
