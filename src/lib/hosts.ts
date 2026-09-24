/**
 * Two sites from one build:
 * - cn.ethanchang.io serves the Chinese blog (#blog cards) from the root of dist/.
 * - ethanchang.io serves the English blog (#blogi18n translations) from dist/en/.
 * Links inside each site are plain paths; a request on the English host for /toolset is
 * served from /en/toolset. Pages that have no English version send the reader to the
 * same path on the Chinese site. Language switches link to /_lang/<zh|en><path>, which
 * resolves to the other host without hard-coding it into static HTML.
 *
 * Used by scripts/cf-worker-entry.mjs, scripts/preview.mjs and the dev middleware.
 */
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

export function hostLang(host: string): SiteLang {
  const name = hostname(host);
  return name === 'ethanchang.io' || name === 'www.ethanchang.io' || name.startsWith('en.') ? 'en' : 'zh';
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
 * What to do with a request. `rewrite` means: serve this build path, and if it does not exist,
 * redirect to the same path on the Chinese site (fallbackFor).
 */
export function routeRequest(url: URL): HostDecision {
  const { pathname, search, host, protocol } = url;
  const lang = hostLang(host);
  const to = (target: SiteLang, path: string, status: 301 | 302 = 302): HostDecision => ({
    type: 'redirect', location: `${protocol}//${hostFor(target, host)}${path}${search}`, status,
  });
  const switchMatch = /^\/_lang\/(zh|en)(\/.*)?$/.exec(pathname);
  if (switchMatch) return to(switchMatch[1] as SiteLang, switchMatch[2] || '/');
  if (SHARED.test(pathname)) return { type: 'pass' };
  if (pathname === '/dashboard' || pathname.startsWith('/dashboard/')) {
    // The dashboard and its login cookie live on ethanchang.io only.
    return hostname(host) === 'cn.ethanchang.io' ? to('en', pathname, 301) : { type: 'pass' };
  }
  if (lang === 'zh') return isEnglishBuildPath(pathname) ? to('en', englishPublicPath(pathname), 301) : { type: 'pass' };
  if (isEnglishBuildPath(pathname)) return to('en', englishPublicPath(pathname), 301);
  return { type: 'rewrite', path: `${EN_PREFIX}${pathname === '/' ? '/' : pathname}` };
}

/** Where an English-host request goes when there is no English page. */
export function fallbackFor(url: URL): string {
  return `${url.protocol}//${hostFor('zh', url.host)}${url.pathname}${url.search}`;
}

/** Canonical URL of a built page: English pages drop /en and live on ethanchang.io. */
export function canonicalUrl(buildPath: string): string {
  return isEnglishBuildPath(buildPath) ? new URL(englishPublicPath(buildPath), EN_ORIGIN).href : new URL(buildPath, ZH_ORIGIN).href;
}

/** Absolute URL of a public path on one language's site. */
export function siteUrl(lang: SiteLang, publicPath: string): string {
  return new URL(publicPath, lang === 'en' ? EN_ORIGIN : ZH_ORIGIN).href;
}
