/**
 * 系列总览在分栏里点篇目：第三栏打开子文，中间总览不换。
 *
 * 与左栏索引拦截一样，不能靠 `astro:before-preparation` 的 preventDefault
 *（Astro 会当成失败并整页跳走）。捕获阶段拦 click，fetch 子页，
 * 把 `.article-shell` 注入 `[data-reading-rail]`。
 * 无 JS / 窄屏时链接仍是普通导航。URL 保持总览。
 *
 * 关闭子文用 `data-reading-child-close`，不要跟正文的 `data-reading-close` 混用。
 */
import { applyLang, readLang, t } from '@/lib/i18n';

const RAIL_MQ = '(min-width: 1024px)';

let started = false;
let inflight: AbortController | null = null;
let generation = 0;
let mq: MediaQueryList | null = null;

function canonicalizePath(pathname: string): string {
  return pathname.replace(/\/+$/, '') || '/';
}

function neutralizeIslands(html: string): string {
  return html.replace(/<\/?astro-island\b/gi, (tag) =>
    tag.startsWith('</') ? '</astro-island-inert' : '<astro-island-inert',
  );
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

function isHubView(): boolean {
  return !!document.querySelector('[data-reading-doc] [data-series="hub-inline"]');
}

function seriesPaneActive(): boolean {
  return (
    document.documentElement.classList.contains('reading-split') &&
    window.matchMedia(RAIL_MQ).matches &&
    isHubView() &&
    !!railEl()
  );
}

function hubPath(): string {
  return canonicalizePath(location.pathname);
}

function isChapterOfHub(pathname: string, hub: string): boolean {
  const path = canonicalizePath(pathname);
  return path.startsWith(`${hub}/`) && path.length > hub.length + 1;
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

function railEl(): HTMLElement | null {
  const rail = document.querySelector('[data-reading-rail]');
  return rail instanceof HTMLElement ? rail : null;
}

function markOpenChapter(chapterPath: string | null) {
  const hub = hubPath();
  const links = document.querySelectorAll<HTMLAnchorElement>(
    '[data-reading-rail] [data-series="hub"] a[href], [data-reading-doc] [data-series="hub-inline"] a[href]',
  );
  for (const a of links) {
    const href = a.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('?')) continue;
    let target: string;
    try {
      target = canonicalizePath(new URL(href, location.origin).pathname);
    } catch {
      continue;
    }
    const current = chapterPath ? target === chapterPath : target === hub;
    if (current) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
}

function createChildCloseButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'ui-link-subtle reading-child-dismiss';
  button.setAttribute('data-reading-child-close', '');
  button.setAttribute('data-i18n-aria', 'seriesCloseChild');
  button.setAttribute('aria-label', t(readLang(), 'seriesCloseChild'));
  const zh = document.createElement('span');
  zh.className = 'i18n-zh';
  zh.setAttribute('aria-hidden', 'true');
  zh.textContent = t('zh-CN', 'seriesCloseChild');
  const en = document.createElement('span');
  en.className = 'i18n-en';
  en.textContent = t('en', 'seriesCloseChild');
  button.appendChild(zh);
  button.appendChild(en);
  return button;
}

function placeChildClose(pane: HTMLElement) {
  pane.querySelector('[data-reading-child-close]')?.remove();
  const button = createChildCloseButton();
  const row = pane.querySelector('header.article-lede > div.flex.justify-between');
  if (row) {
    row.appendChild(button);
    return;
  }
  const lede = pane.querySelector('header.article-lede');
  if (lede) {
    lede.insertBefore(button, lede.firstChild);
    return;
  }
  pane.insertBefore(button, pane.firstChild);
}

function ensureChildScaffold(rail: HTMLElement) {
  if (!rail.querySelector('[data-reading-child]')) {
    const child = document.createElement('div');
    child.className = 'reading-child-doc';
    child.setAttribute('data-reading-child', '');
    const series = rail.querySelector('[data-series="hub"]');
    if (series?.nextSibling) rail.insertBefore(child, series.nextSibling);
    else rail.appendChild(child);
  }
}

function closeChild() {
  inflight?.abort();
  inflight = null;
  const rail = railEl();
  if (!rail?.hasAttribute('data-reading-child-open')) return;
  rail.removeAttribute('data-reading-child-open');
  rail.removeAttribute('data-reading-child-src');
  rail.removeAttribute('aria-busy');
  rail.querySelector('[data-reading-child]')?.remove();
  markOpenChapter(null);
}

function extractArticleShell(doc: Document): Element | null {
  return (
    doc.querySelector('[data-reading-doc] .article-shell') ?? doc.querySelector('.article-shell')
  );
}

async function openChild(href: string) {
  const rail = railEl();
  if (!rail) {
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
  if (rail.getAttribute('data-reading-child-src') === destPath) return;

  inflight?.abort();
  inflight = new AbortController();
  const myGen = ++generation;
  rail.setAttribute('aria-busy', 'true');

  try {
    const res = await fetch(dest.href, {
      signal: inflight.signal,
      headers: { Accept: 'text/html' },
    });
    if (!res.ok) throw new Error('bad status');
    const html = await res.text();
    const doc = new DOMParser().parseFromString(neutralizeIslands(html), 'text/html');
    const source = extractArticleShell(doc);
    if (!source) throw new Error('no article');
    source.querySelectorAll('script').forEach((el) => el.remove());
    adoptHeadAssets(doc);
    ensureChildScaffold(rail);
    const pane = rail.querySelector('[data-reading-child]');
    if (!(pane instanceof HTMLElement)) throw new Error('no pane');
    const tpl = document.createElement('template');
    tpl.innerHTML = source.outerHTML;
    pane.replaceChildren(...tpl.content.childNodes);
    placeChildClose(pane);
    pane.scrollTop = 0;
    rail.setAttribute('data-reading-child-open', '');
    rail.setAttribute('data-reading-child-src', destPath);
    markOpenChapter(destPath);
    applyLang(readLang());
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
    location.href = href;
  } finally {
    if (myGen === generation) rail.removeAttribute('aria-busy');
  }
}

function interceptTarget(link: HTMLAnchorElement): 'open' | 'close' | null {
  const inIndex = !!link.closest('[data-reading-index]');
  if (inIndex) return null;

  const inInline = !!link.closest('[data-reading-doc] [data-series="hub-inline"]');
  const inRailSeries = !!link.closest('[data-reading-rail] [data-series="hub"]');
  const inChild = !!link.closest('[data-reading-child]');
  if (!inInline && !inRailSeries && !inChild) return null;

  let url: URL;
  try {
    url = new URL(link.href, location.href);
  } catch {
    return null;
  }
  if (url.origin !== location.origin) return null;

  const hub = hubPath();
  const path = canonicalizePath(url.pathname);
  if (path === hub) return 'close';
  if (isChapterOfHub(path, hub)) return 'open';
  return null;
}

function onClick(event: MouseEvent) {
  if (event.defaultPrevented) return;
  if (event.button !== 0) return;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
  if (!seriesPaneActive()) return;

  const el = event.target instanceof Element ? event.target : null;
  if (!el) return;

  if (el.closest('[data-reading-child-close]')) {
    event.preventDefault();
    event.stopPropagation();
    closeChild();
    return;
  }

  const link = el.closest('a');
  if (!(link instanceof HTMLAnchorElement)) return;
  if (link.hasAttribute('download')) return;
  if (link.target && link.target !== '_self') return;

  const action = interceptTarget(link);
  if (!action) return;

  event.preventDefault();
  event.stopPropagation();
  if (action === 'close') {
    closeChild();
    return;
  }
  void openChild(link.href);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  if (event.defaultPrevented || event.repeat || event.isComposing) return;
  if (!document.querySelector('[data-reading-child-open]')) return;
  if (typingTarget(event.target)) return;
  if (overlayBlocksEscape()) return;
  event.preventDefault();
  event.stopPropagation();
  closeChild();
}

function onViewportChange() {
  if (!window.matchMedia(RAIL_MQ).matches) closeChild();
}

function onPageLoad() {
  inflight?.abort();
  inflight = null;
}

export function initReadingSeriesPane() {
  if (typeof document === 'undefined') return;
  if (started) return;
  started = true;
  document.addEventListener('click', onClick, true);
  document.addEventListener('keydown', onKeydown, true);
  document.addEventListener('astro:page-load', onPageLoad);
  mq = window.matchMedia(RAIL_MQ);
  mq.addEventListener('change', onViewportChange);
}
