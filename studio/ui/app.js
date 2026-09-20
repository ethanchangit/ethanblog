import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@/styles/global.css';
import { groupedTags, tagGroups } from '@/data/tag-groups';
import { formatDate } from '@/lib/format';
import { initTheme, toggleTheme } from '@/lib/theme';
import { docRefMarkup, ensureMediaImport, hrefForOf } from '../blocks.mjs';
import { mountBlockEditor, mountCompareEditors } from './block-editor.js';
import './editor.css';

const root = document.getElementById('studio');
const ONLINE = Boolean(window.STUDIO_ONLINE);
const BLOG_ORIGIN = String(window.STUDIO_BLOG_ORIGIN || '');

const state = {
  docs: { articles: [], projects: [], pages: [], blogsRefs: [] },
  current: null,
  doc: null,
  sourceMode: false,
  lang: 'zh',
  dirty: false,
  saving: false,
  status: '',
  error: '',
  createOpen: false,
  createKind: 'article',
  createTitle: '',
  createSlug: '',
  linkOpen: false,
  linkMode: 'existing',
  git: null,
  commitMessage: '',
  lastCommitSha: '',
  filter: '',
  linkFilter: '',
  indexList: 'articles',
  bilingual: false,
  tagsOpen: false,
  tagCatalog: [],
  tagUsed: {},
  tagAdd: [],
  tagNewGroup: { slug: '', title: '', titleEn: '' },
  tagSaving: false,
  tagError: '',
  tagCatalogSaved: '',
  tagsFocus: null,
  child: null,
};

function todayIsoLocal() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

let bodyEditor = null;
let compareEditor = null;
let childEditor = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

function attr(value) {
  return esc(value).replace(/\n/g, '&#10;');
}

