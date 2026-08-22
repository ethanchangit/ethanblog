import '@fontsource-variable/inter';
import '@fontsource/jetbrains-mono/400.css';
import '@/styles/global.css';
import { initTheme, toggleTheme } from '@/lib/theme';

const root = document.getElementById('studio');

const state = {
  docs: { articles: [], projects: [], pages: [], blogsRefs: [] },
  current: null,
  doc: null,
  sourceMode: false,
  previewLang: 'zh',
  dirty: false,
  saving: false,
  status: '',
  error: '',
  createOpen: false,
  createKind: 'article',
  createTitle: '',
  createSlug: '',
  createHub: '',
  linkOpen: false,
  git: null,
  commitMessage: '',
  previewKey: 0,
  filter: '',
};

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

function previewSrc() {
  if (!state.doc) return '';
  const href = state.doc.href;
  const path = state.previewLang === 'zh' && href !== '/' ? `/zh${href}` : href;
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

function setFm(key, value) {
  if (!state.doc) return;
  state.doc = { ...state.doc, frontmatter: { ...state.doc.frontmatter, [key]: value } };
  markDirty();
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
        previewLang: state.previewLang,
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
      state.previewLang = saved.previewLang === 'en' ? 'en' : 'zh';
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

function openCreate(kind, hub) {
  state.createKind = kind;
  state.createTitle = '';
  state.createSlug = '';
  state.createHub = hub ?? state.docs.articles.find((item) => !item.id.includes('/'))?.id ?? '';
  state.createOpen = true;
  state.error = '';
  render();
}

async function createDocFromForm() {
  state.error = '';
  try {
    const created = await api('/create', {
      method: 'POST',
      body: JSON.stringify({
        kind: state.createKind,
        title: state.createTitle,
        slug: state.createSlug,
        hub: state.createHub,
      }),
    });
    state.createOpen = false;
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
    state.status = '已创建';
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
    if (state.dirty) await save();
    const pane =
      state.doc?.bodyZh.includes('pane="series"') || state.doc?.bodyEn.includes('pane="series"')
        ? 'series'
        : undefined;
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
    state.status = `已引用 ${of}`;
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
  return `<li><button type="button" class="block w-full py-1.5 text-left text-sm ${klass}" data-open="${collection}:${esc(item.id)}">${esc(item.title)}${item.draft ? '<span class="ml-2 text-xs text-ink-500">草稿</span>' : ''}</button></li>`;
}

function editorHtml() {
  if (!state.doc) {
    return `<p class="max-w-md text-ink-400">选一篇已有文章，或按「新建」创建对应格式的 MDX。用 Markdown 写，右侧是站点真实渲染。</p>`;
  }
  const data = fm();
  const src = previewSrc();
  const toolbar = `
    <div class="mb-4 flex flex-wrap items-center gap-4 text-sm">
      <span class="font-mono text-xs text-ink-500">${esc(state.doc.collection)}/${esc(state.doc.id)}</span>
      <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-action="toggle-source">${state.sourceMode ? '表单' : '源码'}</button>
      ${state.doc.collection !== 'pages' ? `
        <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-link" data-action="open-link">插入引用</button>
        <label class="inline-flex items-center gap-2 text-ink-400"><input type="checkbox" data-fm="draft" ${data.draft ? 'checked' : ''}/> 草稿</label>
        <label class="inline-flex items-center gap-2 text-ink-400"><input type="checkbox" data-testid="studio-blogs-toggle" data-action="toggle-blogs" ${inBlogs() ? 'checked' : ''}/> 收入 /blogs</label>
      ` : ''}
      <a class="text-ink-200 underline decoration-ink-500 underline-offset-4" href="${attr(src)}" target="_blank" rel="noreferrer">新标签打开</a>
    </div>`;
  if (state.sourceMode) {
    return `${toolbar}<textarea class="min-h-0 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none" spellcheck="false" data-testid="studio-source" data-body="raw">${esc(state.doc.raw)}</textarea>`;
  }
  return `${toolbar}
    <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
      <label><span class="ui-meta">标题</span><input class="comment-field" data-testid="studio-title" data-fm="title" value="${attr(data.title)}" /></label>
      <label><span class="ui-meta">English title</span><input class="comment-field" data-fm="titleEn" value="${attr(data.titleEn)}" /></label>
      <label><span class="ui-meta">摘要</span><input class="comment-field" data-fm="description" value="${attr(data.description)}" /></label>
      <label><span class="ui-meta">English description</span><input class="comment-field" data-fm="descriptionEn" value="${attr(data.descriptionEn)}" /></label>
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
      ${state.doc.imports ? `<label><span class="ui-meta">imports</span><textarea class="comment-field comment-field--body min-h-16 font-mono" spellcheck="false" data-body="imports">${esc(state.doc.imports)}</textarea></label>` : ''}
      <div class="grid min-h-[28rem] flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
        <label class="flex min-h-0 flex-col"><span class="ui-meta">中文 Markdown</span><textarea class="mt-2 min-h-64 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none" spellcheck="true" data-testid="studio-body-zh" data-body="bodyZh">${esc(state.doc.bodyZh)}</textarea></label>
        <label class="flex min-h-0 flex-col"><span class="ui-meta">English Markdown</span><textarea class="mt-2 min-h-64 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none" spellcheck="true" data-testid="studio-body-en" data-body="bodyEn">${esc(state.doc.bodyEn)}</textarea></label>
      </div>
    </div>`;
}

function dialogHtml() {
  const kindLabel = { article: '新建文章', project: '新建项目', series: '新建系列', chapter: '新建系列子文' }[state.createKind];
  const hubs = state.docs.articles.filter((item) => !item.id.includes('/'));
  const create = state.createOpen ? `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true">
      <form class="w-full max-w-md bg-surface-950" data-create-form>
        <h2 class="text-xl font-semibold text-ink-100">${kindLabel}</h2>
        <p class="mt-2 text-sm text-ink-400">会生成带 frontmatter 的 MDX，默认草稿。</p>
        <label class="mt-6 block"><span class="ui-meta">标题</span><input class="comment-field" required data-testid="studio-create-title" data-create="title" value="${attr(state.createTitle)}" /></label>
        ${state.createKind !== 'chapter' ? `<label class="mt-4 block"><span class="ui-meta">slug</span><input class="comment-field" placeholder="留空则从标题生成" data-testid="studio-create-slug" data-create="slug" value="${attr(state.createSlug)}" /></label>` : `<label class="mt-4 block"><span class="ui-meta">总览</span><select class="comment-field" data-testid="studio-create-hub" data-create="hub">${hubs.map((hub) => `<option value="${attr(hub.id)}" ${state.createHub === hub.id ? 'selected' : ''}>${esc(hub.title)}</option>`).join('')}</select></label>`}
        <div class="mt-8 flex gap-6 text-sm">
          <button type="submit" class="text-ink-100 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-submit">创建</button>
          <button type="button" class="text-ink-400 hover:text-ink-100" data-action="close-create">取消</button>
        </div>
      </form>
    </div>` : '';
  const link = state.linkOpen && state.doc ? `
    <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true">
      <div class="w-full max-w-md bg-surface-950">
        <h2 class="text-xl font-semibold text-ink-100">插入引用</h2>
        <p class="mt-2 text-sm text-ink-400">写入 DocList + DocRef，和 /blogs、系列总览同一套语法。</p>
        <ul class="mt-6 max-h-80 overflow-y-auto">
          ${[...state.docs.articles, ...state.docs.projects].filter((item) => item.id !== state.current?.id).map((item) => `<li><button type="button" class="block w-full py-1.5 text-left text-sm text-ink-400 hover:text-ink-100" data-link="${esc(item.collection)}/${esc(item.id)}">${esc(item.collection)}/${esc(item.id)}</button></li>`).join('')}
        </ul>
        <button type="button" class="mt-6 text-sm text-ink-400 hover:text-ink-100" data-action="close-link">取消</button>
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
      <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)]">
        <aside class="flex min-h-0 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6 md:px-4">
          <label><span class="sr-only">筛选</span><input class="comment-field" type="search" placeholder="筛选文章" data-testid="studio-filter" data-filter value="${attr(state.filter)}" /></label>
          <section>
            <div class="mb-2 flex items-baseline justify-between gap-2">
              <h2 class="ui-meta">文章</h2>
              <div class="flex gap-3 text-sm">
                <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-article" data-create-kind="article">新建</button>
                <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-series" data-create-kind="series">系列</button>
              </div>
            </div>
            <ul class="flex flex-col">${state.docs.articles.filter(matchesFilter).map((item) => itemButton(item, 'articles')).join('')}</ul>
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
            <p class="mt-2 text-xs leading-relaxed text-ink-500">手工引用。打开后可增删 DocRef，或在文章里勾选「收入 /blogs」。</p>
          </section>
          ${state.current?.collection === 'articles' && !state.current.id.includes('/') ? `<button type="button" class="text-left text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" data-create-kind="chapter" data-create-hub="${attr(state.current.id)}">给这个系列加一页</button>` : ''}
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
          <div class="flex items-center gap-4 px-4 py-3 text-sm">
            <span class="ui-meta">站点预览</span>
            <button type="button" class="underline-offset-4 ${state.previewLang === 'zh' ? 'text-ink-100 underline' : 'text-ink-400'}" data-lang="zh">中文</button>
            <button type="button" class="underline-offset-4 ${state.previewLang === 'en' ? 'text-ink-100 underline' : 'text-ink-400'}" data-lang="en">EN</button>
            <button type="button" class="text-ink-400 underline decoration-ink-500 underline-offset-4" data-action="refresh">刷新</button>
          </div>
          ${src ? `<iframe class="min-h-0 w-full flex-1 bg-surface-950" title="文章预览" src="${attr(src)}" data-testid="studio-preview"></iframe>` : `<p class="px-4 text-sm text-ink-500">保存或打开一篇文档后，这里渲染真实页面。</p>`}
        </section>
      </div>
    </div>
    ${dialogHtml()}`;
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
    openCreate(createKind, target.dataset.createHub);
  } else if (link) {
    void insertLink(link);
  } else if (lang) {
    state.previewLang = lang;
    render();
  } else if (action === 'save') void save();
  else if (action === 'theme') toggleTheme();
  else if (action === 'toggle-source') {
    state.sourceMode = !state.sourceMode;
    render();
  } else if (action === 'open-link') {
    state.linkOpen = true;
    render();
  } else if (action === 'close-create') {
    state.createOpen = false;
    render();
  } else if (action === 'close-link') {
    state.linkOpen = false;
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
  if (target.dataset.commit !== undefined) state.commitMessage = target.value;
  if (target.dataset.create === 'title') state.createTitle = target.value;
  if (target.dataset.create === 'slug') state.createSlug = target.value;
  if (target.dataset.create === 'hub') state.createHub = target.value;
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
