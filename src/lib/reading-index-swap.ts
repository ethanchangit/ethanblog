/**
 * 分栏阅读时拦截左栏链接，避免 ClientRouter 整页 morph。
 *
 * 不能靠 `astro:before-preparation` 的 preventDefault：Astro 会把它当成
 * 失败并 `location.href = …`，整页跳到 `/articles/2` 这类单栏索引。
 * 因此在捕获阶段拦截 click：
 * - 分页 / 文章↔项目：只换 `[data-reading-index]`，中栏不动。
 * - 文章/项目卡片：只换 `[data-reading-doc]` 与 TOC 栏，左栏 DOM 与 scrollTop 原样保留。
 *
 * 点当前篇必须是 no-op：浏览器会在 mousedown 时 focus 卡片，默认把焦点滚进
 * `overflow: auto` 的左栏；当前项若靠近列表底部，看起来就像左栏被刷新到底。
 * ClientRouter persist 后还会 `activeElement.focus()`，同样会滚左栏。
 *
 * 关闭（展开图标 / Escape）回到 `/`：左栏索引仍在，中栏是 About，列表无选中项。
 * 无 JS / 窄屏时链接仍是普通导航。单栏索引点进分栏仍走整页；进分栏后才只换栏。
 */
import { applyLang, readLang } from '@/lib/i18n';
import { ARTICLES_PATH, HOME_PATH, PROJECTS_PATH } from '@/lib/routes';

export type IndexKind = 'articles' | 'projects';

const PERSIST = {
  articles: 'reading-index-articles',
  projects: 'reading-index-projects',
} as const;

const SPLIT_MQ = '(min-width: 768px)';

let started = false;
let inflight: AbortController | null = null;
let generation = 0;

function canonicalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

export function indexKindFromPath(pathname: string): IndexKind | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === ARTICLES_PATH) return 'articles';
  if (p.startsWith(`${ARTICLES_PATH}/`) && /^\d+$/.test(p.slice(ARTICLES_PATH.length + 1))) {
    return 'articles';
  }
  if (p === PROJECTS_PATH) return 'projects';
  return null;
}

export function docKindFromPath(pathname: string): 'article' | 'project' | null {
  const p = canonicalizePath(pathname);
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
    if (a.hasAttribute('data-reading-close')) continue;
    let target: string;
    try {
      target = canonicalizePath(new URL(href, window.location.origin).pathname);
    } catch {
      continue;
    }
    if (target === HOME_PATH) continue;
    if (indexKindFromPath(target)) continue;
    const match = path === target || path.startsWith(`${target}/`);
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
  const kind: IndexKind = persist === PERSIST.projects ? 'projects' : 'articles';
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
  return canonicalizePath(pathname) === canonicalizePath(location.pathname);
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

async function swapReadingIndex(href: string, kind: IndexKind) {
  const aside = document.querySelector('[data-reading-index]');
  if (!(aside instanceof HTMLElement)) {
    location.href = href;
    return;
  }

  let dest: URL;
  try {
    dest = new URL(href, location.href);
  } catch {
    location.href = href;
    return;
  }
  const destPath = canonicalizePath(dest.pathname);
  if (aside.getAttribute('data-reading-index-src') === destPath) return;

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
    markCurrent();
    syncCloseHref();
    applyLang(readLang());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    location.href = href;
  } finally {
    if (myGen === generation) aside.removeAttribute('aria-busy');
  }
}

async function swapReadingDoc(href: string, kind: 'article' | 'project') {
  const shell = document.querySelector('[data-reading-shell]');
  const docPane = document.querySelector('[data-reading-doc]');
  if (!(shell instanceof HTMLElement) || !(docPane instanceof HTMLElement)) {
    location.href = href;
    return;
  }

  let dest: URL;
  try {
    dest = new URL(href, location.href);
  } catch {
    location.href = href;
    return;
  }
  const destPath = canonicalizePath(dest.pathname);
  if (shownDocSrc(docPane) === destPath && sameDocPath(destPath)) return;

  const aside = indexEl();
  const restoreIndexScroll = preserveIndexScroll(aside);

  inflight?.abort();
  inflight = new AbortController();
  const myGen = ++generation;
  aside?.removeAttribute('aria-busy');
  docPane.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch(dest.href, {
      signal: inflight.signal,
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) throw new Error('bad status');
    const html = await res.text();
    const parsed = new DOMParser().parseFromString(neutralizeIslands(html), 'text/html');
    const source = parsed.querySelector('[data-reading-doc]');
    if (!source) throw new Error('no doc');
    source.querySelectorAll('script').forEach((el) => el.remove());
    adoptHeadAssets(parsed);
    restoreIndexScroll();
    docPane.replaceChildren(...nodesFromHtml(source.innerHTML));
    docPane.setAttribute('data-reading-doc-src', destPath);
    docPane.scrollTop = 0;
    applyRail(shell, parsed);
    shell.setAttribute('data-reading-shell', kind);
    applyDocMeta(parsed);
    const prevState = history.state && typeof history.state === 'object' ? history.state : {};
    const prevIndex = typeof prevState.index === 'number' ? prevState.index : 0;
    history.pushState({ ...prevState, index: prevIndex + 1, readingDoc: destPath }, '', dest.href);
    blurIndexFocus();
    markCurrent();
    syncCloseHref();
    applyLang(readLang());
    restoreIndexScroll();
    document.dispatchEvent(new Event('astro:page-load'));
    restoreIndexScroll();
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    location.href = href;
  } finally {
    if (myGen === generation) docPane.removeAttribute('aria-busy');
    restoreIndexScroll();
  }
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
  if (link.hasAttribute('data-reading-close')) return;
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
  if (!splitIndexVisible()) return;

  const el = event.target instanceof Element ? event.target : null;
  const link = el?.closest('a');
  if (!(link instanceof HTMLAnchorElement)) return;
  if (link.hasAttribute('download')) return;
  if (link.target && link.target !== '_self') return;

  if (link.hasAttribute('data-reading-close')) return;

  const inIndex = !!link.closest('[data-reading-index]');
  const inSwitch = !!link.closest('[data-reading-index-switch]');
  if (!inIndex && !inSwitch) return;

  let url: URL;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return;
  }
  if (url.origin !== location.origin) return;

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

export function readingCloseHref(): string {
  return HOME_PATH;
}

function syncCloseHref() {
  const link = document.querySelector<HTMLAnchorElement>('a[data-reading-close]');
  if (!link) return;
  link.setAttribute('href', readingCloseHref());
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
  if (canonicalizePath(location.pathname) === HOME_PATH) return;
  if (typingTarget(event.target)) return;
  if (overlayBlocksEscape()) return;
  const link = document.querySelector<HTMLAnchorElement>('a[data-reading-close]');
  if (!link) return;
  event.preventDefault();
  link.click();
}

function onPageLoad() {
  markCurrent();
  syncCloseHref();
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
