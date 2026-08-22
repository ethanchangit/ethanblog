import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@/styles/global.css';
import { initTheme, toggleTheme } from '@/lib/theme';
import { ensureMediaImport } from '../blocks.mjs';
import { mountBlockEditor } from './block-editor.js';
import './editor.css';

const root = document.getElementById('studio');

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
  previewKey: 0,
  filter: '',
  linkFilter: '',
};

let bodyEditor = null;

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

function inBlogs() {
  if (!state.doc) return false;
  return state.docs.blogsRefs.includes(`${state.doc.collection}/${state.doc.id}`);
}

function canHaveChildren() {
  return Boolean(state.doc && state.doc.collection === 'articles');
}

function mentionPages() {
  return [...state.docs.articles, ...state.docs.projects];
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
    if (state.dirty) await save({ reload: false });
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
    if (kind === 'child') {
      const next = await api(
        `/doc?collection=${encodeURIComponent(state.current.collection)}&id=${encodeURIComponent(state.current.id)}`,
      );
      state.doc = next;
      state.dirty = false;
      persist();
      state.status = '已创建子页面';
      render();
      return { of, reloaded: true };
    }
    state.status = '已创建';
    paintChrome();
    return { of, reloaded: false };
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
    return null;
  }
}

function bindBodyEditor() {
  bodyEditor?.destroy();
  bodyEditor = null;
  const host = root.querySelector('[data-body-editor]');
  if (!(host instanceof HTMLElement) || !state.doc) return;
  const bodyKey = host.dataset.bodyEditor;
  bodyEditor = mountBlockEditor(host, {
    value: state.doc[bodyKey] ?? '',
    pages: mentionPages(),
    currentOf: `${state.doc.collection}/${state.doc.id}`,
    canCreateChild: canHaveChildren(),
    pane: mentionPane(),
    onChange: (value) => setBody(bodyKey, value),
    onEnsureImport: ensureStudioMediaImport,
    onCreate: (input) => createFromMention(input),
  });
}

function previewSrc() {
  if (!state.doc) return '';
  const href = state.doc.href;
  const path = state.lang === 'zh' && href !== '/' ? `/zh${href}` : href;
  return `${path}?studio=${state.previewKey}`;
}

function matchesFilter(item) {
  const q = state.filter.trim().toLowerCase();
  if (!q) return true;
  return item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q);
}

function tagsText(value) {
  return Array.isArray(value) ? value.join(', ') : '';
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
        commitMessage: state.commitMessage,
      }),
    );
  } catch {
    // ignore quota
  }
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
      state.commitMessage = saved.commitMessage ?? '';
    }
  } catch {
    sessionStorage.removeItem('studio-state');
  }
}

function paintChrome() {
  const dirty = root.querySelector('[data-studio-dirty]');
  if (dirty) dirty.hidden = !state.dirty;
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
  const iframe = root.querySelector('[data-testid="studio-preview"]');
  if (iframe instanceof HTMLIFrameElement) {
    const src = previewSrc();
    if (src && iframe.getAttribute('src') !== src) iframe.src = src;
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
}

async function waitForPreview(href) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      const res = await fetch(href, { method: 'GET' });
      if (res.ok) break;
    } catch {
      // content layer may still be reloading
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  state.previewKey += 1;
}