async function api(path, init) {
  const res = await fetch(`/__studio/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function fm() {
  return state.doc?.frontmatter ?? {};
}

function collectionKind() {
  const data = fm();
  if (data.listed === false) return 'library';
  if (state.doc?.id?.includes('/') && data.listed !== true) return 'library';
  if (data.slot === 'project') return 'project';
  return 'article';
}

function setCollectionKind(kind) {
  if (!state.doc || state.doc.collection === 'pages') return;
  const next = { ...fm() };
  const series = String(state.doc.id).includes('/');
  if (kind === 'library') {
    next.listed = false;
  } else {
    next.slot = kind === 'project' ? 'project' : 'article';
    if (series) next.listed = true;
    else delete next.listed;
    if (kind === 'article' && !String(next.date ?? '').slice(0, 10)) next.date = todayIsoLocal();
  }
  state.doc = { ...state.doc, frontmatter: next };
  if (kind === 'project') state.indexList = 'projects';
  else if (kind === 'article') state.indexList = 'articles';
  markDirty();
  render();
}

function canHaveChildren() {
  return Boolean(state.doc && state.doc.collection === 'articles');
}

function mentionPages() {
  return [...state.docs.articles, ...state.docs.projects, ...(state.docs.pages ?? [])];
}

function mentionPane() {
  return state.doc?.collection === 'pages' ? undefined : 'series';
}

function ensureStudioMediaImport() {
  if (!state.doc) return;
  state.doc = { ...state.doc, imports: ensureMediaImport(state.doc.imports) };
  markDirty();
}

async function createFromMention({ kind, title }) {
  if (!state.current) return null;
  state.error = '';
  try {
    if (isDirty()) await save({ reload: false });
    const payload = { kind, title };
    if (kind === 'child') {
      if (!canHaveChildren()) throw new Error('请先打开一篇文章再加子页面');
      payload.parentCollection = state.current.collection;
      payload.parentId = state.current.id;
    }
    const created = await api('/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    await refreshLists();
    const of = `${created.collection}/${created.id}`;
    state.status = kind === 'child' ? '已创建子页面' : '已创建';
    paintChrome();
    return { of, reloaded: false };
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
    return null;
  }
}

function canBilingual() {
  return Boolean(
    state.doc
    && !state.sourceMode
    && typeof state.doc.bodyZh === 'string'
    && typeof state.doc.bodyEn === 'string',
  );
}

function bilingualOn() {
  return Boolean(state.bilingual && canBilingual() && !state.child);
}

function bindBodyEditor() {
  bodyEditor?.destroy();
  compareEditor?.destroy();
  bodyEditor = null;
  compareEditor = null;
  if (!state.doc) return;
  if (bilingualOn()) {
    const host = root.querySelector('[data-compare-editor]');
    if (!(host instanceof HTMLElement)) return;
    compareEditor = mountCompareEditors(host, {
      zh: state.doc.bodyZh ?? '',
      en: state.doc.bodyEn ?? '',
      pages: mentionPages(),
      currentOf: `${state.doc.collection}/${state.doc.id}`,
      canCreateChild: canHaveChildren(),
      pane: mentionPane(),
      lang: state.lang,
      onChangeZh: (value) => setBody('bodyZh', value),
      onChangeEn: (value) => setBody('bodyEn', value),
      onEnsureImport: ensureStudioMediaImport,
      onCreate: (input) => createFromMention(input),
      onOpenEmbed: openChildEditor,
    });
    return;
  }
  const host = root.querySelector('[data-body-editor]');
  if (!(host instanceof HTMLElement)) return;
  const bodyKey = host.dataset.bodyEditor;
  bodyEditor = mountBlockEditor(host, {
    value: state.doc[bodyKey] ?? '',
    pages: mentionPages(),
    currentOf: `${state.doc.collection}/${state.doc.id}`,
    canCreateChild: canHaveChildren(),
    pane: mentionPane(),
    lang: state.lang,
    onChange: (value) => setBody(bodyKey, value),
    onEnsureImport: ensureStudioMediaImport,
    onCreate: (input) => createFromMention(input),
    onOpenEmbed: openChildEditor,
  });
}

function previewSrc() {
  if (!state.doc) return '';
  return hrefPreview(state.doc.href);
}

function hrefPreview(href) {
  const path = href || '/';
  const relative = state.lang === 'zh' && path !== '/' ? `/zh${path}` : path;
  return BLOG_ORIGIN ? `${BLOG_ORIGIN}${relative}` : relative;
}

function parseDocOf(of) {
  const raw = String(of ?? '').trim();
  if (!raw) return null;
  if (raw === 'blogs') return { collection: 'pages', id: 'blogs' };
  const slash = raw.indexOf('/');
  if (slash <= 0) return null;
  const collection = raw.slice(0, slash);
  const id = raw.slice(slash + 1);
  if (!collection || !id) return null;
  return { collection, id };
}

function childKey(child = state.child) {
  return child ? `${child.collection}/${child.id}` : '';
}

function currentKey() {
  return state.current ? `${state.current.collection}/${state.current.id}` : '';
}

function isDirty() {
  return Boolean(state.dirty || state.child?.dirty);
}

function confirmLeave(message = '有未保存的改动，确定离开？') {
  return !isDirty() || window.confirm(message);
}

function bindChildEditor() {
  childEditor?.destroy();
  childEditor = null;
  if (!state.child?.doc) return;
  const host = root.querySelector('[data-child-body-editor]');
  if (!(host instanceof HTMLElement)) return;
  const bodyKey = host.dataset.childBodyEditor;
  childEditor = mountBlockEditor(host, {
    value: state.child.doc[bodyKey] ?? '',
    pages: mentionPages(),
    currentOf: childKey(),
    canCreateChild: false,
    pane: 'embed',
    lang: state.lang,
    onChange: (value) => setChildBody(bodyKey, value),
    onEnsureImport: ensureChildMediaImport,
    onCreate: (input) => createFromMention(input),
    onOpenEmbed: openChildEditor,
  });
}

async function openChildEditor({ of }) {
  const parsed = parseDocOf(of);
  if (!parsed) return;
  const nextOf = `${parsed.collection}/${parsed.id}`;
  if (currentKey() === nextOf) {
    if (state.child) closeChildEditor();
    return;
  }
  if (childKey() === nextOf && state.child?.doc) return;
  if (state.child?.dirty && childKey() !== nextOf) {
    if (!window.confirm('侧栏有未保存的改动，确定离开？')) return;
  }
  const hadRail = Boolean(root.querySelector('.studio-rail'));
  state.child = {
    collection: parsed.collection,
    id: parsed.id,
    of: nextOf,
    doc: null,
    dirty: false,
    loading: true,
    error: '',
  };
  if (hadRail) paintChildRail();
  else render();
  try {
    const doc = await api(`/doc?collection=${encodeURIComponent(parsed.collection)}&id=${encodeURIComponent(parsed.id)}`);
    if (childKey() !== nextOf) return;
    state.child = { ...state.child, doc, loading: false, error: '' };
    persist();
    paintChildRail();
  } catch (err) {
    if (childKey() !== nextOf) return;
    state.child = {
      ...state.child,
      loading: false,
      error: err instanceof Error ? err.message : String(err),
    };
    paintChildRail();
  }
}

function childRailHtml() {
  const item = state.child;
  if (!item) return '';
  const isEn = state.lang === 'en';
  const closeLabel = isEn ? 'Close' : '关闭';
  const previewLabel = isEn ? 'preview in the new tab' : '打开新标签进行预览';
  if (item.loading) {
    return `
    <div class="studio-child" data-testid="studio-child">
      <div class="studio-child__bar">
        <p class="ui-meta">${esc(item.of)}</p>
        <button type="button" class="text-sm text-ink-400 underline decoration-ink-500 underline-offset-4" data-action="close-child" data-testid="studio-child-close">${closeLabel}</button>
      </div>
      <p class="ui-meta">${isEn ? 'Opening…' : '打开中…'}</p>
    </div>`;
  }
  if (item.error || !item.doc) {
    return `
    <div class="studio-child" data-testid="studio-child">
      <div class="studio-child__bar">
        <p class="ui-meta">${esc(item.of)}</p>
        <button type="button" class="text-sm text-ink-400 underline decoration-ink-500 underline-offset-4" data-action="close-child" data-testid="studio-child-close">${closeLabel}</button>
      </div>
      <p class="text-sm text-ink-200" role="alert">${esc(item.error || (isEn ? 'Could not open this page.' : '无法打开这篇页面。'))}</p>
    </div>`;
  }
  const data = item.doc.frontmatter ?? {};
  const titleKey = isEn ? 'titleEn' : 'title';
  const bodyKey = isEn ? 'bodyEn' : 'bodyZh';
  const src = hrefPreview(item.doc.href || hrefForOf(item.of));
  return `
    <div class="studio-child" data-testid="studio-child">
      <div class="studio-child__bar">
        <p class="ui-meta">${esc(item.of)}</p>
        <div class="studio-child__bar-actions">
          <a class="text-sm text-ink-400 underline decoration-ink-500 underline-offset-4" href="${attr(src)}" target="_blank" rel="noreferrer">${previewLabel}</a>
          <button type="button" class="text-sm text-ink-400 underline decoration-ink-500 underline-offset-4" data-action="close-child" data-testid="studio-child-close">${closeLabel}</button>
        </div>
      </div>
      <label><span class="ui-meta">${isEn ? 'Title' : '标题'}</span><input class="comment-field" data-testid="studio-child-title-field" data-child-fm="${titleKey}" value="${attr(data[titleKey] ?? '')}" /></label>
      <div class="studio-editor min-h-0 flex-1 overflow-y-auto" data-testid="studio-child-editor" data-child-body-editor="${bodyKey}"></div>
    </div>`;
}

function paintChildRail() {
  const rail = root.querySelector('.studio-rail');
  if (!(rail instanceof HTMLElement)) return;
  childEditor?.destroy();
  childEditor = null;
  rail.innerHTML = state.child ? childRailHtml() : metaHtml();
  bindChildEditor();
}

function closeChildEditor() {
  if (!state.child) return;
  if (state.child.dirty && !window.confirm('侧栏有未保存的改动，确定关闭？')) return;
  const restoreBilingual = Boolean(state.bilingual);
  childEditor?.destroy();
  childEditor = null;
  state.child = null;
  persist();
  if (restoreBilingual) render();
  else paintChildRail();
}

function markChildDirty() {
  if (!state.child) return;
  state.child.dirty = true;
  persist();
  const flag = root.querySelector('[data-studio-dirty]');
  if (flag) flag.hidden = false;
}

function setChildFm(key, value) {
  if (!state.child?.doc) return;
  state.child = {
    ...state.child,
    doc: { ...state.child.doc, frontmatter: { ...state.child.doc.frontmatter, [key]: value } },
  };
  markChildDirty();
}

function setChildBody(which, value) {
  if (!state.child?.doc) return;
  state.child = { ...state.child, doc: { ...state.child.doc, [which]: value } };
  markChildDirty();
}

function ensureChildMediaImport() {
  if (!state.child?.doc) return;
  state.child = {
    ...state.child,
    doc: { ...state.child.doc, imports: ensureMediaImport(state.child.doc.imports) },
  };
  markChildDirty();
}

function matchesFilter(item) {
  const q = state.filter.trim().toLowerCase();
  if (!q) return true;
  const tags = Array.isArray(item.tags) ? item.tags.join(' ') : '';
  return [item.id, item.title, item.titleEn, item.description, item.descriptionEn, tags]
    .join('\n')
    .toLowerCase()
    .includes(q);
}

function parseIsoDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  if (!match) return null;
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
}

let tagQuery = '';
let tagHighlight = 0;
let tagPickerOpen = false;

function selectedTags() {
  const tags = fm().tags;
  if (!Array.isArray(tags)) return [];
  return tags.map((tag) => String(tag).trim()).filter(Boolean);
}

function allKnownTags() {
  const tags = new Set(tagGroups.flatMap((group) => group.tags));
  for (const item of [...state.docs.articles, ...state.docs.projects]) {
    if (!Array.isArray(item.tags)) continue;
    for (const tag of item.tags) {
      const value = String(tag ?? '').trim();
      if (value) tags.add(value);
    }
  }
  for (const tag of selectedTags()) tags.add(tag);
  return [...tags];
}

function tagMatchItems(query, selected) {
  const selectedSet = new Set(selected);
  const q = String(query ?? '').trim().toLowerCase();
  const items = [];
  for (const group of groupedTags(allKnownTags())) {
    const title = state.lang === 'en' ? group.titleEn : group.title;
    const haystack = [group.title, group.titleEn, title].join('\n').toLowerCase();
    const groupHit = Boolean(q) && haystack.includes(q);
    for (const tag of group.tags) {
      if (selectedSet.has(tag)) continue;
      if (q && !groupHit && !tag.toLowerCase().includes(q)) continue;
      items.push({ tag, group, title });
    }
  }
  return items;
}

function tagChipsHtml(selected, isEn) {
  if (!selected.length) return '';
  return selected.map((tag) => `
    <li class="studio-tag-chip">
      <span class="ui-tag">${esc(tag)}</span>
      <button type="button" class="studio-tag-chip__remove" data-action="remove-tag" data-tag="${attr(tag)}" aria-label="${isEn ? `Remove ${esc(tag)}` : `移除 ${esc(tag)}`}">×</button>
    </li>`).join('');
}

function tagsListHtml(items, highlight, isEn, query) {
  const q = String(query ?? '').trim();
  if (!items.length) {
    if (q) {
      return `<button type="button" class="studio-at-item" role="option" id="studio-tag-opt-0" data-action="add-tag" data-tag="${attr(q)}" data-tag-create="true" data-testid="studio-tag-create" aria-selected="true">
        <span class="studio-at-item__title">${esc(q)}</span>
        <span class="studio-at-item__meta ui-meta">${isEn ? 'Not in catalog — add anyway' : '不在目录中，仍然添加'}</span>
      </button>`;
    }
    return `<p class="ui-meta">${isEn ? 'No matching tags.' : '没有匹配的标签。'}</p>`;
  }
  const grouped = !q;
  const parts = [];
  let lastSlug = '';
  items.forEach((item, index) => {
    if (grouped && item.group.slug !== lastSlug) {
      lastSlug = item.group.slug;
      parts.push(`<p class="studio-tag-picker__heading ui-meta">${esc(item.title)}</p>`);
    }
    const meta = grouped ? '' : `<span class="studio-at-item__meta ui-meta">${esc(item.title)}</span>`;
    const optionLabel = isEn ? `${item.tag} (${item.title})` : `${item.tag}（${item.title}）`;
    parts.push(`<button type="button" class="studio-at-item" role="option" id="studio-tag-opt-${index}" data-action="add-tag" data-tag="${attr(item.tag)}" data-testid="studio-tag-option" aria-selected="${index === highlight ? 'true' : 'false'}" aria-label="${attr(optionLabel)}">
      <span class="studio-at-item__title">${esc(item.tag)}</span>
      ${meta}
    </button>`);
  });
  return parts.join('');
}

function tagsPickerHtml() {
  const isEn = state.lang === 'en';
  const selected = selectedTags();
  const items = tagMatchItems(tagQuery, selected);
  if (tagHighlight >= items.length) tagHighlight = Math.max(0, items.length - 1);
  const activedescendant = tagPickerOpen && (items.length || tagQuery.trim())
    ? `studio-tag-opt-${items.length ? tagHighlight : 0}`
    : '';
  return `
    <div class="studio-tag-picker" data-tag-picker>
      <span class="ui-meta" id="studio-tags-label">${isEn ? 'Tags' : '标签'}</span>
      <ul class="ui-tag-list ui-tag-list--start" data-tag-chips>${tagChipsHtml(selected, isEn)}</ul>
      <input class="comment-field" type="search" autocomplete="off" data-tags data-testid="studio-tags" role="combobox" aria-labelledby="studio-tags-label" aria-autocomplete="list" aria-expanded="${tagPickerOpen ? 'true' : 'false'}" aria-controls="studio-tag-list" aria-activedescendant="${attr(activedescendant)}" placeholder="${isEn ? 'Search existing tags' : '搜索已有标签'}" value="${attr(tagQuery)}" />
      <div class="studio-tag-picker__list" id="studio-tag-list" data-tag-list role="listbox" aria-labelledby="studio-tags-label" ${tagPickerOpen ? '' : 'hidden'}>
        ${tagsListHtml(items, tagHighlight, isEn, tagQuery)}
      </div>
    </div>`;
}

function paintTagsPicker() {
  const host = root.querySelector('[data-tag-picker]');
  if (!(host instanceof HTMLElement)) return;
  const isEn = state.lang === 'en';
  const selected = selectedTags();
  const items = tagMatchItems(tagQuery, selected);
  if (tagHighlight >= items.length) tagHighlight = Math.max(0, items.length - 1);
  const chips = host.querySelector('[data-tag-chips]');
  if (chips) chips.innerHTML = tagChipsHtml(selected, isEn);
  const list = host.querySelector('[data-tag-list]');
  if (list instanceof HTMLElement) {
    list.hidden = !tagPickerOpen;
    list.innerHTML = tagsListHtml(items, tagHighlight, isEn, tagQuery);
  }
  const input = host.querySelector('[data-tags]');
  if (input instanceof HTMLInputElement) {
    input.setAttribute('aria-expanded', tagPickerOpen ? 'true' : 'false');
    const activedescendant = tagPickerOpen && (items.length || tagQuery.trim())
      ? `studio-tag-opt-${items.length ? tagHighlight : 0}`
      : '';
    if (activedescendant) input.setAttribute('aria-activedescendant', activedescendant);
    else input.removeAttribute('aria-activedescendant');
    if (input.value !== tagQuery) input.value = tagQuery;
  }
}

function addTag(tag) {
  const value = String(tag ?? '').trim();
  if (!value) return;
  const current = selectedTags();
  if (current.includes(value)) {
    tagQuery = '';
    tagHighlight = 0;
    paintTagsPicker();
    return;
  }
  setFm('tags', [...current, value]);
  tagQuery = '';
  tagHighlight = 0;
  tagPickerOpen = true;
  paintTagsPicker();
}

function removeTag(tag) {
  setFm('tags', selectedTags().filter((item) => item !== tag));
  paintTagsPicker();
}

function parentIdOf(id) {
  const slash = String(id ?? '').lastIndexOf('/');
  return slash === -1 ? undefined : id.slice(0, slash);
}

function depthOf(id) {
  return (String(id).match(/\//g) || []).length;
}

function orderedWithChildren(items) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const children = new Map();
  const roots = [];
  for (const item of items) {
    const parent = parentIdOf(item.id);
    if (parent && byId.has(parent)) {
      const list = children.get(parent) ?? [];
      list.push(item);
      children.set(parent, list);
    } else {
      roots.push(item);
    }
  }
  const out = [];
  const walk = (item) => {
    out.push(item);
    for (const child of (children.get(item.id) ?? []).sort((a, b) => a.id.localeCompare(b.id))) {
      walk(child);
    }
  };
  for (const item of roots) walk(item);
  return out;
}

function setFm(key, value) {
  if (!state.doc) return;
  state.doc = { ...state.doc, frontmatter: { ...state.doc.frontmatter, [key]: value } };
  markDirty();
  if (key === 'title' || key === 'titleEn') {
    const lang = key === 'title' ? 'zh' : 'en';
    const tab = root.querySelector(`[data-lang="${lang}"]`);
    if (tab) tab.textContent = value || (lang === 'zh' ? '中文' : 'English');
  }
}

function setBody(which, value) {
  if (!state.doc) return;
  state.doc = { ...state.doc, [which]: value };
  markDirty();
}

function persist() {
  try {
    sessionStorage.setItem(
      'studio-state',
      JSON.stringify({
        current: state.current,
        doc: state.doc,
        sourceMode: state.sourceMode,
        lang: state.lang,
        dirty: state.dirty,
        filter: state.filter,
        indexList: state.indexList,
        bilingual: state.bilingual,
        commitMessage: state.commitMessage,
        lastCommitSha: state.lastCommitSha,
        child: childSnapshot(),
      }),
    );
  } catch {
    // ignore quota
  }
}

function childSnapshot() {
  if (!state.child?.doc) return null;
  return {
    collection: state.child.collection,
    id: state.child.id,
    of: state.child.of,
    doc: state.child.doc,
    dirty: Boolean(state.child.dirty),
  };
}

const COL_STORAGE_KEY = 'studio-col-widths';
const COL_MIN_REM = 14;
const COL_GUTTER_REM = 8;
let colDragging = false;

function remPx() {
  return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

function readColWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(COL_STORAGE_KEY) || '');
    if (
      Number.isFinite(saved?.index)
      && Number.isFinite(saved?.editor)
      && Number.isFinite(saved?.rail)
    ) {
      return { index: saved.index, editor: saved.editor, rail: saved.rail };
    }
  } catch {
    // ignore
  }
  return null;
}

function writeColWidths(widths) {
  try {
    localStorage.setItem(COL_STORAGE_KEY, JSON.stringify({
      index: Math.round(widths.index),
      editor: Math.round(widths.editor),
      rail: Math.round(widths.rail),
    }));
  } catch {
    // ignore quota
  }
}

function defaultColWidths(host) {
  const rem = remPx();
  const min = COL_MIN_REM * rem;
  const pad = COL_GUTTER_REM * rem;
  const avail = Math.max(min * 3, host.clientWidth - pad);
  if (host.classList.contains('studio-columns--compare')) {
    const index = Math.min(24 * rem, Math.max(min, avail / 4));
    const half = Math.max(min, (avail - index) / 2);
    return { index, editor: half, rail: half };
  }
  return {
    index: 24 * rem,
    editor: 42 * rem,
    rail: 24 * rem,
  };
}

function fitColWidths(host, widths) {
  const rem = remPx();
  const min = COL_MIN_REM * rem;
  const pad = COL_GUTTER_REM * rem;
  const maxSum = Math.max(min * 3, host.clientWidth - pad);
  let index = Math.max(min, widths.index);
  let editor = Math.max(min, widths.editor);
  let rail = Math.max(min, widths.rail);
  const sum = index + editor + rail;
  if (sum > maxSum) {
    const scale = maxSum / sum;
    index = Math.max(min, index * scale);
    editor = Math.max(min, editor * scale);
    rail = Math.max(min, rail * scale);
  }
  return { index, editor, rail };
}

function setColVars(host, widths) {
  const next = fitColWidths(host, widths);
  host.style.setProperty('--studio-col-index', `${Math.round(next.index)}px`);
  host.style.setProperty('--studio-col-editor', `${Math.round(next.editor)}px`);
  host.style.setProperty('--studio-col-rail', `${Math.round(next.rail)}px`);
  return next;
}

function currentColWidths(host) {
  const style = getComputedStyle(host);
  return {
    index: Number.parseFloat(style.getPropertyValue('--studio-col-index')) || 0,
    editor: Number.parseFloat(style.getPropertyValue('--studio-col-editor')) || 0,
    rail: Number.parseFloat(style.getPropertyValue('--studio-col-rail')) || 0,
  };
}

function applyColumnLayout() {
  const host = root.querySelector('.studio-columns');
  if (!(host instanceof HTMLElement) || colDragging) return;
  setColVars(host, readColWidths() ?? defaultColWidths(host));
}

function onColResizePointerDown(event) {
  if (!(event instanceof PointerEvent) || event.button !== 0) return;
  const handle = event.target instanceof Element
    ? event.target.closest('[data-studio-resize]')
    : null;
  if (!(handle instanceof HTMLElement)) return;
  const host = handle.closest('.studio-columns');
  if (!(host instanceof HTMLElement) || window.matchMedia('(max-width: 767px)').matches) return;
  const edge = handle.dataset.studioResize;
  if (edge !== 'index' && edge !== 'rail') return;
  event.preventDefault();
  const startX = event.clientX;
  const start = currentColWidths(host);
  const min = COL_MIN_REM * remPx();
  colDragging = true;
  host.classList.add('is-resizing');
  handle.setPointerCapture(event.pointerId);

  const move = (ev) => {
    const delta = ev.clientX - startX;
    const next = { ...start };
    if (edge === 'index') {
      const pair = start.index + start.editor;
      next.index = Math.min(pair - min, Math.max(min, start.index + delta));
      next.editor = pair - next.index;
    } else {
      const pair = start.editor + start.rail;
      next.editor = Math.min(pair - min, Math.max(min, start.editor + delta));
      next.rail = pair - next.editor;
    }
    host.style.setProperty('--studio-col-index', `${Math.round(next.index)}px`);
    host.style.setProperty('--studio-col-editor', `${Math.round(next.editor)}px`);
    host.style.setProperty('--studio-col-rail', `${Math.round(next.rail)}px`);
  };

  const stop = (ev) => {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', stop);
    handle.removeEventListener('pointercancel', stop);
    colDragging = false;
    host.classList.remove('is-resizing');
    if (handle.hasPointerCapture(ev.pointerId)) handle.releasePointerCapture(ev.pointerId);
    writeColWidths(currentColWidths(host));
  };

  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', stop);
  handle.addEventListener('pointercancel', stop);
}

function restoreSession() {
  try {
    const raw = sessionStorage.getItem('studio-state');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved?.current && saved?.doc) {
      state.current = saved.current;
      state.doc = saved.doc;
      state.sourceMode = Boolean(saved.sourceMode);
      state.lang = saved.lang === 'en' || saved.previewLang === 'en' ? 'en' : 'zh';
      state.dirty = Boolean(saved.dirty);
      state.filter = saved.filter ?? '';
      state.indexList = saved.indexList === 'projects' ? 'projects' : 'articles';
      state.bilingual = Boolean(saved.bilingual);
      state.commitMessage = saved.commitMessage ?? '';
      state.lastCommitSha = saved.lastCommitSha ?? '';
      if (saved.child?.doc && saved.child.collection && saved.child.id) {
        state.child = {
          collection: saved.child.collection,
          id: saved.child.id,
          of: saved.child.of || `${saved.child.collection}/${saved.child.id}`,
          doc: saved.child.doc,
          dirty: Boolean(saved.child.dirty),
          loading: false,
          error: '',
        };
      }
    }
  } catch {
    sessionStorage.removeItem('studio-state');
  }
}

function paintChrome() {
  const dirty = root.querySelector('[data-studio-dirty]');
  if (dirty) dirty.hidden = !isDirty();
  const status = root.querySelector('[data-studio-status]');
  if (status) {
    status.hidden = !state.status;
    status.textContent = state.status;
  }
  const saveBtn = root.querySelector('[data-action="save"]');
  if (saveBtn instanceof HTMLButtonElement) {
    saveBtn.disabled = !state.doc || state.saving;
    saveBtn.textContent = state.saving ? '保存中' : '保存';
  }
}

function markDirty() {
  state.dirty = true;
  persist();
  const flag = root.querySelector('[data-studio-dirty]');
  if (flag) flag.hidden = false;
}

async function refreshLists() {
  state.docs = await api('/docs');
  state.git = await api('/git');
  if (state.git?.lastUserCommitSha) state.lastCommitSha = state.git.lastUserCommitSha;
}

async function openDoc(collection, id) {
  if (!confirmLeave()) return;
  const next = await api(`/doc?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`);
  childEditor?.destroy();
  childEditor = null;
  state.current = { collection, id };
  state.doc = next;
  state.sourceMode = false;
  state.dirty = false;
  state.error = '';
  state.status = '';
  state.child = null;
  if (collection === 'projects') state.indexList = 'projects';
  else if (collection === 'articles') state.indexList = 'articles';
  persist();
  render();
}

async function save(opts = {}) {
  if (!state.doc || !state.current || state.saving) return;
  state.saving = true;
  state.error = '';
  const saveBtn = root.querySelector('[data-action="save"]');
  if (saveBtn instanceof HTMLButtonElement) {
    saveBtn.disabled = true;
    saveBtn.textContent = '保存中';
  }
  try {
    const saved = await api('/doc', {
      method: 'PUT',
      body: JSON.stringify({
        collection: state.current.collection,
        id: state.current.id,
        sourceMode: state.sourceMode,
        raw: state.doc.raw,
        frontmatter: state.doc.frontmatter,
        imports: state.doc.imports,
        bodyZh: state.doc.bodyZh,
        bodyEn: state.doc.bodyEn,
        draftVersion: state.doc.draftVersion ?? 0,
      }),
    });
    state.doc = saved;
    state.dirty = false;
    if (state.child?.doc) {
      const savedChild = await api('/doc', {
        method: 'PUT',
        body: JSON.stringify({
          collection: state.child.collection,
          id: state.child.id,
          sourceMode: false,
          frontmatter: state.child.doc.frontmatter,
          imports: state.child.doc.imports,
          bodyZh: state.child.doc.bodyZh,
          bodyEn: state.child.doc.bodyEn,
          draftVersion: state.child.doc.draftVersion ?? 0,
        }),
      });
      state.child = { ...state.child, doc: savedChild, dirty: false };
    }
    persist();
    await refreshLists();
    state.status = '已保存';
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
  } finally {
    state.saving = false;
    persist();
    if (state.error) render();
    else paintChrome();
  }
}

function openCreate(kind) {
  state.createKind = kind;
  state.createTitle = '';
  state.createSlug = '';
  state.createOpen = true;
  state.error = '';
  render();
}

async function createDocFromForm() {
  state.error = '';
  const fromLinkDialog = state.linkOpen && state.createKind === 'child';
  try {
    const payload = {
      kind: state.createKind,
      title: state.createTitle,
      slug: state.createSlug,
    };
    if (state.createKind === 'child') {
      if (!state.current || !canHaveChildren()) throw new Error('请先打开一篇文章再加子页面');
      if (isDirty()) await save({ reload: false });
      payload.parentCollection = state.current.collection;
      payload.parentId = state.current.id;
    }
    const created = await api('/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.createOpen = false;
    state.createTitle = '';
    state.createSlug = '';
    await refreshLists();
    const of = `${created.collection}/${created.id}`;
    if (fromLinkDialog) {
      await copyLinkMarkup(of);
      return;
    }
    const next = await api(
      `/doc?collection=${encodeURIComponent(created.collection)}&id=${encodeURIComponent(created.id)}`,
    );
    state.current = { collection: created.collection, id: created.id };
    state.doc = next;
    state.sourceMode = false;
    state.dirty = false;
    state.error = '';
    state.status = state.createKind === 'child' ? '已创建子页面' : '已创建';
    persist();
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

async function copyLinkMarkup(of) {
  const snippet = docRefMarkup(of, mentionPane());
  try {
    await navigator.clipboard.writeText(snippet);
    state.linkOpen = false;
    state.linkFilter = '';
    state.status = '已复制';
    persist();
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

async function commit() {
  state.error = '';
  try {
    if (isDirty()) await save();
    state.git = await api('/git/commit', {
      method: 'POST',
      body: JSON.stringify({ message: state.commitMessage }),
    });
    state.lastCommitSha = state.git.commitSha || state.lastCommitSha;
    state.commitMessage = '';
    state.status = ONLINE ? '已提交到 GitHub' : '已提交到仓库';
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

async function pushRemote() {
  state.error = '';
  try {
    state.git = await api('/git/push', { method: 'POST' });
    state.status = ONLINE ? '内容已经写入 GitHub' : '已推送到远程（生产仍需手动 Deploy workflow）';
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

async function publishRemote() {
  state.error = '';
  try {
    if (isDirty()) await save();
    const commitSha = state.lastCommitSha || state.git?.lastUserCommitSha;
    if (!commitSha) throw new Error('请先提交内容到 GitHub，再发布。');
    const result = await api('/git/publish', {
      method: 'POST',
      body: JSON.stringify({ commitSha }),
    });
    state.git = { ...(state.git || {}), release: result.release };
    state.status = result.release?.status === 'failed' ? '发布触发失败' : '已触发发布，正在等待 GitHub Actions';
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

function itemCard(item, collection) {
  const active = state.current?.id === item.id && state.current?.collection === collection;
  const en = state.lang === 'en';
  const title = en && item.titleEn ? item.titleEn : item.title;
  const description = en && item.descriptionEn ? item.descriptionEn : item.description;
  const date = parseIsoDate(item.date);
  const meta = date ? formatDate(date, en ? 'en' : 'zh-CN') : '';
  const tags = Array.isArray(item.tags) ? item.tags.slice(0, 3) : [];
  const indents = ['', 'pl-3', 'pl-6', 'pl-9'];
  const indentClass = indents[Math.min(depthOf(item.id), 3)];
  return `<li${indentClass ? ` class="${indentClass}"` : ''}>
    <button type="button" class="studio-index-card group" data-open="${collection}:${esc(item.id)}"${item.draft ? ' data-draft' : ''}${active ? ' aria-current="page"' : ''}>
      <div class="flex items-start justify-between gap-3">
        <h3 class="text-lg font-semibold text-ink-100 underline decoration-transparent underline-offset-4 transition-colors group-hover:decoration-ink-500">${esc(title)}</h3>
        ${item.draft ? `<span class="ui-badge">${en ? 'Draft' : '草稿'}</span>` : ''}
      </div>
      ${description ? `<p class="mt-2 line-clamp-2 text-sm leading-relaxed text-ink-400 transition-colors group-hover:text-ink-300">${esc(description)}</p>` : ''}
      <div class="mt-auto flex items-center justify-between gap-3 pt-3">
        ${meta ? `<p class="ui-meta">${esc(meta)}</p>` : ''}
        ${tags.length ? `<ul class="ui-tag-list">${tags.map((tag) => `<li class="ui-tag">${esc(tag)}</li>`).join('')}</ul>` : ''}
      </div>
    </button>
  </li>`;
}

function isRootAmong(item, items) {
  const parent = parentIdOf(item.id);
  return !parent || !items.some((other) => other.id === parent);
}

function groupArticleBlocks(items) {
  const blocks = [];
  for (const item of items) {
    if (isRootAmong(item, items)) blocks.push({ item, descendants: [] });
    else if (blocks.length) blocks[blocks.length - 1].descendants.push(item);
    else blocks.push({ item, descendants: [] });
  }
  const groups = [];
  for (const block of blocks) {
    const year = parseIsoDate(block.item.date)?.getUTCFullYear() ?? 0;
    const last = groups[groups.length - 1];
    if (last && last.year === year) last.blocks.push(block);
    else groups.push({ year, blocks: [block] });
  }
  return groups;
}

function articleIndexHtml() {
  const groups = groupArticleBlocks(visibleArticles());
  if (!groups.length) return `<p class="ui-meta">没有匹配的文章</p>`;
  return groups.map((group, index) => `
    <section class="${index > 0 ? 'mt-10' : ''}">
      ${group.year ? `<h2 class="mb-2 text-xl font-semibold tracking-tight text-ink-100 sm:text-2xl">${group.year}</h2>` : ''}
      <ul class="flex flex-col">${group.blocks.flatMap((block) => [itemCard(block.item, 'articles'), ...block.descendants.map((child) => itemCard(child, 'articles'))]).join('')}</ul>
    </section>
  `).join('');
}

function projectIndexHtml() {
  const items = state.docs.projects.filter(matchesFilter);
  if (!items.length) return `<p class="ui-meta">没有匹配的项目</p>`;
  return `<ul class="flex flex-col">${items.map((item) => itemCard(item, 'projects')).join('')}</ul>`;
}

function indexAsideHtml() {
  const articles = state.indexList !== 'projects';
  return `
        <aside class="studio-index px-4 sm:px-6 md:px-4" data-testid="studio-index">
          <div class="studio-index-scroll pb-8">
            <div class="reading-index-heading studio-index-heading">
              <nav class="reading-index-switch" aria-label="切换文章或项目">
                ${articles ? `
                  <h1 class="reading-index-switch-title" aria-current="page">文章</h1>
                  <button type="button" class="reading-index-switch-alt" data-action="index-list" data-index-list="projects">项目</button>
                ` : `
                  <h1 class="reading-index-switch-title" aria-current="page">项目</h1>
                  <button type="button" class="reading-index-switch-alt" data-action="index-list" data-index-list="articles">文章</button>
                `}
              </nav>
              <button type="button" class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-article" data-create-kind="article" ${articles ? '' : 'hidden'}>新建</button>
              <button type="button" class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-project" data-create-kind="project" ${articles ? 'hidden' : ''}>新建</button>
            </div>
            <label class="mb-6 block"><span class="sr-only">筛选</span><input class="comment-field" type="search" placeholder="${articles ? '筛选文章' : '筛选项目'}" data-testid="studio-filter" data-filter value="${attr(state.filter)}" /></label>
            ${articles ? articleIndexHtml() : projectIndexHtml()}
            <section class="mt-10">
              <h2 class="ui-meta mb-2">博客名单</h2>
              <button type="button" class="block w-full py-1.5 text-left text-sm ${state.current?.id === 'blogs' ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100'}" data-testid="studio-open-blogs" data-open="pages:blogs">/blogs</button>
            </section>
          </div>
          <section class="shrink-0 pt-4 pb-4">
            <h2 class="ui-meta mb-2">${ONLINE ? 'GitHub' : '仓库'}</h2>
            ${state.git ? `<p class="text-sm text-ink-400">${esc(state.git.branch)}${state.git.dirty ? ` · ${state.git.files.length} 个私人草稿改动` : ''}</p>` : ''}
            <label class="mt-3 block"><span class="sr-only">提交说明</span><input class="comment-field" placeholder="提交说明" data-testid="studio-commit-message" data-commit value="${attr(state.commitMessage)}" /></label>
            <div class="mt-3 flex flex-wrap gap-4 text-sm">
              <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-commit" data-action="commit">${ONLINE ? '提交到 GitHub' : '提交内容'}</button>
              ${ONLINE ? `<button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-publish" data-action="publish" ${state.lastCommitSha ? '' : 'disabled'}>发布</button>` : `<button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-push" data-action="push">推送远程</button>`}
            </div>
            ${ONLINE && state.git?.release ? `<p class="mt-3 text-sm text-ink-400">发布：${esc(releaseLabel(state.git.release))}${state.git.release.workflowUrl ? ` · <a class="underline" href="${attr(state.git.release.workflowUrl)}" target="_blank" rel="noreferrer">Actions</a>` : ''}</p>` : ''}
          </section>
        </aside>`;
}

function releaseLabel(release) {
  const labels = { dispatching: '触发中', queued: '排队中', building: '验证与构建中', running: '部署中', deployed: '已完成', failed: '失败' };
  return labels[release?.stage] || labels[release?.status] || '未知状态';
}

function visibleArticles() {
  const items = state.docs.articles;
  const matched = items.filter(matchesFilter);
  if (!state.filter.trim()) return orderedWithChildren(items);
  const keep = new Set(matched.map((item) => item.id));
  for (const item of matched) {
    let parent = parentIdOf(item.id);
    while (parent) {
      keep.add(parent);
      parent = parentIdOf(parent);
    }
  }
  return orderedWithChildren(items.filter((item) => keep.has(item.id)));
}

function editorToolbarHtml() {
  const bilingual = canBilingual();
  return `
    <div class="mb-4 flex flex-wrap items-center gap-4 text-sm">
      <span class="font-mono text-xs text-ink-500">${esc(state.doc.collection)}/${esc(state.doc.id)}</span>
      <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-action="toggle-source">${state.sourceMode ? '页面' : '源码'}</button>
      ${state.doc.collection !== 'pages' || state.doc.id === 'blogs' ? `
        <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-link" data-action="open-link">插入页面</button>
      ` : ''}
      ${bilingual ? `
        <button type="button" class="${state.bilingual ? 'text-ink-100' : 'text-ink-200'} underline decoration-ink-500 underline-offset-4" data-testid="studio-bilingual" data-action="toggle-bilingual" aria-pressed="${state.bilingual ? 'true' : 'false'}">对照翻译</button>
      ` : ''}
    </div>`;
}

function editorTitleHtml() {
  const data = fm();
  const zhTitle = data.title || '中文';
  const enTitle = data.titleEn || 'English';
  return `
    <div class="mb-6 flex min-w-0 gap-8">
      <button type="button" class="truncate text-xl font-semibold ${state.lang === 'zh' ? 'text-ink-100 underline decoration-ink-500 underline-offset-8' : 'text-ink-400 hover:text-ink-100'}" data-testid="studio-lang-zh" data-lang="zh">${esc(zhTitle)}</button>
      <button type="button" class="truncate text-xl font-semibold ${state.lang === 'en' ? 'text-ink-100 underline decoration-ink-500 underline-offset-8' : 'text-ink-400 hover:text-ink-100'}" data-testid="studio-lang-en" data-lang="en">${esc(enTitle)}</button>
    </div>`;
}

function editorHtml() {
  if (!state.doc) {
    return `<p class="max-w-md text-ink-400">选一篇已有文章，或按「新建」。顶部两个标题切换中文 / 英文，一次只写一页。</p>`;
  }
  const toolbar = editorToolbarHtml();
  if (state.sourceMode) {
    return `<div class="studio-measure">${toolbar}<textarea class="min-h-0 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none" spellcheck="false" data-testid="studio-source" data-body="raw">${esc(state.doc.raw)}</textarea></div>`;
  }
  const bodyKey = state.lang === 'en' ? 'bodyEn' : 'bodyZh';
  const testId = state.lang === 'en' ? 'studio-body-en' : 'studio-body-zh';
  return `
    <div class="studio-measure">
    ${editorTitleHtml()}
    ${toolbar}
    <div class="studio-editor min-h-0 flex-1 overflow-y-auto" data-testid="${testId}" data-body-editor="${bodyKey}"></div>
    </div>`;
}

function compareColumnsHtml() {
  const data = fm();
  const zhTitle = data.title || '中文';
  const enTitle = data.titleEn || 'English';
  return `
    <div class="studio-doc-head">
      <p class="mb-6 truncate text-xl font-semibold text-ink-100">${esc(zhTitle)}</p>
      ${editorToolbarHtml()}
    </div>
    <div class="studio-rail-head">
      <p class="mb-6 truncate text-xl font-semibold text-ink-400">${esc(enTitle)}</p>
      <p class="ui-meta">逐段对照，点一段即可改</p>
    </div>
    <div class="studio-compare" data-compare-editor data-testid="studio-compare"></div>`;
}

function resizeHandleHtml(edge, label) {
  return `<button type="button" class="studio-resize studio-resize--${edge}" data-studio-resize="${edge}" aria-label="${label}"></button>`;
}

function columnsHtml() {
  const handles = `${resizeHandleHtml('index', '调整目录与正文宽度')}${resizeHandleHtml('rail', '调整正文与侧栏宽度')}`;
  if (bilingualOn()) return `${handles}${compareColumnsHtml()}`;
  return `
        ${handles}
        <section class="studio-doc">${editorHtml()}</section>
        <section class="studio-rail">${state.child ? childRailHtml() : metaHtml()}</section>`;
}

function metaHtml() {
  if (!state.doc || state.sourceMode) {
    return `<p class="text-sm text-ink-500">${state.doc ? '源码模式在中间改 frontmatter。' : '打开一篇文档后，标题、摘要、日期、标签在这里改。'}</p>`;
  }
  const data = fm();
  const isEn = state.lang === 'en';
  const src = previewSrc();
  return `
    <div class="flex min-h-0 flex-col gap-4 overflow-y-auto">
      <p class="ui-meta">${isEn ? 'English metadata' : '页面信息'}</p>
      <label><span class="ui-meta">${isEn ? 'Title' : '标题'}</span><input class="comment-field" data-testid="studio-title" data-fm="${isEn ? 'titleEn' : 'title'}" value="${attr(isEn ? data.titleEn : data.title)}" /></label>
      <label><span class="ui-meta">${isEn ? 'Description' : '摘要'}</span><input class="comment-field" data-fm="${isEn ? 'descriptionEn' : 'description'}" value="${attr(isEn ? data.descriptionEn : data.description)}" /></label>
      ${state.doc.collection !== 'pages' && data.slot !== 'project' ? `
        <label><span class="ui-meta">日期</span><input class="comment-field" type="date" data-fm="date" value="${attr(String(data.date ?? '').slice(0, 10))}" /></label>
      ` : ''}
      ${state.doc.collection !== 'pages' ? tagsPickerHtml() : ''}
      ${state.doc.collection !== 'pages' && data.slot === 'project' ? `
        <label><span class="ui-meta">状态</span>
          <select class="comment-field" data-fm="status">
            ${['wip', 'active', 'shipped', 'archived'].map((item) => `<option value="${item}" ${String(data.status ?? 'wip') === item ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
        </label>
        <label><span class="ui-meta">仓库 URL</span><input class="comment-field" data-fm="repo" value="${attr(data.repo)}" /></label>
      ` : ''}
      ${state.doc.collection !== 'pages' ? `
        <label class="inline-flex items-center gap-2 text-sm text-ink-400"><input type="checkbox" data-fm="draft" ${data.draft ? 'checked' : ''}/> 草稿</label>
        <div class="flex flex-wrap gap-4 text-sm" role="radiogroup" aria-label="收录到">
          ${['article', 'project', 'library'].map((kind) => {
            const current = collectionKind();
            const klass = current === kind
              ? 'text-ink-100 underline decoration-ink-500 underline-offset-4'
              : 'text-ink-400 hover:text-ink-100';
            return `<button type="button" class="${klass}" data-testid="studio-kind-${kind}" data-action="collection-kind" data-kind="${kind}">${kind}</button>`;
          }).join('')}
        </div>
      ` : ''}
      ${state.doc.imports ? `<label><span class="ui-meta">imports</span><textarea class="comment-field comment-field--body min-h-16 font-mono" spellcheck="false" data-body="imports">${esc(state.doc.imports)}</textarea></label>` : ''}
      <a class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" href="${attr(src)}" target="_blank" rel="noreferrer">${isEn ? 'preview in the new tab' : '打开新标签进行预览'}</a>
    </div>`;
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function tagsCopy() {
  const en = state.lang === 'en';
  return {
    button: en ? 'Tags' : '标签',
    title: en ? 'Tags' : '标签',
    hint: en
      ? 'Edit the /tags groups. Ungrouped tags go under Other. Save writes src/data/tag-groups.ts; article frontmatter is unchanged.'
      : '这里改 /tags 的分组目录。未分组会进「其他」。保存写入 tag-groups.ts，不改文章标签。',
    ungrouped: en ? 'Ungrouped' : '未分组',
    addTag: en ? 'Add tag' : '添加标签',
    addGroup: en ? 'Add group' : '添加分组',
    remove: en ? 'Remove' : '移除',
    deleteGroup: en ? 'Delete group' : '删除分组',
    save: en ? 'Save' : '保存',
    cancel: en ? 'Cancel' : '取消',
    saving: en ? 'Saving…' : '保存中',
    titleZh: en ? 'Title (zh)' : '中文名',
    titleEn: en ? 'Title (en)' : '英文名',
    slug: 'slug',
    confirmClose: en ? 'Discard unsaved tag catalog changes?' : '放弃未保存的标签目录改动？',
    confirmDelete: en ? 'Delete this group? Its tags become ungrouped; articles stay the same.' : '删除这个分组？里面的标签会变成未分组，文章不会改。',
    saved: en ? 'Tags saved' : '标签已保存',
  };
}

function catalogUngrouped() {
  const assigned = new Set();
  for (const group of state.tagCatalog) {
    for (const tag of group.tags) {
      const value = String(tag ?? '').trim();
      if (value) assigned.add(value);
    }
  }
  const used = new Set(Object.keys(state.tagUsed));
  for (const item of [...(state.docs.articles ?? []), ...(state.docs.projects ?? [])]) {
    if (!Array.isArray(item.tags)) continue;
    for (const tag of item.tags) {
      const value = String(tag ?? '').trim();
      if (value) used.add(value);
    }
  }
  return [...used].filter((tag) => !assigned.has(tag)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
}

function catalogDirty() {
  return JSON.stringify(state.tagCatalog) !== state.tagCatalogSaved;
}

async function openTags() {
  state.error = '';
  state.tagError = '';
  try {
    const data = await api('/tag-groups');
    state.tagCatalog = cloneJson(data.groups ?? []);
    state.tagUsed = data.used ?? {};
    state.tagAdd = state.tagCatalog.map(() => '');
    state.tagNewGroup = { slug: '', title: '', titleEn: '' };
    state.tagCatalogSaved = JSON.stringify(state.tagCatalog);
    state.tagsOpen = true;
    state.createOpen = false;
    state.linkOpen = false;
    state.tagsFocus = { kind: 'first' };
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

function closeTags() {
  if (state.tagSaving) return;
  if (catalogDirty() && !window.confirm(tagsCopy().confirmClose)) return;
  state.tagsOpen = false;
  state.tagError = '';
  render();
}

async function saveTags() {
  const copy = tagsCopy();
  state.tagError = '';
  state.tagSaving = true;
  render();
  try {
    const data = await api('/tag-groups', {
      method: 'PUT',
      body: JSON.stringify({ groups: state.tagCatalog }),
    });
    state.tagCatalog = cloneJson(data.groups ?? []);
    state.tagUsed = data.used ?? {};
    state.tagAdd = state.tagCatalog.map(() => '');
    state.tagCatalogSaved = JSON.stringify(state.tagCatalog);
    state.tagSaving = false;
    state.tagsOpen = false;
    state.status = copy.saved;
    render();
  } catch (err) {
    state.tagSaving = false;
    state.tagError = err instanceof Error ? err.message : String(err);
    render();
  }
}

function addCatalogTag(index) {
  const group = state.tagCatalog[index];
  if (!group) return;
  const value = String(state.tagAdd[index] ?? '').trim();
  if (!value) return;
  for (const other of state.tagCatalog) {
    other.tags = other.tags.filter((tag) => String(tag).trim() !== value);
  }
  group.tags.push(value);
  state.tagAdd[index] = '';
  state.tagError = '';
  state.tagsFocus = { kind: 'add', index };
  render();
}

function removeCatalogTag(groupIndex, tagIndex) {
  const group = state.tagCatalog[groupIndex];
  if (!group) return;
  group.tags.splice(tagIndex, 1);
  render();
}

function removeCatalogGroup(index) {
  if (!state.tagCatalog[index]) return;
  if (!window.confirm(tagsCopy().confirmDelete)) return;
  state.tagCatalog.splice(index, 1);
  state.tagAdd.splice(index, 1);
  render();
}

function addCatalogGroup() {
  const copy = tagsCopy();
  const slug = state.tagNewGroup.slug.trim();
  const title = state.tagNewGroup.title.trim();
  const titleEn = state.tagNewGroup.titleEn.trim();
  if (!slug || !title || !titleEn) {
    state.tagError = state.lang === 'en' ? 'Fill slug, Chinese title, and English title.' : '请填写 slug、中文名和英文名';
    render();
    return;
  }
  if (state.tagCatalog.some((group) => group.slug === slug)) {
    state.tagError = state.lang === 'en' ? 'That slug is already used.' : '这个 slug 已经存在';
    render();
    return;
  }
  state.tagCatalog.push({ slug, title, titleEn, tags: [] });
  state.tagAdd.push('');
  state.tagNewGroup = { slug: '', title: '', titleEn: '' };
  state.tagError = '';
  state.tagsFocus = { kind: 'add', index: state.tagCatalog.length - 1 };
  render();
}

function restoreTagsFocus() {
  const focus = state.tagsFocus;
  if (!focus || !state.tagsOpen) return;
  state.tagsFocus = null;
  const dialog = root.querySelector('[data-testid="studio-tags-dialog"]');
  if (!(dialog instanceof HTMLElement)) return;
  let input = null;
  if (focus.kind === 'add') {
    input = dialog.querySelector(`[data-catalog-add][data-group-index="${focus.index}"]`);
  } else {
    input = dialog.querySelector('input');
  }
  if (input instanceof HTMLInputElement) input.focus();
}

function tagsDialogHtml() {
  if (!state.tagsOpen) return '';
  const copy = tagsCopy();
  const ungrouped = catalogUngrouped();
  const groups = state.tagCatalog.map((group, gi) => `
    <section class="${gi ? 'mt-8' : ''}">
      <div class="flex flex-wrap items-baseline justify-between gap-4">
        <p class="ui-meta">${esc(group.slug || copy.slug)}</p>
        <button type="button" class="text-sm text-ink-500 hover:text-ink-200" data-action="catalog-remove-group" data-group-index="${gi}">${esc(copy.deleteGroup)}</button>
      </div>
      <label class="mt-3 block"><span class="ui-meta">${esc(copy.titleZh)}</span><input class="comment-field" data-catalog-field="title" data-group-index="${gi}" value="${attr(group.title)}" /></label>
      <label class="mt-3 block"><span class="ui-meta">${esc(copy.titleEn)}</span><input class="comment-field" data-catalog-field="titleEn" data-group-index="${gi}" value="${attr(group.titleEn)}" /></label>
      <label class="mt-3 block"><span class="ui-meta">${esc(copy.slug)}</span><input class="comment-field" data-catalog-field="slug" data-group-index="${gi}" value="${attr(group.slug)}" /></label>
      <ul class="mt-4">
        ${group.tags.map((tag, ti) => `
          <li class="flex items-baseline gap-4 py-2">
            <input class="comment-field min-w-0 flex-1" data-catalog-tag data-group-index="${gi}" data-tag-index="${ti}" value="${attr(tag)}" aria-label="${attr(tag)}" />
            <span class="ui-meta tabular-nums">${esc(String(state.tagUsed[tag] ?? 0))}</span>
            <button type="button" class="shrink-0 text-sm text-ink-500 hover:text-ink-200" data-action="catalog-remove-tag" data-group-index="${gi}" data-tag-index="${ti}" aria-label="${attr(`${copy.remove} ${tag}`)}">${esc(copy.remove)}</button>
          </li>`).join('')}
      </ul>
      <div class="mt-3 flex items-end gap-4">
        <label class="min-w-0 flex-1"><span class="sr-only">${esc(copy.addTag)}</span><input class="comment-field" data-catalog-add data-group-index="${gi}" placeholder="${attr(copy.addTag)}" value="${attr(state.tagAdd[gi] ?? '')}" /></label>
        <button type="button" class="shrink-0 text-sm text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" data-action="catalog-add-tag" data-group-index="${gi}">${esc(copy.addTag)}</button>
      </div>
    </section>`).join('');
  return `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true" aria-labelledby="studio-tags-title">
      <div class="flex max-h-[min(90dvh,40rem)] w-full max-w-lg flex-col bg-surface-950" data-testid="studio-tags-dialog">
        <h2 id="studio-tags-title" class="text-xl font-semibold text-ink-100">${esc(copy.title)}</h2>
        <p class="mt-2 text-sm text-ink-400">${esc(copy.hint)}</p>
        ${state.tagError ? `<p class="mt-4 text-sm text-ink-200" role="alert">${esc(state.tagError)}</p>` : ''}
        <div class="mt-6 min-h-0 flex-1 overflow-y-auto">
          ${groups || `<p class="ui-meta">${esc(copy.addGroup)}</p>`}
          ${ungrouped.length ? `
            <section class="mt-8">
              <p class="ui-meta">${esc(copy.ungrouped)}</p>
              <ul class="mt-3">
                ${ungrouped.map((tag) => `<li class="py-1 text-sm text-ink-200">${esc(tag)}${state.tagUsed[tag] ? ` <span class="ui-meta">${esc(String(state.tagUsed[tag]))}</span>` : ''}</li>`).join('')}
              </ul>
            </section>` : ''}
          <section class="mt-8">
            <p class="ui-meta">${esc(copy.addGroup)}</p>
            <label class="mt-3 block"><span class="ui-meta">${esc(copy.slug)}</span><input class="comment-field" data-catalog-new="slug" data-testid="studio-tag-group-slug" value="${attr(state.tagNewGroup.slug)}" /></label>
            <label class="mt-3 block"><span class="ui-meta">${esc(copy.titleZh)}</span><input class="comment-field" data-catalog-new="title" value="${attr(state.tagNewGroup.title)}" /></label>
            <label class="mt-3 block"><span class="ui-meta">${esc(copy.titleEn)}</span><input class="comment-field" data-catalog-new="titleEn" value="${attr(state.tagNewGroup.titleEn)}" /></label>
            <div class="mt-4">
              <button type="button" class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" data-action="catalog-add-group" data-testid="studio-tag-group-add">${esc(copy.addGroup)}</button>
            </div>
          </section>
        </div>
        <div class="mt-8 flex gap-6 text-sm">
          <button type="button" class="text-ink-100 underline decoration-ink-500 underline-offset-4" data-action="save-tags" data-testid="studio-tags-save" ${state.tagSaving ? 'disabled' : ''}>${esc(state.tagSaving ? copy.saving : copy.save)}</button>
          <button type="button" class="text-ink-500 hover:text-ink-200" data-action="close-tags">${esc(copy.cancel)}</button>
        </div>
      </div>
    </div>`;
}

function dialogHtml() {
  const kindLabel = { article: '新建文章', project: '新建项目', child: '新建子页面' }[state.createKind];
  const create = state.createOpen ? `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true">
      <form class="w-full max-w-md bg-surface-950" data-create-form>
        <h2 class="text-xl font-semibold text-ink-100">${kindLabel}</h2>
        <p class="mt-2 text-sm text-ink-400">${state.createKind === 'child' ? '会生成当前页的子 MDX。合集就是有子页面的普通文章。' : '会生成带 frontmatter 的 MDX，默认草稿。'}</p>
        <label class="mt-6 block"><span class="ui-meta">标题</span><input class="comment-field" required data-testid="studio-create-title" data-create="title" value="${attr(state.createTitle)}" /></label>
        ${state.createKind !== 'child' ? `<label class="mt-4 block"><span class="ui-meta">slug</span><input class="comment-field" placeholder="留空则从标题生成" data-testid="studio-create-slug" data-create="slug" value="${attr(state.createSlug)}" /></label>` : ''}
        <div class="mt-8 flex gap-6 text-sm">
          <button type="submit" class="text-ink-100 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-submit">创建</button>
          <button type="button" class="text-ink-500 hover:text-ink-200" data-action="close-create">取消</button>
        </div>
      </form>
    </div>` : '';
  const existing = [...state.docs.articles, ...state.docs.projects].filter((item) => (
    item.collection !== state.current?.collection || item.id !== state.current?.id
  ));
  const linkQuery = state.linkFilter.trim().toLowerCase();
  const filtered = existing.filter((item) => {
    if (!linkQuery) return true;
    const path = `${item.collection}/${item.id}`;
    return item.title.toLowerCase().includes(linkQuery)
      || String(item.titleEn ?? '').toLowerCase().includes(linkQuery)
      || path.toLowerCase().includes(linkQuery);
  });
  const tabClass = (active) => active
    ? 'text-ink-100 underline decoration-ink-500 underline-offset-4'
    : 'text-ink-500 hover:text-ink-200';
  const link = state.linkOpen && state.doc ? `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true" aria-labelledby="studio-link-title">
      <div class="w-full max-w-md bg-surface-950">
        <h2 id="studio-link-title" class="text-xl font-semibold text-ink-100">插入页面</h2>
        <div class="mt-6 flex gap-6 text-sm">
          <button type="button" class="${tabClass(state.linkMode === 'existing')}" data-testid="studio-link-existing" data-action="link-existing">已有页面</button>
          ${canHaveChildren() ? `<button type="button" class="${tabClass(state.linkMode === 'child')}" data-testid="studio-link-child" data-action="link-child">新建子页面</button>` : ''}
        </div>
        ${state.linkMode === 'child' && canHaveChildren() ? `
          <form class="mt-8" data-create-form>
            <p class="ui-meta">子页面写在 \`${esc(state.doc.id)}/&lt;n&gt;.mdx\`。创建后复制 DocList 标记，再贴到正文。</p>
            <label class="mt-6 block"><span class="ui-meta">标题</span><input class="comment-field" required data-testid="studio-child-title" data-create="title" value="${attr(state.createTitle)}" /></label>
            <div class="mt-10 flex items-baseline justify-between gap-6 text-sm">
              <button type="submit" class="text-ink-100 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-child">创建</button>
              <button type="button" class="text-ink-500 underline decoration-transparent underline-offset-4 hover:text-ink-200 hover:decoration-ink-500" data-action="close-link">取消</button>
            </div>
          </form>
        ` : `
          <p class="mt-3 ui-meta">找到页面后点选，复制 DocList 标记，再贴到正文。</p>
          <label class="mt-6 block">
            <span class="sr-only">筛选页面</span>
            <input class="comment-field" type="search" placeholder="筛选标题或路径" data-testid="studio-link-filter" data-link-filter value="${attr(state.linkFilter)}" />
          </label>
          <ul class="mt-2 max-h-80 overflow-y-auto">
            ${filtered.length ? filtered.map((item) => `
              <li>
                <button type="button" class="group block w-full py-3 text-left" data-link="${esc(item.collection)}/${esc(item.id)}">
                  <span class="block text-sm text-ink-200 underline decoration-transparent underline-offset-4 group-hover:text-ink-100 group-hover:decoration-ink-500 group-focus-visible:text-ink-100 group-focus-visible:decoration-ink-500">${esc(item.title)}</span>
                  <span class="mt-1 block font-mono text-xs text-ink-500">${esc(item.collection)}/${esc(item.id)}</span>
                </button>
              </li>`).join('') : `<li class="py-3 ui-meta">没有匹配的页面</li>`}
          </ul>
          <div class="mt-8">
            <button type="button" class="text-sm text-ink-500 underline decoration-transparent underline-offset-4 hover:text-ink-200 hover:decoration-ink-500" data-action="close-link">取消</button>
          </div>
        `}
      </div>
    </div>` : '';
  return create + link + tagsDialogHtml();
}

function render() {
  tagPickerOpen = false;
  root.innerHTML = `
    <div class="studio-shell" data-testid="studio-app">
      <header class="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div class="min-w-0">
          <p class="ui-meta">${ONLINE ? '在线博客管理后台' : '本地编辑器'}</p>
          <h1 class="truncate text-lg font-semibold text-ink-100">${ONLINE ? 'Ethan Blog Studio' : 'Studio'}</h1>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-4 text-sm">
          <span class="text-ink-400" data-studio-dirty ${isDirty() ? '' : 'hidden'}>未保存</span>
          <span class="text-ink-400" data-studio-status ${state.status ? '' : 'hidden'}>${esc(state.status)}</span>
          <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" data-action="save" ${!state.doc || state.saving ? 'disabled' : ''}>${state.saving ? '保存中' : '保存'}</button>
          <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" data-action="open-tags" data-testid="studio-manage-tags">${esc(tagsCopy().button)}</button>
          <a class="text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" href="/">站点</a>
          <button type="button" class="text-ink-400 hover:text-ink-100" data-action="theme">主题</button>
        </div>
      </header>
      ${state.error ? `<p class="shrink-0 px-4 text-sm text-ink-200 sm:px-6" role="alert">${esc(state.error)}</p>` : ''}
      <div class="studio-columns${bilingualOn() ? ' studio-columns--compare' : ''}">
        ${indexAsideHtml()}
        ${columnsHtml()}
      </div>
    </div>
    ${dialogHtml()}`;
  bindBodyEditor();
  bindChildEditor();
  applyColumnLayout();
  restoreTagsFocus();
}

root.addEventListener('click', (event) => {
  const target = event.target instanceof Element ? event.target.closest('button, a') : null;
  if (!(target instanceof HTMLElement)) return;
  const action = target.dataset.action;
  const open = target.dataset.open;
  const createKind = target.dataset.createKind;
  const link = target.dataset.link;
  const lang = target.dataset.lang;
  if (open) {
    const [collection, ...rest] = open.split(':');
    void openDoc(collection, rest.join(':'));
  } else if (createKind) {
    openCreate(createKind);
  } else if (link) {
    void copyLinkMarkup(link);
  } else if (action === 'add-tag' && target.dataset.tag) {
    addTag(target.dataset.tag);
  } else if (action === 'remove-tag' && target.dataset.tag) {
    removeTag(target.dataset.tag);
  } else if (target.dataset.indexList) {
    state.indexList = target.dataset.indexList === 'projects' ? 'projects' : 'articles';
    persist();
    render();
  } else if (action === 'collection-kind' && target.dataset.kind) {
    setCollectionKind(target.dataset.kind);
  } else if (lang) {
    state.lang = lang === 'en' ? 'en' : 'zh';
    persist();
    render();
  } else if (action === 'save') void save();
  else if (action === 'open-tags') void openTags();
  else if (action === 'close-tags') closeTags();
  else if (action === 'close-child') closeChildEditor();
  else if (action === 'save-tags') void saveTags();
  else if (action === 'catalog-add-tag') addCatalogTag(Number(target.dataset.groupIndex));
  else if (action === 'catalog-remove-tag') removeCatalogTag(Number(target.dataset.groupIndex), Number(target.dataset.tagIndex));
  else if (action === 'catalog-remove-group') removeCatalogGroup(Number(target.dataset.groupIndex));
  else if (action === 'catalog-add-group') addCatalogGroup();
  else if (action === 'theme') toggleTheme();
  else if (action === 'toggle-source') {
    state.sourceMode = !state.sourceMode;
    if (state.sourceMode) state.bilingual = false;
    persist();
    render();
  } else if (action === 'toggle-bilingual') {
    if (!canBilingual()) return;
    state.bilingual = !state.bilingual;
    persist();
    render();
  } else if (action === 'open-link') {
    state.linkOpen = true;
    state.linkMode = 'existing';
    state.linkFilter = '';
    state.createKind = 'child';
    state.createTitle = '';
    render();
  } else if (action === 'link-existing') {
    state.linkMode = 'existing';
    render();
  } else if (action === 'link-child') {
    state.linkMode = 'child';
    state.createKind = 'child';
    render();
  } else if (action === 'close-create') {
    state.createOpen = false;
    render();
  } else if (action === 'close-link') {
    state.linkOpen = false;
    state.linkFilter = '';
    render();
  }   else if (action === 'commit') void commit();
  else if (action === 'publish') void publishRemote();
  else if (action === 'push') void pushRemote();
});

root.addEventListener('input', (event) => {
  const target = event.target;
  if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement)) return;
  if (target.dataset.filter !== undefined) {
    state.filter = target.value;
    render();
    root.querySelector('[data-filter]')?.focus();
    return;
  }
  if (target.dataset.linkFilter !== undefined) {
    state.linkFilter = target.value;
    const pos = target.selectionStart;
    render();
    const input = root.querySelector('[data-link-filter]');
    if (input instanceof HTMLInputElement) {
      input.focus();
      const caret = typeof pos === 'number' ? pos : input.value.length;
      input.setSelectionRange(caret, caret);
    }
    return;
  }
  if (target.dataset.commit !== undefined) state.commitMessage = target.value;
  if (target.dataset.create === 'title') state.createTitle = target.value;
  if (target.dataset.create === 'slug') state.createSlug = target.value;
  if (target.dataset.catalogField) {
    const group = state.tagCatalog[Number(target.dataset.groupIndex)];
    const field = target.dataset.catalogField;
    if (group && (field === 'slug' || field === 'title' || field === 'titleEn')) {
      group[field] = target.value;
    }
    return;
  }
  if (target.dataset.catalogTag !== undefined) {
    const group = state.tagCatalog[Number(target.dataset.groupIndex)];
    const index = Number(target.dataset.tagIndex);
    if (group && Number.isInteger(index) && index >= 0) group.tags[index] = target.value;
    return;
  }
  if (target.dataset.catalogAdd !== undefined) {
    state.tagAdd[Number(target.dataset.groupIndex)] = target.value;
    return;
  }
  if (target.dataset.catalogNew) {
    const field = target.dataset.catalogNew;
    if (field === 'slug' || field === 'title' || field === 'titleEn') {
      state.tagNewGroup[field] = target.value;
    }
    return;
  }
  if (target.dataset.childFm) {
    setChildFm(target.dataset.childFm, target.value);
    return;
  }
  if (target.dataset.fm) {
    if (target.dataset.fm === 'draft') setFm('draft', target instanceof HTMLInputElement && target.checked);
    else setFm(target.dataset.fm, target.value);
  }
  if (target.dataset.tags !== undefined) {
    tagQuery = target.value;
    tagHighlight = 0;
    tagPickerOpen = true;
    paintTagsPicker();
    return;
  }
  if (target.dataset.body) setBody(target.dataset.body, target.value);
});

root.addEventListener('submit', (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute('data-create-form')) return;
  event.preventDefault();
  if (state.linkOpen && state.linkMode === 'child') state.createKind = 'child';
  void createDocFromForm();
});

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && state.tagsOpen) {
    event.preventDefault();
    closeTags();
    return;
  }
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault();
    if (state.tagsOpen) void saveTags();
    else void save();
  }
});

root.addEventListener('pointerdown', (event) => {
  const option = event.target instanceof Element
    ? event.target.closest('[data-action="add-tag"]')
    : null;
  if (option) event.preventDefault();
});
root.addEventListener('pointerdown', onColResizePointerDown);

root.addEventListener('focusin', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.tags !== undefined) {
    tagPickerOpen = true;
    paintTagsPicker();
  }
});

root.addEventListener('focusout', (event) => {
  const picker = root.querySelector('[data-tag-picker]');
  if (!(picker instanceof HTMLElement)) return;
  const next = event.relatedTarget;
  if (next instanceof Node && picker.contains(next)) return;
  const target = event.target;
  if (!(target instanceof HTMLInputElement) || target.dataset.tags === undefined) return;
  tagPickerOpen = false;
  paintTagsPicker();
});

root.addEventListener('keydown', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.catalogAdd !== undefined && event.key === 'Enter') {
    event.preventDefault();
    addCatalogTag(Number(target.dataset.groupIndex));
    return;
  }
  if (!(target instanceof HTMLInputElement) || target.dataset.tags === undefined) return;
  const selected = selectedTags();
  const items = tagMatchItems(tagQuery, selected);
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    tagPickerOpen = true;
    if (items.length) tagHighlight = (tagHighlight + 1) % items.length;
    paintTagsPicker();
  } else if (event.key === 'ArrowUp') {
    event.preventDefault();
    tagPickerOpen = true;
    if (items.length) tagHighlight = (tagHighlight - 1 + items.length) % items.length;
    paintTagsPicker();
  } else if (event.key === 'Enter') {
    event.preventDefault();
    if (items[tagHighlight]) addTag(items[tagHighlight].tag);
    else if (tagQuery.trim()) addTag(tagQuery.trim());
  } else if (event.key === 'Escape') {
    event.preventDefault();
    tagQuery = '';
    tagHighlight = 0;
    tagPickerOpen = false;
    paintTagsPicker();
  } else if (event.key === 'Backspace' && !target.value && selected.length) {
    event.preventDefault();
    removeTag(selected[selected.length - 1]);
  }
});

window.addEventListener('resize', applyColumnLayout);

initTheme();
restoreSession();
refreshLists()
  .then(() => render())
  .catch((err) => {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  });
