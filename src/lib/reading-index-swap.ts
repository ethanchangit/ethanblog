/**
 * 分栏阅读时拦截左栏链接，避免 ClientRouter 整页 morph。
 *
 * 不能靠 `astro:before-preparation` 的 preventDefault：Astro 会把它当成
 * 失败并 `location.href = …`，整页跳到 `/articles` 这类单栏索引。
 * 因此在捕获阶段拦截 click：
 * - 文章↔项目：只换 `[data-reading-index]`，中栏不动。
 * - 文章/项目卡片：只换 `[data-reading-doc]` 与 TOC 栏，左栏 DOM 与 scrollTop 原样保留。
 *
 * 点当前篇必须是 no-op：浏览器会在 mousedown 时 focus 卡片，默认把焦点滚进
 * `overflow: auto` 的左栏；当前项若靠近列表底部，看起来就像左栏被刷新到底。
 * ClientRouter persist 后还会 `activeElement.focus()`，同样会滚左栏。
 *
 * Escape / 字标 EthanChang 回到 `/`：左栏索引仍在，中栏是 About，列表无选中项。
 * 不能把回首页交给 ClientRouter：旧的 `/`→`/articles` 301 会被浏览器缓存，
 * 点字标就会停在文章列表，而不是分栏首页。
 * 左栏展开（data-reading-expand）：壳内把左栏拉成主视图，pushState 到
 * `/articles` 或 `/projects`，不整页跳走。收起（data-reading-collapse）与字标
 * 同一条 goHome：中栏 About、左栏缩回，URL → `/` 或 `/zh`。
 * 无 JS / 窄屏 / 不在阅读壳里时链接仍是普通导航。
 */
import { profile, site } from '@/data/profile';
import { applyLang, copy, readLang } from '@/lib/i18n';
import { localeFromPath, localeHrefForLang, pagePath } from '@/lib/locale';
import { reducedMotion } from '@/lib/motion';
import { ARTICLES_PATH, BLOGS_PATH, HOME_PATH, PROJECTS_PATH } from '@/lib/routes';

export type IndexKind = 'articles' | 'projects' | 'blogs';

const PERSIST = {
  articles: 'reading-index-articles',
  projects: 'reading-index-projects',
  blogs: 'reading-index-blogs',
} as const;

const SPLIT_MQ = '(min-width: 768px)';

let started = false;
let inflight: AbortController | null = null;
let generation = 0;

function canonicalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function currentLang(): 'zh-CN' | 'en' {
  return localeFromPath(location.pathname) === 'zh' ? 'zh-CN' : 'en';
}

function isHomePath(pathname: string): boolean {
  return pagePath(pathname) === HOME_PATH;
}

function isHomeNavigation(url: URL): boolean {
  return url.origin === location.origin && isHomePath(url.pathname) && !url.hash;
}

function homeHref(): string {
  return new URL(localeHrefForLang(HOME_PATH, currentLang()), location.origin).href;
}

/** 绕开已被缓存的 `/` → `/articles` 301。 */
function homeFallbackHref(): string {
  return `${homeHref()}?`;
}

function alreadyOnHome(): boolean {
  return isHomePath(location.pathname) && !!document.querySelector('[data-about-panel]');
}

function shellEl(): HTMLElement | null {
  const shell = document.querySelector('[data-reading-shell]');
  return shell instanceof HTMLElement ? shell : null;
}

function isIndexLayout(): boolean {
  return shellEl()?.getAttribute('data-reading-shell') === 'index';
}

function pushReadingUrl(href: string, extra: Record<string, unknown>) {
  const prevState = history.state && typeof history.state === 'object' ? history.state : {};
  const prevIndex = typeof prevState.index === 'number' ? prevState.index : 0;
  history.pushState({ ...prevState, index: prevIndex + 1, ...extra }, '', href);
}

function applyCanonical(href: string) {
  const canonical = document.querySelector('link[rel="canonical"]');
  if (!canonical) return;
  try {
    canonical.setAttribute('href', new URL(href, location.origin).href);
  } catch {
    /* ignore */
  }
}

function applyIndexPageMeta(kind: IndexKind) {
  const titleKey = kind === 'projects' ? 'projectsTitle' : kind === 'blogs' ? 'blogsTitle' : 'articlesTitle';
  const descKey = kind === 'projects' ? 'projectsDesc' : kind === 'blogs' ? 'blogsDesc' : 'articlesDesc';
  document.documentElement.setAttribute('data-title-zh', `${copy['zh-CN'][titleKey]} · ${site.title}`);
  document.documentElement.setAttribute('data-title-en', `${copy.en[titleKey]} · ${site.title}`);
  document.documentElement.setAttribute('data-desc-zh', copy['zh-CN'][descKey]);
  document.documentElement.setAttribute('data-desc-en', copy.en[descKey]);
}

