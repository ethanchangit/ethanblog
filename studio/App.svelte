<script lang="ts">
  import { onMount } from 'svelte';
  import { initTheme, toggleTheme } from '@/lib/theme';

  type DocSummary = {
    collection: 'articles' | 'projects' | 'pages';
    id: string;
    title: string;
    draft: boolean;
    href: string;
    series?: boolean;
  };

  type DocPayload = {
    collection: string;
    id: string;
    href: string;
    frontmatter: Record<string, unknown>;
    imports: string;
    bodyZh: string;
    bodyEn: string;
    raw: string;
  };

  type GitState = {
    branch: string;
    dirty: boolean;
    files: { code: string; path: string }[];
  };

  let docs = $state<{ articles: DocSummary[]; projects: DocSummary[]; pages: DocSummary[]; blogsRefs: string[] }>({
    articles: [],
    projects: [],
    pages: [],
    blogsRefs: [],
  });
  let current = $state<{ collection: string; id: string } | null>(null);
  let doc = $state<DocPayload | null>(null);
  let sourceMode = $state(false);
  let previewLang = $state<'zh' | 'en'>('zh');
  let dirty = $state(false);
  let saving = $state(false);
  let status = $state('');
  let error = $state('');
  let createOpen = $state(false);
  let createKind = $state<'article' | 'project' | 'series' | 'chapter'>('article');
  let createTitle = $state('');
  let createSlug = $state('');
  let createHub = $state('');
  let linkOpen = $state(false);
  let git = $state<GitState | null>(null);
  let commitMessage = $state('');
  let previewKey = $state(0);
  let filter = $state('');

  const hubs = $derived(docs.articles.filter((item) => !item.id.includes('/')));

  const previewSrc = $derived.by(() => {
    if (!doc) return '';
    const href = doc.href;
    const path = previewLang === 'zh' && href !== '/' ? `/zh${href}` : href;
    return `${path}?studio=${previewKey}`;
  });

  const inBlogs = $derived(
    doc ? docs.blogsRefs.includes(`${doc.collection}/${doc.id}`) : false,
  );

  const fm = $derived(doc?.frontmatter ?? {});

  async function api<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`/__studio/api${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
    const data = (await res.json()) as T & { error?: string };
    if (!res.ok) throw new Error(data.error || res.statusText);
    return data;
  }

  async function refreshLists() {
    docs = await api('/docs');
    git = await api('/git');
  }

  async function waitForPreview(href: string) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        const res = await fetch(href, { method: 'GET' });
        if (res.ok) break;
      } catch {
        // content layer may still be reloading
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    previewKey += 1;
  }

  async function openDoc(collection: string, id: string) {
    if (dirty && !(await confirmDiscard())) return;
    const next = await api<DocPayload>(`/doc?collection=${encodeURIComponent(collection)}&id=${encodeURIComponent(id)}`);
    current = { collection, id };
    doc = next;
    sourceMode = false;
    dirty = false;
    error = '';
    status = '';
    previewKey += 1;
  }

  function confirmDiscard() {
    return Promise.resolve(window.confirm('有未保存的改动，确定离开？'));
  }

  function setFm(key: string, value: unknown) {
    if (!doc) return;
    doc = { ...doc, frontmatter: { ...doc.frontmatter, [key]: value } };
    dirty = true;
  }

  function setBody(which: 'bodyZh' | 'bodyEn' | 'raw' | 'imports', value: string) {
    if (!doc) return;
    doc = { ...doc, [which]: value };
    dirty = true;
  }

  function tagsText(value: unknown) {
    return Array.isArray(value) ? value.join(', ') : '';
  }

  async function save(opts: { reload?: boolean } = {}) {
    if (!doc || !current) return;
    saving = true;
    error = '';
    try {
      const saved = await api<DocPayload>('/doc', {
        method: 'PUT',
        body: JSON.stringify({
          collection: current.collection,
          id: current.id,
          sourceMode,
          raw: doc.raw,
          frontmatter: doc.frontmatter,
          imports: doc.imports,
          bodyZh: doc.bodyZh,
          bodyEn: doc.bodyEn,
        }),
      });
      doc = saved;
      dirty = false;
      status = '已保存';
      if (opts.reload !== false) previewKey += 1;
      await refreshLists();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    } finally {
      saving = false;
    }
  }

  async function create() {
    error = '';
    try {
      const created = await api<{ collection: string; id: string; href: string }>('/create', {
        method: 'POST',
        body: JSON.stringify({
          kind: createKind,
          title: createTitle,
          slug: createSlug,
          hub: createHub,
        }),
      });
      createOpen = false;
      createTitle = '';
      createSlug = '';
      await refreshLists();
      await openDoc(created.collection, created.id);
      await waitForPreview(created.href ?? `/${created.collection}/${created.id}`);
      status = '已创建';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function toggleBlogs() {
    if (!doc || doc.collection === 'pages') return;
    const of = `${doc.collection}/${doc.id}`;
    const present = !inBlogs;
    const result = await api<{ refs: string[] }>('/blogs', {
      method: 'POST',
      body: JSON.stringify({ of, present }),
    });
    docs = { ...docs, blogsRefs: result.refs };
    status = present ? '已加入 /blogs' : '已移出 /blogs';
    previewKey += 1;
  }

  async function insertLink(of: string) {
    if (!current) return;
    error = '';
    try {
      if (dirty) await save();
      const next = await api<DocPayload>('/link', {
        method: 'POST',
        body: JSON.stringify({
          collection: current.collection,
          id: current.id,
          of,
          pane: doc?.bodyZh.includes('pane="series"') || doc?.bodyEn.includes('pane="series"') ? 'series' : undefined,
        }),
      });
      doc = next;
      dirty = false;
      linkOpen = false;
      status = `已引用 ${of}`;
      previewKey += 1;
      await refreshLists();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function commit() {
    error = '';
    try {
      if (dirty) await save();
      git = await api('/git/commit', {
        method: 'POST',
        body: JSON.stringify({ message: commitMessage }),
      });
      commitMessage = '';
      status = '已提交到仓库';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  async function push() {
    error = '';
    try {
      git = await api('/git/push', { method: 'POST' });
      status = '已推送到远程（生产仍需手动 Deploy workflow）';
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
    }
  }

  function matchesFilter(item: DocSummary) {
    const q = filter.trim().toLowerCase();
    if (!q) return true;
    return item.id.toLowerCase().includes(q) || item.title.toLowerCase().includes(q);
  }

  function openCreate(kind: typeof createKind, hub?: string) {
    createKind = kind;
    createTitle = '';
    createSlug = '';
    createHub = hub ?? hubs[0]?.id ?? '';
    createOpen = true;
    error = '';
  }

  onMount(() => {
    initTheme();
    void refreshLists();
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 's') {
        event.preventDefault();
        void save();
      }
    };
    window.addEventListener('keydown', onKey);
    const autosave = window.setInterval(() => {
      if (dirty && !saving) void save({ reload: false });
    }, 1500);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.clearInterval(autosave);
    };
  });
</script>

<div class="flex h-dvh min-h-0 flex-col">
  <header class="flex shrink-0 items-center justify-between gap-4 px-4 py-3 sm:px-6">
    <div class="min-w-0">
      <p class="ui-meta">本地编辑器</p>
      <h1 class="truncate text-lg font-semibold text-ink-100">Studio</h1>
    </div>
    <div class="flex flex-wrap items-center justify-end gap-4 text-sm">
      {#if dirty}<span class="text-ink-400">未保存</span>{/if}
      {#if status}<span class="text-ink-400">{status}</span>{/if}
      <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" onclick={() => void save()} disabled={!doc || saving}>
        {saving ? '保存中' : '保存'}
      </button>
      <a class="text-ink-200 underline decoration-ink-500 underline-offset-4 hover:text-ink-100" href="/" data-astro-reload>站点</a>
      <button type="button" class="text-ink-400 hover:text-ink-100" onclick={() => toggleTheme()}>主题</button>
    </div>
  </header>

  {#if error}
    <p class="px-4 text-sm text-ink-200 sm:px-6" role="alert">{error}</p>
  {/if}

  <div class="grid min-h-0 flex-1 grid-cols-1 md:grid-cols-[16rem_minmax(0,1fr)_minmax(0,1fr)]">
    <aside class="flex min-h-0 flex-col gap-6 overflow-y-auto px-4 py-4 sm:px-6 md:px-4">
      <label>
        <span class="sr-only">筛选</span>
        <input class="comment-field" type="search" bind:value={filter} placeholder="筛选文章" data-testid="studio-filter" />
      </label>

      <section>
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h2 class="ui-meta">文章</h2>
          <div class="flex gap-3 text-sm">
            <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-article" onclick={() => openCreate('article')}>新建</button>
            <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-series" onclick={() => openCreate('series')}>系列</button>
          </div>
        </div>
        <ul class="flex flex-col">
          {#each docs.articles.filter(matchesFilter) as item (item.id)}
            <li>
              <button
                type="button"
                class:list={['block w-full py-1.5 text-left text-sm', current?.id === item.id && current?.collection === 'articles' ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100']}
                data-testid={`studio-doc-articles-${item.id}`}
                onclick={() => void openDoc('articles', item.id)}
              >
                {item.title}
                {#if item.draft}<span class="ml-2 text-xs text-ink-500">草稿</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <section>
        <div class="mb-2 flex items-baseline justify-between gap-2">
          <h2 class="ui-meta">项目</h2>
          <button type="button" class="text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-project" onclick={() => openCreate('project')}>新建</button>
        </div>
        <ul class="flex flex-col">
          {#each docs.projects.filter(matchesFilter) as item (item.id)}
            <li>
              <button
                type="button"
                class:list={['block w-full py-1.5 text-left text-sm', current?.id === item.id && current?.collection === 'projects' ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100']}
                onclick={() => void openDoc('projects', item.id)}
              >
                {item.title}
                {#if item.draft}<span class="ml-2 text-xs text-ink-500">草稿</span>{/if}
              </button>
            </li>
          {/each}
        </ul>
      </section>

      <section>
        <h2 class="ui-meta mb-2">博客名单</h2>
        <button
          type="button"
          class:list={['block w-full py-1.5 text-left text-sm', current?.id === 'blogs' ? 'text-ink-100' : 'text-ink-400 hover:text-ink-100']}
          data-testid="studio-open-blogs"
          onclick={() => void openDoc('pages', 'blogs')}
        >
          /blogs
        </button>
        <p class="mt-2 text-xs leading-relaxed text-ink-500">手工引用。打开后可增删 DocRef，或在文章里勾选「收入 /blogs」。</p>
      </section>

      {#if current?.collection === 'articles' && !current.id.includes('/')}
        <button type="button" class="text-left text-sm text-ink-200 underline decoration-ink-500 underline-offset-4" onclick={() => openCreate('chapter', current?.id)}>
          给这个系列加一页
        </button>
      {/if}

      <section class="mt-auto pb-4">
        <h2 class="ui-meta mb-2">仓库</h2>
        {#if git}
          <p class="text-sm text-ink-400">{git.branch}{#if git.dirty} · {git.files.length} 个改动{/if}</p>
        {/if}
        <label class="mt-3 block">
          <span class="sr-only">提交说明</span>
          <input class="comment-field" bind:value={commitMessage} placeholder="提交说明" data-testid="studio-commit-message" />
        </label>
        <div class="mt-3 flex flex-wrap gap-4 text-sm">
          <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-commit" onclick={() => void commit()}>提交内容</button>
          <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-push" onclick={() => void push()}>推送远程</button>
        </div>
      </section>
    </aside>

    <section class="flex min-h-0 flex-col overflow-hidden px-4 py-4 md:px-6">
      {#if !doc}
        <p class="max-w-md text-ink-400">选一篇已有文章，或按「新建」创建对应格式的 MDX。用 Markdown 写，右侧是站点真实渲染。</p>
      {:else}
        <div class="mb-4 flex flex-wrap items-center gap-4 text-sm">
          <span class="font-mono text-xs text-ink-500">{doc.collection}/{doc.id}</span>
          <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" onclick={() => (sourceMode = !sourceMode)}>
            {sourceMode ? '表单' : '源码'}
          </button>
          {#if doc.collection !== 'pages'}
            <button type="button" class="text-ink-200 underline decoration-ink-500 underline-offset-4" data-testid="studio-link" onclick={() => (linkOpen = true)}>插入引用</button>
            <label class="inline-flex items-center gap-2 text-ink-400">
              <input type="checkbox" checked={Boolean(fm.draft)} onchange={(event) => setFm('draft', event.currentTarget.checked)} />
              草稿
            </label>
            <label class="inline-flex items-center gap-2 text-ink-400">
              <input type="checkbox" checked={inBlogs} onchange={() => void toggleBlogs()} data-testid="studio-blogs-toggle" />
              收入 /blogs
            </label>
          {/if}
          <a class="text-ink-200 underline decoration-ink-500 underline-offset-4" href={previewSrc} target="_blank" rel="noreferrer" data-astro-reload>新标签打开</a>
        </div>

        {#if sourceMode}
          <textarea
            class="min-h-0 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none"
            value={doc.raw}
            oninput={(event) => setBody('raw', event.currentTarget.value)}
            spellcheck="false"
            data-testid="studio-source"
          ></textarea>
        {:else}
          <div class="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            <label>
              <span class="ui-meta">标题</span>
              <input class="comment-field" value={String(fm.title ?? '')} oninput={(event) => setFm('title', event.currentTarget.value)} data-testid="studio-title" />
            </label>
            <label>
              <span class="ui-meta">English title</span>
              <input class="comment-field" value={String(fm.titleEn ?? '')} oninput={(event) => setFm('titleEn', event.currentTarget.value)} />
            </label>
            <label>
              <span class="ui-meta">摘要</span>
              <input class="comment-field" value={String(fm.description ?? '')} oninput={(event) => setFm('description', event.currentTarget.value)} />
            </label>
            <label>
              <span class="ui-meta">English description</span>
              <input class="comment-field" value={String(fm.descriptionEn ?? '')} oninput={(event) => setFm('descriptionEn', event.currentTarget.value)} />
            </label>
            {#if doc.collection === 'articles'}
              <label>
                <span class="ui-meta">日期</span>
                <input class="comment-field" type="date" value={String(fm.date ?? '').slice(0, 10)} oninput={(event) => setFm('date', event.currentTarget.value)} />
              </label>
              <label>
                <span class="ui-meta">标签（逗号分隔）</span>
                <input
                  class="comment-field"
                  value={tagsText(fm.tags)}
                  oninput={(event) =>
                    setFm(
                      'tags',
                      event.currentTarget.value
                        .split(',')
                        .map((item) => item.trim())
                        .filter(Boolean),
                    )}
                />
              </label>
            {/if}
            {#if doc.collection === 'projects'}
              <label>
                <span class="ui-meta">状态</span>
                <select class="comment-field" value={String(fm.status ?? 'wip')} onchange={(event) => setFm('status', event.currentTarget.value)}>
                  <option value="wip">wip</option>
                  <option value="active">active</option>
                  <option value="shipped">shipped</option>
                  <option value="archived">archived</option>
                </select>
              </label>
              <label>
                <span class="ui-meta">仓库 URL</span>
                <input class="comment-field" value={String(fm.repo ?? '')} oninput={(event) => setFm('repo', event.currentTarget.value)} />
              </label>
            {/if}
            {#if doc.imports}
              <label>
                <span class="ui-meta">imports</span>
                <textarea
                  class="comment-field comment-field--body min-h-16 font-mono"
                  value={doc.imports}
                  oninput={(event) => setBody('imports', event.currentTarget.value)}
                  spellcheck="false"
                ></textarea>
              </label>
            {/if}
            <div class="grid min-h-[28rem] flex-1 grid-cols-1 gap-6 lg:grid-cols-2">
              <label class="flex min-h-0 flex-col">
                <span class="ui-meta">中文 Markdown</span>
                <textarea
                  class="mt-2 min-h-64 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none"
                  value={doc.bodyZh}
                  oninput={(event) => setBody('bodyZh', event.currentTarget.value)}
                  spellcheck="true"
                  data-testid="studio-body-zh"
                ></textarea>
              </label>
              <label class="flex min-h-0 flex-col">
                <span class="ui-meta">English Markdown</span>
                <textarea
                  class="mt-2 min-h-64 flex-1 resize-none bg-transparent font-mono text-sm leading-relaxed text-ink-200 outline-none"
                  value={doc.bodyEn}
                  oninput={(event) => setBody('bodyEn', event.currentTarget.value)}
                  spellcheck="true"
                  data-testid="studio-body-en"
                ></textarea>
              </label>
            </div>
          </div>
        {/if}
      {/if}
    </section>

    <section class="hidden min-h-0 flex-col md:flex">
      <div class="flex items-center gap-4 px-4 py-3 text-sm">
        <span class="ui-meta">站点预览</span>
        <button type="button" class:list={['underline-offset-4', previewLang === 'zh' ? 'text-ink-100 underline' : 'text-ink-400']} onclick={() => (previewLang = 'zh')}>中文</button>
        <button type="button" class:list={['underline-offset-4', previewLang === 'en' ? 'text-ink-100 underline' : 'text-ink-400']} onclick={() => (previewLang = 'en')}>EN</button>
        <button type="button" class="text-ink-400 underline decoration-ink-500 underline-offset-4" onclick={() => (previewKey += 1)}>刷新</button>
      </div>
      {#if previewSrc}
        <iframe class="min-h-0 w-full flex-1 bg-surface-950" title="文章预览" src={previewSrc} data-testid="studio-preview"></iframe>
      {:else}
        <p class="px-4 text-sm text-ink-500">保存或打开一篇文档后，这里渲染真实页面。</p>
      {/if}
    </section>
  </div>
</div>

{#if createOpen}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true" aria-labelledby="studio-create-title">
    <form
      class="w-full max-w-md bg-surface-950"
      onsubmit={(event) => {
        event.preventDefault();
        void create();
      }}
    >
      <h2 id="studio-create-title" class="text-xl font-semibold text-ink-100">
        {createKind === 'article' ? '新建文章' : createKind === 'project' ? '新建项目' : createKind === 'series' ? '新建系列' : '新建系列子文'}
      </h2>
      <p class="mt-2 text-sm text-ink-400">会生成带 frontmatter 的 MDX，默认草稿。</p>
      <label class="mt-6 block">
        <span class="ui-meta">标题</span>
        <input class="comment-field" bind:value={createTitle} required data-testid="studio-create-title" />
      </label>
      {#if createKind !== 'chapter'}
        <label class="mt-4 block">
          <span class="ui-meta">slug</span>
          <input class="comment-field" bind:value={createSlug} placeholder="留空则从标题生成" data-testid="studio-create-slug" />
        </label>
      {:else}
        <label class="mt-4 block">
          <span class="ui-meta">总览</span>
          <select class="comment-field" bind:value={createHub} data-testid="studio-create-hub">
            {#each hubs as hub}
              <option value={hub.id}>{hub.title}</option>
            {/each}
          </select>
        </label>
      {/if}
      <div class="mt-8 flex gap-6 text-sm">
        <button type="submit" class="text-ink-100 underline decoration-ink-500 underline-offset-4" data-testid="studio-create-submit">创建</button>
        <button type="button" class="text-ink-400 hover:text-ink-100" onclick={() => (createOpen = false)}>取消</button>
      </div>
    </form>
  </div>
{/if}

{#if linkOpen && doc}
  <div class="fixed inset-0 z-50 flex items-end justify-center bg-surface-950/80 p-6 md:items-center" role="dialog" aria-modal="true">
    <div class="w-full max-w-md bg-surface-950">
      <h2 class="text-xl font-semibold text-ink-100">插入引用</h2>
      <p class="mt-2 text-sm text-ink-400">写入 <code>DocList</code> + <code>DocRef</code>，和 /blogs、系列总览同一套语法。</p>
      <ul class="mt-6 max-h-80 overflow-y-auto">
        {#each [...docs.articles, ...docs.projects] as item (`${item.collection}/${item.id}`)}
          {#if item.id !== current?.id}
            <li>
              <button type="button" class="block w-full py-1.5 text-left text-sm text-ink-400 hover:text-ink-100" onclick={() => void insertLink(`${item.collection}/${item.id}`)}>
                {item.collection}/{item.id}
              </button>
            </li>
          {/if}
        {/each}
      </ul>
      <button type="button" class="mt-6 text-sm text-ink-400 hover:text-ink-100" onclick={() => (linkOpen = false)}>取消</button>
    </div>
  </div>
{/if}