async function openDoc(collection, id) {
  if (state.dirty && !window.confirm('有未保存的改动，确定离开？')) return;
  const next = await api(`/doc?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`);
  state.current = { collection, id };
  state.doc = next;
  state.sourceMode = false;
  state.dirty = false;
  state.error = '';
  state.status = '';
  state.previewKey += 1;
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
      }),
    });
    state.doc = saved;
    state.dirty = false;
    persist();
    await refreshLists();
    if (opts.reload !== false) {
      await waitForPreview(saved.href);
      state.status = '已保存';
    } else {
      state.status = '已保存';
    }
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
  try {
    const payload = {
      kind: state.createKind,
      title: state.createTitle,
      slug: state.createSlug,
    };
    if (state.createKind === 'child') {
      if (!state.current || !canHaveChildren()) throw new Error('请先打开一篇文章再加子页面');
      if (state.dirty) await save({ reload: false });
      payload.parentCollection = state.current.collection;
      payload.parentId = state.current.id;
    }
    const created = await api('/create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    state.createOpen = false;
    state.linkOpen = false;
    state.createTitle = '';
    state.createSlug = '';
    await refreshLists();
    const next = await api(
      `/doc?collection=${encodeURIComponent(created.collection)}&id=${encodeURIComponent(created.id)}`,
    );
    state.current = { collection: created.collection, id: created.id };
    state.doc = next;
    state.sourceMode = false;
    state.dirty = false;
    state.error = '';
    await waitForPreview(created.href);
    state.status = state.createKind === 'child' ? '已创建子页面' : '已创建';
    persist();
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

async function toggleBlogs() {
  if (!state.doc || state.doc.collection === 'pages') return;
  const of = `${state.doc.collection}/${state.doc.id}`;
  const present = !inBlogs();
  const result = await api('/blogs', {
    method: 'POST',
    body: JSON.stringify({ of, present }),
  });
  state.docs = { ...state.docs, blogsRefs: result.refs };
  state.status = present ? '已加入 /blogs' : '已移出 /blogs';
  state.previewKey += 1;
  render();
}

async function insertLink(of) {
  if (!state.current) return;
  state.error = '';
  try {
    if (state.dirty) await save({ reload: false });
    const pane = state.doc?.collection === 'pages' ? undefined : 'series';
    const next = await api('/link', {
      method: 'POST',
      body: JSON.stringify({
        collection: state.current.collection,
        id: state.current.id,
        of,
        pane,
      }),
    });
    state.doc = next;
    state.dirty = false;
    state.linkOpen = false;
    state.status = `已插入 ${of}`;
    state.previewKey += 1;
    await refreshLists();
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

async function commit() {
  state.error = '';
  try {
    if (state.dirty) await save();
    state.git = await api('/git/commit', {
      method: 'POST',
      body: JSON.stringify({ message: state.commitMessage }),
    });
    state.commitMessage = '';
    state.status = '已提交到仓库';
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
    state.status = '已推送到远程（生产仍需手动 Deploy workflow）';
    render();
  } catch (err) {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  }
}

function itemButton(item, collection) {
  const active = state.current?.id === item.id && state.current?.collection === collection;
  const klass = active ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100';
  const indents = ['', 'pl-3', 'pl-6', 'pl-9'];
  const indentClass = indents[Math.min(depthOf(item.id), 3)];
  return `<li><button type="button" class="block w-full py-1.5 text-left text-sm ${klass} ${indentClass}" data-open="${collection}:${esc(item.id)}">${esc(item.title)}${item.draft ? '<span class="ml-2 text-xs text-ink-500">草稿</span>' : ''}</button></li>`;
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

function editorHtml() {
  if (!state.doc) {
    return `<p class="max-w-md text-ink-400">选一篇已有文章，或按「新建」。顶部两个标题切换中文 / 英文，一次只写一页。</p>`;
  }
  const data = fm();
  const zhTitle = data.title || '中文';
  const enTitle = data.titleEn || 'English';
  const toolbar = `
    <div class="mb-4 flex flex-wrap items-center gap-4 text-sm">
      <span class="font-mono text-xs text-ink-500">${esc(state.doc.collection)}/${esc(state.doc.id)}</span>
      <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-action="toggle-source">${state.sourceMode ? '页面' : '源码'}</button>
      ${state.doc.collection !== 'pages' || state.doc.id === 'blogs' ? `
        <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-link" data-action="open-link">插入页面</button>
      ` : ''}
    </div>`;
  if (state.sourceMode) {
    return `<div class="studio-measure">${toolbar}<textarea class="min-h-0 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none" spellcheck="false" data-testid="studio-source" data-body="raw">${esc(state.doc.raw)}</textarea></div>`;
  }
  const bodyKey = state.lang === 'en' ? 'bodyEn' : 'bodyZh';
  const testId = state.lang === 'en' ? 'studio-body-en' : 'studio-body-zh';
  return `
    <div class="studio-measure">
    <div class="mb-6 flex min-w-0 gap-8">
      <button type="button" class="truncate text-xl font-semibold ${state.lang === 'zh' ? 'text-ink-100 underline decoration-ink-500 underline-offset-8' : 'text-ink-400 hover:text-ink-100'}" data-testid="studio-lang-zh" data-lang="zh">${esc(zhTitle)}</button>
      <button type="button" class="truncate text-xl font-semibold ${state.lang === 'en' ? 'text-ink-100 underline decoration-ink-500 underline-offset-8' : 'text-ink-400 hover:text-ink-100'}" data-testid="studio-lang-en" data-lang="en">${esc(enTitle)}</button>
    </div>
    ${toolbar}
    <div class="studio-editor min-h-0 flex-1 overflow-y-auto" data-testid="${testId}" data-body-editor="${bodyKey}"></div>
    </div>`;
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
      ${state.doc.collection === 'articles' ? `
        <label><span class="ui-meta">日期</span><input class="comment-field" type="date" data-fm="date" value="${attr(String(data.date ?? '').slice(0, 10))}" /></label>
        <label><span class="ui-meta">标签（逗号分隔）</span><input class="comment-field" data-tags value="${attr(tagsText(data.tags))}" /></label>
      ` : ''}
      ${state.doc.collection === 'projects' ? `
        <label><span class="ui-meta">状态</span>
          <select class="comment-field" data-fm="status">
            ${['wip', 'active', 'shipped', 'archived'].map((item) => `<option value="${item}" ${String(data.status ?? 'wip') === item ? 'selected' : ''}>${item}</option>`).join('')}
          </select>
        </label>
        <label><span class="ui-meta">仓库 URL</span><input class="comment-field" data-fm="repo" value="${attr(data.repo)}" /></label>
      ` : ''}
      ${state.doc.collection !== 'pages' ? `
        <label class="inline-flex items-center gap-2 text-sm text-ink-400"><input type="checkbox" data-fm="draft" ${data.draft ? 'checked' : ''}/> 草稿</label>
        <label class="inline-flex items-center gap-2 text-sm text-ink-400"><input type="checkbox" data-testid="studio-blogs-toggle" data-action="toggle-blogs" ${inBlogs() ? 'checked' : ''}/> 收入 /blogs</label>
      ` : ''}
      ${state.doc.imports ? `<label><span class="ui-meta">imports</span><textarea class="comment-field comment-field--body min-h-16 font-mono" spellcheck="false" data-body="imports">${esc(state.doc.imports)}</textarea></label>` : ''}
      <a class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" href="${attr(src)}" target="_blank" rel="noreferrer">新标签打开预览</a>
    </div>`;
}

function dialogHtml() {
  const kindLabel = { article: '新建文章', project: '新建项目', child: '新建子页面' }[state.createKind];
  const create = state.createOpen ? `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true">
      <form class="w-full max-w-md bg-surface-950" data-create-form>
        <h2 class="text-xl font-semibold text-ink-100">${kindLabel}</h2>
        <p class="mt-2 text-sm text-ink-400">${state.createKind === 'child' ? '会生成当前页的子 MDX，并写进这篇的 DocList。合集就是有子页面的普通文章。' : '会生成带 frontmatter 的 MDX，默认草稿。'}</p>
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
            <p class="ui-meta">子页面是普通文章，写在 \`${esc(state.doc.id)}/&lt;n&gt;.mdx\`，默认不进 /articles。</p>
            <label class="mt-6 block"><span class="ui-meta">标题</span><input class="comment-field" required data-testid="studio-child-title" data-create="title" value="${attr(state.createTitle)}" /></label>
            <div class="mt-10 flex items-baseline justify-between gap-6 text-sm">
              <button type="submit" class="text-ink-100 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-child">创建</button>
              <button type="button" class="text-ink-500 underline decoration-transparent underline-offset-4 hover:text-ink-200 hover:decoration-ink-500" data-action="close-link">取消</button>
            </div>
          </form>
        ` : `
          <p class="mt-3 ui-meta">写入这篇的 DocList，和合集篇目同一套语法。</p>
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
  return create + link;
}

function render() {
  const src = previewSrc();
  root.innerHTML = `
    <div class="flex h-dvh min-h-0 flex-col" data-testid="studio-app">
      <header class="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
        <div class="min-w-0">
          <p class="ui-meta">本地编辑器</p>
          <h1 class="truncate text-lg font-semibold text-ink-100">Studio</h1>
        </div>
        <div class="flex flex-wrap items-center justify-end gap-4 text-sm">
          <span class="text-ink-400" data-studio-dirty ${state.dirty ? '' : 'hidden'}>未保存</span>
          <span class="text-ink-400" data-studio-status ${state.status ? '' : 'hidden'}>${esc(state.status)}</span>
          <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" data-action="save" ${!state.doc || state.saving ? 'disabled' : ''}>${state.saving ? '保存中' : '保存'}</button>
          <a class="text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" href="/">站点</a>
          <button type="button" class="text-ink-400 hover:text-ink-100" data-action="theme">主题</button>
        </div>
      </header>
      ${state.error ? `<p class="px-4 text-sm text-ink-200 sm:px-6" role="alert">${esc(state.error)}</p>` : ''}
      <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[13rem_minmax(0,1fr)_20rem]">
        <aside class="flex min-h-0 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6 md:px-4">
          <label><span class="sr-only">筛选</span><input class="comment-field" type="search" placeholder="筛选文章" data-testid="studio-filter" data-filter value="${attr(state.filter)}" /></label>
          <section>
            <div class="mb-2 flex items-baseline justify-between gap-2">
              <h2 class="ui-meta">文章</h2>
              <button type="button" class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-article" data-create-kind="article">新建</button>
            </div>
            <ul class="flex flex-col">${visibleArticles().map((item) => itemButton(item, 'articles')).join('')}</ul>
          </section>
          <section>
            <div class="mb-2 flex items-baseline justify-between gap-2">
              <h2 class="ui-meta">项目</h2>
              <button type="button" class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-project" data-create-kind="project">新建</button>
            </div>
            <ul class="flex flex-col">${state.docs.projects.filter(matchesFilter).map((item) => itemButton(item, 'projects')).join('')}</ul>
          </section>
          <section>
            <h2 class="ui-meta mb-2">博客名单</h2>
            <button type="button" class="block w-full py-1.5 text-left text-sm ${state.current?.id === 'blogs' ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100'}" data-testid="studio-open-blogs" data-open="pages:blogs">/blogs</button>
          </section>
          <section class="mt-auto pb-4">
            <h2 class="ui-meta mb-2">仓库</h2>
            ${state.git ? `<p class="text-sm text-ink-400">${esc(state.git.branch)}${state.git.dirty ? ` · ${state.git.files.length} 个改动` : ''}</p>` : ''}
            <label class="mt-3 block"><span class="sr-only">提交说明</span><input class="comment-field" placeholder="提交说明" data-testid="studio-commit-message" data-commit value="${attr(state.commitMessage)}" /></label>
            <div class="mt-3 flex flex-wrap gap-4 text-sm">
              <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-commit" data-action="commit">提交内容</button>
              <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-push" data-action="push">推送远程</button>
            </div>
          </section>
        </aside>
        <section class="flex min-h-0 flex-col overflow-hidden px-4 py-4 md:px-6">${editorHtml()}</section>
        <section class="hidden min-h-0 flex-col md:flex">
          <div class="min-h-0 shrink-0 overflow-y-auto px-4 py-4">${metaHtml()}</div>
          <div class="flex min-h-0 flex-1 flex-col">
            <div class="flex items-center gap-4 px-4 py-2 text-sm">
              <span class="ui-meta">站点预览</span>
              <button type="button" class="text-ink-400 underline decoration-ink-500 underline-offset-4" data-action="refresh">刷新</button>
            </div>
            ${src ? `<iframe class="min-h-0 w-full flex-1 bg-surface-950" title="文章预览" src="${attr(src)}" data-testid="studio-preview"></iframe>` : `<p class="px-4 text-sm text-ink-500">保存或打开一篇文档后，这里渲染真实页面。</p>`}
          </div>
        </section>
      </div>
    </div>
    ${dialogHtml()}`;
  bindBodyEditor();
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
    void insertLink(link);
  } else if (lang) {
    state.lang = lang === 'en' ? 'en' : 'zh';
    persist();
    render();
  } else if (action === 'save') void save();
  else if (action === 'theme') toggleTheme();
  else if (action === 'toggle-source') {
    state.sourceMode = !state.sourceMode;
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
  } else if (action === 'commit') void commit();
  else if (action === 'push') void pushRemote();
  else if (action === 'refresh') {
    state.previewKey += 1;
    render();
  }
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
  if (target.dataset.fm) {
    if (target.dataset.fm === 'draft') setFm('draft', target instanceof HTMLInputElement && target.checked);
    else setFm(target.dataset.fm, target.value);
  }
  if (target.dataset.tags !== undefined) {
    setFm('tags', target.value.split(',').map((item) => item.trim()).filter(Boolean));
  }
  if (target.dataset.body) setBody(target.dataset.body, target.value);
});

root.addEventListener('change', (event) => {
  const target = event.target;
  if (target instanceof HTMLInputElement && target.dataset.action === 'toggle-blogs') {
    event.preventDefault();
    void toggleBlogs();
  }
});

root.addEventListener('submit', (event) => {
  if (!(event.target instanceof HTMLFormElement) || !event.target.hasAttribute('data-create-form')) return;
  event.preventDefault();
  if (state.linkOpen && state.linkMode === 'child') state.createKind = 'child';
  void createDocFromForm();
});

window.addEventListener('keydown', (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key === 's') {
    event.preventDefault();
    void save();
  }
});

initTheme();
restoreSession();
refreshLists()
  .then(() => render())
  .catch((err) => {
    state.error = err instanceof Error ? err.message : String(err);
    render();
  });