function applyHomePageMeta() {
  document.documentElement.setAttribute('data-title-zh', `${site.title} — ${copy['zh-CN'].siteBlog}`);
  document.documentElement.setAttribute('data-title-en', `${site.title} — ${copy.en.siteBlog}`);
  document.documentElement.setAttribute('data-desc-zh', profile.bio);
  document.documentElement.setAttribute('data-desc-en', profile.bioEn);
}

function syncExpandedChrome(shell: HTMLElement) {
  const expanded = shell.getAttribute('data-reading-shell') === 'index';
  if (expanded) {
    const active = document.activeElement;
    if (
      active instanceof HTMLElement &&
      (active.closest('[data-reading-doc]') || active.closest('[data-reading-rail]'))
    ) {
      active.blur();
    }
  }
  for (const sel of ['[data-reading-doc]', '[data-reading-rail]'] as const) {
    const el = shell.querySelector(sel);
    if (!(el instanceof HTMLElement)) continue;
    el.inert = expanded;
    if (expanded) el.setAttribute('aria-hidden', 'true');
    else el.removeAttribute('aria-hidden');
  }
}

function setReadingLayout(shell: HTMLElement, kind: 'article' | 'project' | 'home' | 'index') {
  if (!reducedMotion()) {
    void shell.offsetWidth;
  }
  shell.setAttribute('data-reading-shell', kind);
  syncExpandedChrome(shell);
}

