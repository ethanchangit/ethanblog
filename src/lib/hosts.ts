/**
 * One English blog, built at the root of dist/ and served on ethanchang.io.
 * cn.ethanchang.io, en.localhost, /en and /zh redirect to that same path.
 * /_lang/<zh|en> stays on this host; there is no second site.
 *
 * Used by scripts/cf-worker-entry.mjs, scripts/preview.mjs and the dev middleware.
 */
import { isZhPath, stripLocalePrefix } from './locale.ts';
import { legacyContentRedirect } from './routes.ts';

export const ZH_ORIGIN = 'https://cn.ethanchang.io';
export const EN_ORIGIN = 'https://ethanchang.io';
export const EN_PREFIX = '/en';
export type SiteLang = 'zh' | 'en';

/** Served as-is on both hosts: assets, APIs and machine files. */
const SHARED = /^\/(?:_astro|media|demos|api|\.well-known|_image)(?:\/|$)|^\/(?:favicon\.svg|og-default\.svg|robots\.txt|__studio-release\.json|_routes\.json)$/;

export function isEnglishBuildPath(pathname: string): boolean {
  return pathname === EN_PREFIX || pathname.startsWith(`${EN_PREFIX}/`);
}

/** /en/toolset -> /toolset */
export function englishPublicPath(buildPath: string): string {
  return isEnglishBuildPath(buildPath) ? buildPath.slice(EN_PREFIX.length) || '/' : buildPath;
}

function hostname(host: string): string {
  return host.replace(/:\d+$/, '').toLowerCase();
}

export function hostLang(_host: string): SiteLang {
  return 'en';
}

/** Host of the other language, keeping the port (en.localhost:4321 <-> localhost:4321). */
export function hostFor(lang: SiteLang, host: string): string {
  const name = hostname(host), port = host.slice(name.length);
  if (name === 'ethanchang.io' || name === 'www.ethanchang.io' || name === 'cn.ethanchang.io') {
    return lang === 'en' ? 'ethanchang.io' : 'cn.ethanchang.io';
  }
  if (lang === 'en') return name.startsWith('en.') ? host : `en.${name}${port}`;
  return name.startsWith('en.') ? `${name.slice(3)}${port}` : host;
}

/** Link that switches to the same page in another language. */
export function languageSwitchHref(lang: SiteLang, publicPath: string): string {
  return `/_lang/${lang}${publicPath === '/' ? '/' : publicPath}`;
}

export type HostDecision =
  | { type: 'pass' }
  | { type: 'rewrite'; path: string }
  | { type: 'redirect'; location: string; status: 301 | 302 };

/**
 * What to do with a request. The public site is one English blog.
 * Old hosts and prefixes redirect onto the same path.
 */
export function routeRequest(url: URL): HostDecision {
  const { pathname, search, host, protocol } = url;
  const name = hostname(host);
  const port = host.slice(name.length);
  const here = (path: string): HostDecision => ({
    type: 'redirect', location: `${protocol}//${host}${path}${search}`, status: 301,
  });
  const canonicalName = name === 'www.ethanchang.io' || name === 'cn.ethanchang.io'
    ? 'ethanchang.io'
    : name.startsWith('en.') ? name.slice(3) : name;
  if (SHARED.test(pathname) || pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    if (canonicalName !== name) {
      return { type: 'redirect', location: `${protocol}//${canonicalName}${port}${pathname}${search}`, status: 301 };
    }
    return { type: 'pass' };
  }
  let path = pathname;
  const switchMatch = /^\/_lang\/(?:zh|en)(\/.*)?$/.exec(path);
  if (switchMatch) path = switchMatch[1] || '/';
  if (isEnglishBuildPath(path)) path = englishPublicPath(path);
  if (isZhPath(path)) path = stripLocalePrefix(path);
  const legacy = legacyContentRedirect(path);
  if (legacy) path = legacy;
  if (canonicalName !== name) {
    return { type: 'redirect', location: `${protocol}//${canonicalName}${port}${path}${search}`, status: 301 };
  }
  if (path !== pathname) return here(path);
  return { type: 'pass' };
}

/** A missing page stays on the English site. */
export function fallbackFor(url: URL): string {
  return `${EN_ORIGIN}${url.pathname}${url.search}`;
}

/** Canonical URL of a built page. Old /en and /zh prefixes are not part of it. */
export function canonicalUrl(buildPath: string): string {
  const path = isEnglishBuildPath(buildPath) ? englishPublicPath(buildPath) : stripLocalePrefix(buildPath);
  return new URL(path, EN_ORIGIN).href;
}

/** Absolute URL of a public path on one language's site. */
export function siteUrl(lang: SiteLang, publicPath: string): string {
  return new URL(publicPath, lang === 'en' ? EN_ORIGIN : ZH_ORIGIN).href;
}