async function fetchHomeParsed(signal: AbortSignal): Promise<Document> {
  for (const href of [homeHref(), homeFallbackHref()]) {
    const res = await fetch(href, {
      signal,
      cache: 'no-store',
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) continue;
    let landed = HOME_PATH;
    try {
      landed = canonicalizePath(new URL(res.url).pathname);
    } catch {
      continue;
    }
    if (pagePath(landed) !== HOME_PATH) continue;
    const parsed = new DOMParser().parseFromString(neutralizeIslands(await res.text()), 'text/html');
    if (parsed.querySelector('[data-about-panel]') && parsed.querySelector('[data-reading-doc]')) {
      return parsed;
    }
  }
  throw new Error('no home');
}

export function indexKindFromPath(pathname: string): IndexKind | null {
  const p = pagePath(pathname);
  if (p === ARTICLES_PATH) return 'articles';
  if (p.startsWith(`${ARTICLES_PATH}/`) && /^\d+$/.test(p.slice(ARTICLES_PATH.length + 1))) {
    return 'articles';
  }
  if (p === PROJECTS_PATH) return 'projects';
  if (p === BLOGS_PATH) return 'blogs';
  return null;
}

export function docKindFromPath(pathname: string): 'article' | 'project' | null {
  const p = pagePath(pathname);
  if (p.startsWith(`${ARTICLES_PATH}/`)) {
    const rest = p.slice(ARTICLES_PATH.length + 1);
    if (!rest || /^\d+$/.test(rest)) return null;
    return 'article';
  }
  if (p.startsWith(`${PROJECTS_PATH}/`)) {
    const rest = p.slice(PROJECTS_PATH.length + 1);
    if (!rest) return null;
    return 'project';
  }
  return null;
}

function splitIndexVisible(): boolean {
  return (
    document.documentElement.classList.contains('reading-split') &&
    window.matchMedia(SPLIT_MQ).matches &&
    !!document.querySelector('[data-reading-index]')
  );
}

function neutralizeIslands(html: string): string {
  return html.replace(/<\/?astro-island\b/gi, (tag) =>
    tag.startsWith('</') ? '</astro-island-inert' : '<astro-island-inert',
  );
}

function restoreIslands(html: string): string {
  return html.replace(/<\/?astro-island-inert\b/gi, (tag) =>
    tag.startsWith('</') ? '</astro-island' : '<astro-island',
  );
}

function extractIndexBody(doc: Document): Element | null {
  const split = doc.querySelector('[data-reading-index]');
  if (split) {
    return split.querySelector('[data-reading-index-body]') ?? split.firstElementChild;
  }
  return doc.querySelector('[data-reading-index-body]');
}

function adoptHeadAssets(fromDoc: Document) {
  const head = document.head;
  for (const el of fromDoc.head.querySelectorAll('link[rel="stylesheet"], style[data-vite-dev-id]')) {
    if (el instanceof HTMLLinkElement) {
      const href = el.getAttribute('href');
      if (!href) continue;
      const exists = [...head.querySelectorAll('link[rel="stylesheet"]')].some((link) => {
        const current = link.getAttribute('href');
        return current === href || (link instanceof HTMLLinkElement && link.href === el.href);
      });
      if (exists) continue;
      head.appendChild(document.importNode(el, true));
      continue;
    }
    if (el instanceof HTMLStyleElement) {
      const viteId = el.getAttribute('data-vite-dev-id');
      if (!viteId || head.querySelector(`style[data-vite-dev-id="${viteId}"]`)) continue;
      head.appendChild(document.importNode(el, true));
    }
  }
}

export function markCurrent() {
  const root = document.querySelector('[data-reading-index]');
  if (!root) return;
  const path = canonicalizePath(window.location.pathname);
  for (const a of root.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('?')) continue;
    if (a.hasAttribute('data-reading-expand') || a.hasAttribute('data-reading-collapse')) continue;
    let target: string;
    try {
      target = canonicalizePath(new URL(href, window.location.origin).pathname);
    } catch {
      continue;
    }
    if (pagePath(target) === HOME_PATH) continue;
    if (indexKindFromPath(target)) continue;
    const match = pagePath(path) === pagePath(target) || pagePath(path).startsWith(`${pagePath(target)}/`);
    if (match) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function syncIndexNav(kind: IndexKind) {
  document.documentElement.dataset.indexKind = kind;
}

function syncIndexKindFromAside() {
  const aside = document.querySelector('[data-reading-index]');
  if (!aside) {
    document.documentElement.removeAttribute('data-index-kind');
    return;
  }
  const persist = aside.getAttribute('data-astro-transition-persist');
  const kind: IndexKind =
    persist === PERSIST.projects ? 'projects' : persist === PERSIST.blogs ? 'blogs' : 'articles';
  syncIndexNav(kind);
}

function indexEl(): HTMLElement | null {
  const aside = document.querySelector('[data-reading-index]');
  return aside instanceof HTMLElement ? aside : null;
}

function preserveIndexScroll(aside: HTMLElement | null): () => void {
  if (!aside) return () => {};
  const top = aside.scrollTop;
  const restore = () => {
    aside.scrollTop = top;
  };
  restore();
  requestAnimationFrame(() => {
    restore();
    requestAnimationFrame(restore);
  });
  return restore;
}

function blurIndexFocus() {
  const active = document.activeElement;
  if (active instanceof HTMLElement && active.closest('[data-reading-index]')) {
    active.blur();
  }
}

function sameDocPath(pathname: string): boolean {
  return pagePath(pathname) === pagePath(location.pathname);
}

function applyDocMeta(fromDoc: Document) {
  const src = fromDoc.documentElement;
  for (const key of ['data-title-zh', 'data-title-en', 'data-desc-zh', 'data-desc-en'] as const) {
    const val = src.getAttribute(key);
    if (val) document.documentElement.setAttribute(key, val);
  }
  const nextCanonical = fromDoc.querySelector('link[rel="canonical"]')?.getAttribute('href');
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical && nextCanonical) canonical.setAttribute('href', nextCanonical);
}

function nodesFromHtml(html: string): Node[] {
  const tpl = document.createElement('template');
  tpl.innerHTML = html;
  return [...tpl.content.childNodes];
}

function applyRail(shell: HTMLElement, fromDoc: Document) {
  const nextRail = fromDoc.querySelector('[data-reading-rail]');
  const current = shell.querySelector('[data-reading-rail]');
  if (nextRail) {
    nextRail.querySelectorAll('script').forEach((el) => el.remove());
    const nodes = nodesFromHtml(nextRail.outerHTML);
    const node = nodes.find((n): n is Element => n instanceof Element);
    if (!node) return;
    if (current) current.replaceWith(node);
    else shell.appendChild(node);
    return;
  }
  current?.remove();
}

function shownDocSrc(docPane: HTMLElement): string {
  return docPane.getAttribute('data-reading-doc-src') ?? canonicalizePath(location.pathname);
}

async function swapReadingIndex(href: string, kind: IndexKind): Promise<boolean> {
  const aside = document.querySelector('[data-reading-index]');
  if (!(aside instanceof HTMLElement)) {
    location.href = href;
    return false;
  }

  let dest: URL;
  try {
    dest = new URL(href, location.href);
  } catch {
    location.href = href;
    return false;
  }
  const destPath = canonicalizePath(dest.pathname);
  if (aside.getAttribute('data-reading-index-src') === destPath) return true;

  inflight?.abort();
  inflight = new AbortController();
  const myGen = ++generation;
  document.querySelector('[data-reading-doc]')?.removeAttribute('aria-busy');
  aside.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch(dest.href, {
      signal: inflight.signal,
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) throw new Error('bad status');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(neutralizeIslands(html), 'text/html');
    const source = extractIndexBody(doc);
    if (!source) throw new Error('no index');
    adoptHeadAssets(doc);
    const tpl = document.createElement('template');
    tpl.innerHTML = restoreIslands(source.outerHTML);
    aside.replaceChildren(...tpl.content.childNodes);
    aside.setAttribute('data-astro-transition-persist', PERSIST[kind]);
    aside.setAttribute('data-reading-index-src', destPath);
    aside.scrollTop = 0;
    syncIndexNav(kind);
    if (isIndexLayout()) {
      applyDocMeta(doc);
      applyIndexPageMeta(kind);
      pushReadingUrl(dest.href, { readingLayout: 'index', readingIndex: destPath });
    }
    markCurrent();
    applyLang(readLang());
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return false;
    location.href = href;
    return false;
  } finally {
    if (myGen === generation) aside.removeAttribute('aria-busy');
  }
}

async function swapReadingDoc(href: string, kind: 'article' | 'project' | 'home') {
  const shell = document.querySelector('[data-reading-shell]');
  const docPane = document.querySelector('[data-reading-doc]');
  if (!(shell instanceof HTMLElement) || !(docPane instanceof HTMLElement)) {
    location.href = kind === 'home' ? homeFallbackHref() : href;
    return;
  }

  let dest: URL;
  try {
    dest = new URL(href, location.href);
  } catch {
    location.href = kind === 'home' ? homeFallbackHref() : href;
    return;
  }
  const destPath =
    kind === 'home' ? canonicalizePath(new URL(homeHref()).pathname) : canonicalizePath(dest.pathname);
  if (shownDocSrc(docPane) === destPath && sameDocPath(destPath) && !isIndexLayout()) return;

  if (kind === 'home' && docPane.querySelector('[data-about-panel]')) {
    const restoreIndexScroll = preserveIndexScroll(indexEl());
    inflight?.abort();
    inflight = null;
    generation += 1;
    shell.querySelector('[data-reading-rail]')?.remove();
    docPane.setAttribute('data-reading-doc-src', destPath);
    docPane.scrollTop = 0;
    applyHomePageMeta();
    applyCanonical(homeHref());
    setReadingLayout(shell, 'home');
    pushReadingUrl(homeHref(), { readingDoc: destPath });
    blurIndexFocus();
    markCurrent();
    applyLang(readLang());
    restoreIndexScroll();
    document.dispatchEvent(new Event('astro:page-load'));
    restoreIndexScroll();
    return;
  }

  const aside = indexEl();
  const restoreIndexScroll = preserveIndexScroll(aside);

  inflight?.abort();
  inflight = new AbortController();
  const myGen = ++generation;
  aside?.removeAttribute('aria-busy');
  docPane.setAttribute('aria-busy', 'true');

  try {
    let parsed: Document;
    if (kind === 'home') {
      parsed = await fetchHomeParsed(inflight.signal);
    } else {
      const res = await fetch(dest.href, {
        signal: inflight.signal,
        headers: { Accept: 'text/html' },
      });
      if (!res.ok) throw new Error('bad status');
      parsed = new DOMParser().parseFromString(neutralizeIslands(await res.text()), 'text/html');
    }
    const source = parsed.querySelector('[data-reading-doc]');
    if (!source) throw new Error('no doc');
    source.querySelectorAll('script').forEach((el) => el.remove());
    adoptHeadAssets(parsed);
    restoreIndexScroll();
    docPane.replaceChildren(...nodesFromHtml(source.innerHTML));
    docPane.setAttribute('data-reading-doc-src', destPath);
    docPane.scrollTop = 0;
    applyRail(shell, parsed);
    setReadingLayout(shell, kind);
    applyDocMeta(parsed);
    pushReadingUrl(kind === 'home' ? homeHref() : dest.href, { readingDoc: destPath });
    blurIndexFocus();
    markCurrent();
    applyLang(readLang());
    restoreIndexScroll();
    document.dispatchEvent(new Event('astro:page-load'));
    restoreIndexScroll();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    location.href = kind === 'home' ? homeFallbackHref() : href;
  } finally {
    if (myGen === generation) docPane.removeAttribute('aria-busy');
    restoreIndexScroll();
  }
}

async function expandReadingIndex(href: string) {
  const shell = shellEl();
  if (!shell || !splitIndexVisible()) {
    location.assign(href);
    return;
  }

  let dest: URL;
  try {
    dest = new URL(href, location.href);
  } catch {
    location.assign(href);
    return;
  }
  const kind = indexKindFromPath(dest.pathname);
  if (!kind || kind === 'blogs') {
    location.assign(href);
    return;
  }
  const destPath = canonicalizePath(dest.pathname);
  inflight?.abort();
  inflight = null;
  generation += 1;
  const aside = indexEl();
  if (aside && aside.getAttribute('data-reading-index-src') !== destPath) {
    const ok = await swapReadingIndex(dest.href, kind);
    if (!ok) return;
  }
  if (isIndexLayout() && pagePath(location.pathname) === pagePath(destPath)) return;

  applyIndexPageMeta(kind);
  applyCanonical(dest.href);
  setReadingLayout(shell, 'index');
  pushReadingUrl(dest.href, { readingLayout: 'index', readingIndex: destPath });
  blurIndexFocus();
  markCurrent();
  applyLang(readLang());
  document.dispatchEvent(new Event('astro:page-load'));
}

async function goHome(href: string) {
  if (splitIndexVisible()) {
    if (alreadyOnHome() && !isIndexLayout()) return;
    await swapReadingDoc(href, 'home');
    return;
  }
  location.assign(homeFallbackHref());
}

function onMouseDown(event: MouseEvent) {
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (!splitIndexVisible()) return;

  const el = event.target instanceof Element ? event.target : null;
  const link = el?.closest('a');
  if (!(link instanceof HTMLAnchorElement)) return;
  if (link.hasAttribute('download')) return;
  if (link.target && link.target !== '_self') return;
  if (link.hasAttribute('data-reading-expand') || link.hasAttribute('data-reading-collapse')) return;
  if (!link.closest('[data-reading-index]')) return;

  let url: URL;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;
  if (indexKindFromPath(url.pathname)) return;
  if (!docKindFromPath(url.pathname)) return;

  // mousedown 就会 focus，默认把卡片滚进左栏；必须在 click 之前拦住。
  event.preventDefault();
  preserveIndexScroll(indexEl());
}

function onClick(event: MouseEvent) {
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;

  const el = event.target instanceof Element ? event.target : null;
  const link = el?.closest('a');
  if (!(link instanceof HTMLAnchorElement)) return;
  if (link.hasAttribute('download')) return;
  if (link.target && link.target !== '_self') return;

  let url: URL;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;

  if (isHomeNavigation(url)) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void goHome(url.href);
    return;
  }

  if (link.hasAttribute('data-reading-expand')) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void expandReadingIndex(url.href);
    return;
  }

  if (link.hasAttribute('data-reading-collapse')) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    void goHome(url.href);
    return;
  }

  if (!splitIndexVisible()) return;

  const inIndex = !!link.closest('[data-reading-index]');
  const inSwitch = !!link.closest('[data-reading-index-switch]');
  if (!inIndex && !inSwitch) return;

  const indexKind = indexKindFromPath(url.pathname);
  if (indexKind) {
    event.preventDefault();
    event.stopPropagation();
    void swapReadingIndex(url.href, indexKind);
    return;
  }

  if (!inIndex) return;
  const docKind = docKindFromPath(url.pathname);
  if (!docKind) return;

  event.preventDefault();
  event.stopPropagation();
  const restoreIndexScroll = preserveIndexScroll(indexEl());
  blurIndexFocus();
  if (sameDocPath(url.pathname)) {
    restoreIndexScroll();
    return;
  }
  void swapReadingDoc(url.href, docKind);
}

function overlayBlocksEscape(): boolean {
  if (document.querySelector('[role="dialog"][aria-modal="true"]')) return true;
  if (document.querySelector('[role="listbox"]')) return true;
  return false;
}

function typingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.isContentEditable;
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  if (!splitIndexVisible()) return;
  if (pagePath(location.pathname) === HOME_PATH) return;
  if (typingTarget(event.target)) return;
  if (overlayBlocksEscape()) return;
  event.preventDefault();
  void goHome(homeHref());
}

function onPageLoad() {
  if (isHomePath(location.pathname) && location.search === '?' && !location.hash) {
    history.replaceState(history.state, '', homeHref());
  }
  markCurrent();
  const shell = shellEl();
  if (shell) syncExpandedChrome(shell);
  if (document.documentElement.classList.contains('reading-split')) {
    syncIndexKindFromAside();
  } else {
    document.documentElement.removeAttribute('data-index-kind');
  }
}

export function initReadingIndexSwap() {
  if (typeof document === 'undefined') return;
  if (started) return;
  started = true;
  document.addEventListener('mousedown', onMouseDown, true);
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('astro:page-load', onPageLoad);
  if (document.readyState === 'complete') onPageLoad();
}
