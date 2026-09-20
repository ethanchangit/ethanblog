import {
  addDocRefToRaw,
  createArticleRaw,
  createChildRaw,
  createProjectRaw,
  isSafeDocRef,
  isSafeId,
  listDocRefs,
  parseMdx,
  publicHref,
  removeDocRefFromRaw,
  serializeMdx,
  slugify,
  todayIso,
  validateContentFile,
} from '../core.mjs';
import {
  applyTagGroupsSource,
  normalizeTagGroups,
  parseTagGroupsSource,
} from '../tag-groups-core.mjs';

const DEFAULT_REPOSITORY = 'ethanchangit/ethanblog';
const DEFAULT_BRANCH = 'main';
const WORKFLOW_PATH = '.github/workflows/deploy.yml';
const BLOG_URL = 'https://ethanchang.io';
const ALLOWED_CONTENT = /^(src\/content\/(articles|projects)\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)*\.mdx|src\/content\/pages\/blogs\.mdx|src\/data\/tag-groups\.ts)$/;

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });
}

function cfg(env) {
  return {
    repository: String(env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY),
    branch: String(env.GITHUB_DEFAULT_BRANCH || DEFAULT_BRANCH),
    workflow: String(env.GITHUB_DEPLOY_WORKFLOW || WORKFLOW_PATH),
  };
}

function csv(value) {
  return String(value ?? '').split(',').map((item) => item.trim()).filter(Boolean);
}

function identityFromRequest(request, env) {
  const id = request.headers.get('oai-authenticated-user-id')?.trim() || '';
  const email = request.headers.get('oai-authenticated-user-email')?.trim().toLowerCase() || '';
  if (!id && !email && String(env.STUDIO_ALLOW_ANONYMOUS) === 'true') {
    return { id: 'local-anonymous', email: 'local@example.invalid' };
  }
  if (!id && !email) return null;
  const allowedIds = csv(env.STUDIO_ALLOWED_USER_IDS);
  const allowedEmails = csv(env.STUDIO_ALLOWED_USER_EMAILS).map((item) => item.toLowerCase());
  if (!allowedIds.length && !allowedEmails.length) return { error: '尚未配置作者白名单，请在 Sites 设置中配置 STUDIO_ALLOWED_USER_EMAILS 或 STUDIO_ALLOWED_USER_IDS。' };
  if ((id && allowedIds.includes(id)) || (email && allowedEmails.includes(email))) return { id: id || email, email };
  return { error: '当前 ChatGPT 账号没有 Ethan Blog Studio 的作者权限。' };
}

function requireAuthor(request, env) {
  const identity = identityFromRequest(request, env);
  if (!identity) throw Object.assign(new Error('需要使用 ChatGPT 登录后访问。'), { status: 401 });
  if (identity.error) throw Object.assign(new Error(identity.error), { status: 403 });
  return identity;
}

function requireCsrf(request) {
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) {
    throw Object.assign(new Error('拒绝跨来源写入。'), { status: 403 });
  }
  if (request.headers.get('sec-fetch-site') === 'cross-site') {
    throw Object.assign(new Error('拒绝跨站写入。'), { status: 403 });
  }
}

async function readJson(request) {
  const length = Number(request.headers.get('content-length') || 0);
  if (length > 2_000_000) throw Object.assign(new Error('请求正文太大。'), { status: 413 });
  const text = await request.text();
  if (text.length > 2_000_000) throw Object.assign(new Error('请求正文太大。'), { status: 413 });
  if (!text.trim()) return {};
  try { return JSON.parse(text); } catch { throw Object.assign(new Error('请求不是合法 JSON。'), { status: 400 }); }
}

function db(env) {
  if (!env.DB) throw Object.assign(new Error('Sites D1 尚未绑定或尚未完成部署。'), { status: 503 });
  return env.DB;
}

async function allRows(env, statement, ...bindings) {
  const result = await db(env).prepare(statement).bind(...bindings).all();
  return result.results ?? [];
}

async function firstRow(env, statement, ...bindings) {
  return db(env).prepare(statement).bind(...bindings).first();
}

async function run(env, statement, ...bindings) {
  return db(env).prepare(statement).bind(...bindings).run();
}

function base64Encode(value) {
  const bytes = new TextEncoder().encode(String(value));
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function base64Decode(value) {
  const binary = atob(String(value).replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function ghPath(repo, suffix) {
  return `/repos/${repo}${suffix}`;
}

async function githubRequest(env, path, init = {}) {
  const token = String(env.GITHUB_TOKEN || '');
  if (!token) throw Object.assign(new Error('Sites 尚未配置 GITHUB_TOKEN。请在 Site 设置中添加仓库级 GitHub Token。'), { status: 503 });
  const headers = new Headers(init.headers || {});
  headers.set('accept', 'application/vnd.github+json');
  headers.set('content-type', 'application/json');
  headers.set('x-github-api-version', '2022-11-28');
  headers.set('authorization', `Bearer ${token}`);
  const response = await fetch(`https://api.github.com${path}`, { ...init, headers });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const detail = data?.message ? `：${data.message}` : '';
    const status = response.status === 409 || response.status === 422 ? 409 : response.status === 404 ? 404 : 502;
    throw Object.assign(new Error(`GitHub 请求失败（${response.status}）${detail}`), { status, githubStatus: response.status });
  }
  return data;
}

async function branchState(env) {
  const { repository, branch } = cfg(env);
  const ref = await githubRequest(env, ghPath(repository, `/git/ref/heads/${branch.split('/').map(encodeURIComponent).join('/')}`));
  const commitSha = ref.object.sha;
  const commit = await githubRequest(env, ghPath(repository, `/git/commits/${encodeURIComponent(commitSha)}`));
  const tree = await githubRequest(env, ghPath(repository, `/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`));
  const entries = new Map((tree.tree ?? []).filter((item) => item.type === 'blob').map((item) => [item.path, item]));
  return { repository, branch, commitSha, treeSha: commit.tree.sha, entries };
}

async function readBlob(env, state, filePath) {
  const entry = state.entries.get(filePath);
  if (!entry) return null;
  const blob = await githubRequest(env, ghPath(state.repository, `/git/blobs/${encodeURIComponent(entry.sha)}`));
  return base64Decode(blob.content);
}

function docPath(collection, id) {
  if (!isSafeId(collection, id)) throw Object.assign(new Error(`不合法的文档 id：${collection}/${id}`), { status: 400 });
  if (collection === 'pages') return 'src/content/pages/blogs.mdx';
  return `src/content/${collection}/${id}.mdx`;
}

function pathDoc(filePath) {
  let match = /^src\/content\/(articles|projects)\/(.+)\.mdx$/.exec(filePath);
  if (match && isSafeId(match[1], match[2])) return { collection: match[1], id: match[2] };
  if (filePath === 'src/content/pages/blogs.mdx') return { collection: 'pages', id: 'blogs' };
  return null;
}

function summary(collection, id, raw, extra = {}) {
  const data = parseMdx(raw).frontmatter ?? {};
  return {
    collection, id, title: data.title ?? id, titleEn: data.titleEn ?? '',
    description: data.description ?? '', descriptionEn: data.descriptionEn ?? '',
    tags: Array.isArray(data.tags) ? data.tags : [], draft: Boolean(data.draft), listed: data.listed,
    date: data.date ? String(data.date).slice(0, 10) : '',
    slot: data.slot ?? (collection === 'projects' ? 'project' : collection === 'articles' ? 'article' : undefined),
    href: publicHref(collection, id), series: id.includes('/'), ...extra,
  };
}

async function draftRows(env, identity, state = 'draft') {
  return allRows(env, 'SELECT * FROM studio_drafts WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 AND state = ?4 ORDER BY saved_at DESC', identity.id, cfg(env).repository, cfg(env).branch, state);
}

async function draftFor(env, identity, filePath) {
  return firstRow(env, 'SELECT * FROM studio_drafts WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 AND path = ?4', identity.id, cfg(env).repository, cfg(env).branch, filePath);
}

async function effectiveFile(env, identity, state, filePath) {
  const remoteRaw = await readBlob(env, state, filePath);
  const draft = await draftFor(env, identity, filePath);
  if (!remoteRaw && !draft) return { raw: null, remoteRaw: null, draft: null };
  return { raw: draft?.state === 'draft' ? draft.raw : remoteRaw, remoteRaw, draft };
}

async function upsertDraft(env, identity, state, filePath, raw, { baseCommitSha, baseRaw, expectedVersion } = {}) {
  const existing = await draftFor(env, identity, filePath);
  if (existing && existing.state === 'draft' && Number(expectedVersion ?? existing.version) !== Number(existing.version)) {
    throw Object.assign(new Error(`草稿版本已变化，请刷新后处理冲突（${filePath}）。`), { status: 409, conflict: { path: filePath, expectedVersion, actualVersion: existing.version } });
  }
  const version = existing && existing.state === 'draft' ? Number(existing.version) + 1 : 1;
  const now = new Date().toISOString();
  const baseSha = existing?.base_commit_sha ?? baseCommitSha ?? state.commitSha;
  const original = existing?.base_raw ?? baseRaw ?? null;
  await run(env, `INSERT INTO studio_drafts
    (user_id, repository, branch, path, raw, base_commit_sha, base_raw, version, state, saved_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'draft', ?9, ?9)
    ON CONFLICT(user_id, repository, branch, path) DO UPDATE SET
      raw = excluded.raw, version = excluded.version, state = 'draft', saved_at = excluded.saved_at,
      updated_at = excluded.updated_at`,
    identity.id, state.repository, state.branch, filePath, raw, baseSha, original, version, now);
  return { version, savedAt: now, baseCommitSha: baseSha };
}

function docPayload(collection, id, raw, state, draft, remoteRaw) {
  const parsed = parseMdx(raw);
  return {
    collection, id, href: publicHref(collection, id), ...parsed,
    filePath: docPath(collection, id),
    remoteRaw,
    remoteCommitSha: state.commitSha,
    baseCommitSha: draft?.base_commit_sha ?? state.commitSha,
    draftVersion: draft?.state === 'draft' ? Number(draft.version) : 0,
    draftSavedAt: draft?.state === 'draft' ? draft.saved_at : null,
    hasPrivateDraft: draft?.state === 'draft',
  };
}

async function listDocs(env, identity) {
  const state = await branchState(env);
  const paths = [...state.entries.keys()].filter((filePath) => pathDoc(filePath));
  const rows = await draftRows(env, identity);
  const drafts = new Map(rows.map((row) => [row.path, row]));
  const articles = [];
  const projects = [];
  for (const filePath of paths) {
    const target = pathDoc(filePath);
    const remoteRaw = await readBlob(env, state, filePath);
    const draft = drafts.get(filePath);
    const item = summary(target.collection, target.id, draft?.raw ?? remoteRaw, draft ? { privateDraft: true, draftSavedAt: draft.saved_at, draftVersion: Number(draft.version) } : {});
    if (target.collection === 'articles') articles.push(item); else if (target.collection === 'projects') projects.push(item);
  }
  for (const row of rows) {
    if (pathDoc(row.path) && !state.entries.has(row.path)) {
      const target = pathDoc(row.path);
      const item = summary(target.collection, target.id, row.raw, { privateDraft: true, draftSavedAt: row.saved_at, draftVersion: Number(row.version) });
      if (target.collection === 'articles') articles.push(item); else if (target.collection === 'projects') projects.push(item);
    }
  }
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  projects.sort((a, b) => a.id.localeCompare(b.id));
  const blogsPath = 'src/content/pages/blogs.mdx';
  const blogs = await effectiveFile(env, identity, state, blogsPath);
  return {
    articles, projects,
    pages: blogs.raw ? [summary('pages', 'blogs', blogs.raw, blogs.draft ? { privateDraft: true, draftSavedAt: blogs.draft.saved_at, draftVersion: Number(blogs.draft.version) } : {})] : [],
    blogsRefs: blogs.raw ? listDocRefs(blogs.raw) : [],
    repository: state.repository,
    branch: state.branch,
    commitSha: state.commitSha,
  };
}

async function readDoc(env, identity, collection, id) {
  const state = await branchState(env);
  const filePath = docPath(collection, id);
  const file = await effectiveFile(env, identity, state, filePath);
  if (!file.raw) throw Object.assign(new Error(`文档不存在：${collection}/${id}`), { status: 404 });
  return docPayload(collection, id, file.raw, state, file.draft, file.remoteRaw);
}

async function saveDoc(env, identity, payload) {
  const state = await branchState(env);
  const collection = String(payload.collection || '');
  const id = String(payload.id || '');
  const filePath = docPath(collection, id);
  const current = await effectiveFile(env, identity, state, filePath);
  const raw = typeof payload.raw === 'string' && payload.sourceMode
    ? payload.raw
    : serializeMdx({ frontmatter: payload.frontmatter ?? {}, imports: payload.imports ?? '', bodyZh: payload.bodyZh ?? '', bodyEn: payload.bodyEn ?? '' });
  const saved = await upsertDraft(env, identity, state, filePath, raw, {
    baseCommitSha: current.draft?.base_commit_sha ?? state.commitSha,
    baseRaw: current.draft?.base_raw ?? current.remoteRaw,
    expectedVersion: Number(payload.draftVersion ?? 0),
  });
  const next = await draftFor(env, identity, filePath);
  return { ...docPayload(collection, id, raw, state, next, current.remoteRaw), draftVersion: saved.version, draftSavedAt: saved.savedAt, hasPrivateDraft: true };
}

async function nextChildNumber(env, identity, state, parentCollection, parentId) {
  const prefix = `src/content/${parentCollection}/${parentId}/`;
  const rows = await draftRows(env, identity);
  const ids = [...state.entries.keys(), ...rows.map((row) => row.path)].filter((filePath) => filePath.startsWith(prefix));
  return ids.reduce((max, filePath) => {
    const match = /\/(\d+)\.mdx$/.exec(filePath);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0) + 1;
}

async function createDoc(env, identity, input) {
  const state = await branchState(env);
  const kind = String(input.kind || '');
  const title = String(input.title || '').trim();
  if (!title) throw Object.assign(new Error('请填写标题。'), { status: 400 });
  if (kind === 'article' || kind === 'project') {
    const collection = kind === 'project' ? 'projects' : 'articles';
    const slug = String(input.slug || slugify(title)).trim();
    if (!isSafeId(collection, slug) || slug.includes('/')) throw Object.assign(new Error('slug 只能用小写字母、数字和连字符。'), { status: 400 });
    const filePath = docPath(collection, slug);
    if (state.entries.has(filePath) || await draftFor(env, identity, filePath)) throw Object.assign(new Error(`文件已存在：${filePath}`), { status: 400 });
    const raw = kind === 'project' ? createProjectRaw({ title }) : createArticleRaw({ title, date: input.date || todayIso() });
    await upsertDraft(env, identity, state, filePath, raw, { baseRaw: null });
    return { collection, id: slug, href: publicHref(collection, slug) };
  }
  if (kind === 'child') {
    const parentCollection = String(input.parentCollection || 'articles');
    const parentId = String(input.parentId || '').trim();
    if (parentCollection === 'pages' || !isSafeId(parentCollection, parentId)) throw Object.assign(new Error('请打开一篇可以有子页面的文章。'), { status: 400 });
    const parentPath = docPath(parentCollection, parentId);
    const parent = await effectiveFile(env, identity, state, parentPath);
    if (!parent.raw) throw Object.assign(new Error('父页面不存在。'), { status: 404 });
    const order = await nextChildNumber(env, identity, state, parentCollection, parentId);
    const id = `${parentId}/${order}`;
    const filePath = docPath(parentCollection, id);
    const slot = parseMdx(parent.raw).frontmatter.slot || (parentCollection === 'projects' ? 'project' : 'article');
    const raw = createChildRaw({ title, date: input.date || todayIso(), order, slot });
    await upsertDraft(env, identity, state, filePath, raw, { baseRaw: null });
    return { collection: parentCollection, id, href: publicHref(parentCollection, id), parentId };
  }
  throw Object.assign(new Error(`未知的创建类型：${kind}`), { status: 400 });
}

async function updateDocRef(env, identity, collection, id, of, present, pane) {
  if (!isSafeDocRef(of)) throw Object.assign(new Error(`不合法的引用：${of}`), { status: 400 });
  const state = await branchState(env);
  const filePath = docPath(collection, id);
  const current = await effectiveFile(env, identity, state, filePath);
  if (!current.raw) throw Object.assign(new Error('目标文档不存在。'), { status: 404 });
  const next = present
    ? addDocRefToRaw(current.raw, of, { pane })
    : removeDocRefFromRaw(current.raw, of);
  await upsertDraft(env, identity, state, filePath, next, { baseCommitSha: current.draft?.base_commit_sha ?? state.commitSha, baseRaw: current.draft?.base_raw ?? current.remoteRaw, expectedVersion: current.draft?.version ?? 0 });
  return readDoc(env, identity, collection, id);
}

async function readTagSource(env, identity, state) {
  const path = 'src/data/tag-groups.ts';
  const remoteRaw = await readBlob(env, state, path);
  const draft = await draftFor(env, identity, path);
  if (!remoteRaw && !draft) throw new Error('找不到 tag-groups.ts');
  return { raw: draft?.state === 'draft' ? draft.raw : remoteRaw, remoteRaw, draft };
}

async function tagTaxonomy(env, identity) {
  const state = await branchState(env);
  const source = await readTagSource(env, identity, state);
  const groups = parseTagGroupsSource(source.raw);
  const docs = await listDocs(env, identity);
  const used = new Map();
  for (const item of [...docs.articles, ...docs.projects]) for (const tag of item.tags ?? []) used.set(tag, (used.get(tag) ?? 0) + 1);
  const assigned = new Set(groups.flatMap((group) => group.tags));
  const ungrouped = [...used.keys()].filter((tag) => !assigned.has(tag)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return { groups, ungrouped, used: Object.fromEntries(used) };
}

async function saveTags(env, identity, input) {
  const groups = normalizeTagGroups(input.groups);
  const state = await branchState(env);
  const current = await readTagSource(env, identity, state);
  const next = applyTagGroupsSource(current.raw, groups);
  await upsertDraft(env, identity, state, 'src/data/tag-groups.ts', next, { baseCommitSha: current.draft?.base_commit_sha ?? state.commitSha, baseRaw: current.draft?.base_raw ?? current.remoteRaw, expectedVersion: current.draft?.version ?? 0 });
  return tagTaxonomy(env, identity);
}

async function gitStatus(env, identity) {
  const state = await branchState(env);
  const rows = await draftRows(env, identity);
  const releaseRow = await firstRow(env, 'SELECT * FROM studio_releases WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 ORDER BY created_at DESC LIMIT 1', identity.id, state.repository, state.branch);
  const release = releaseRow ? await syncRelease(env, releaseRow) : null;
  const lastSubmitted = await firstRow(env, 'SELECT submitted_commit_sha FROM studio_drafts WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 AND state = \'submitted\' AND submitted_commit_sha IS NOT NULL ORDER BY updated_at DESC LIMIT 1', identity.id, state.repository, state.branch);
  return {
    branch: state.branch, commitSha: state.commitSha, files: rows.map((row) => ({ code: 'M', path: row.path })), dirty: rows.length > 0,
    repository: state.repository, draftCount: rows.length, lastUserCommitSha: lastSubmitted?.submitted_commit_sha || null, release,
  };
}

function releaseView(row) {
  if (!row) return null;
  return {
    id: row.id, commitSha: row.commit_sha, workflowRunId: row.workflow_run_id ? Number(row.workflow_run_id) : null,
    stage: row.stage, status: row.status, error: row.error || null, url: row.url || null,
    createdAt: row.created_at, updatedAt: row.updated_at,
    workflowUrl: row.workflow_run_id ? `https://github.com/${row.repository}/actions/runs/${row.workflow_run_id}` : null,
  };
}

async function syncRelease(env, row) {
  if (!row || !['queued', 'running'].includes(row.status)) return releaseView(row);
  let next = row;
  try {
    if (!row.workflow_run_id) {
      const runs = await githubRequest(env, ghPath(row.repository, `/actions/workflows/${encodeURIComponent(row.workflow_path)}/runs?event=workflow_dispatch&branch=${encodeURIComponent(row.branch)}&per_page=20`));
      const match = (runs.workflow_runs ?? []).find((runInfo) => runInfo.head_sha === row.commit_sha && new Date(runInfo.created_at).getTime() >= new Date(row.created_at).getTime() - 60_000);
      if (match) {
        await run(env, 'UPDATE studio_releases SET workflow_run_id = ?1, updated_at = ?2 WHERE id = ?3', String(match.id), new Date().toISOString(), row.id);
        next = { ...row, workflow_run_id: String(match.id), updated_at: new Date().toISOString() };
      }
    }
    if (next.workflow_run_id) {
      const runInfo = await githubRequest(env, ghPath(row.repository, `/actions/runs/${encodeURIComponent(next.workflow_run_id)}`));
      const status = runInfo.conclusion === 'success' ? 'succeeded' : runInfo.conclusion && runInfo.conclusion !== 'neutral' ? 'failed' : 'running';
      const stage = status === 'succeeded' ? 'deployed' : status === 'failed' ? 'failed' : 'building';
      const error = status === 'failed' ? `GitHub Actions 结论：${runInfo.conclusion}` : null;
      const updatedAt = new Date().toISOString();
      await run(env, 'UPDATE studio_releases SET status = ?1, stage = ?2, error = ?3, url = ?4, updated_at = ?5 WHERE id = ?6', status, stage, error, status === 'succeeded' ? BLOG_URL : null, updatedAt, row.id);
      next = { ...next, status, stage, error, url: status === 'succeeded' ? BLOG_URL : null, updated_at: updatedAt };
    }
  } catch (error) {
    // A temporarily unavailable Actions listing must not turn a known release into a false failure.
    if (error?.status === 404) return releaseView(row);
  }
  return releaseView(next);
}

async function commitDrafts(env, identity, input) {
  const rows = await draftRows(env, identity);
  if (!rows.length) throw Object.assign(new Error('没有可提交的私人草稿。'), { status: 400 });
  for (const row of rows) {
    if (!ALLOWED_CONTENT.test(row.path)) throw Object.assign(new Error(`拒绝提交未授权路径：${row.path}`), { status: 400 });
    if (row.path.endsWith('.mdx')) validateContentFile(row.path, row.raw);
    if (row.path === 'src/data/tag-groups.ts') parseTagGroupsSource(row.raw);
  }
  const state = await branchState(env);
  const conflicts = [];
  for (const row of rows) {
    const currentRaw = await readBlob(env, state, row.path);
    const changedRemotely = row.base_commit_sha !== state.commitSha && currentRaw !== (row.base_raw ?? null);
    if (changedRemotely && currentRaw !== row.raw) conflicts.push({ path: row.path, baseCommitSha: row.base_commit_sha, currentCommitSha: state.commitSha, baseRaw: row.base_raw, remoteRaw: currentRaw, draftRaw: row.raw });
  }
  if (conflicts.length) {
    // Keep private draft text in D1 and require an explicit refresh/merge decision.
    // The error response intentionally exposes only version identifiers, not file contents.
    throw Object.assign(new Error('GitHub 文件在草稿创建后发生变化，未覆盖远程内容。'), {
      status: 409,
      conflicts: conflicts.map(({ path, baseCommitSha, currentCommitSha }) => ({ path, baseCommitSha, currentCommitSha })),
    });
  }
  const treeEntries = [];
  for (const row of rows) {
    const blob = await githubRequest(env, ghPath(state.repository, '/git/blobs'), { method: 'POST', body: JSON.stringify({ content: base64Encode(row.raw), encoding: 'base64' }) });
    treeEntries.push({ path: row.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await githubRequest(env, ghPath(state.repository, '/git/trees'), { method: 'POST', body: JSON.stringify({ base_tree: state.treeSha, tree: treeEntries }) });
  const message = String(input.message || '').trim();
  if (!message || message.startsWith('-')) throw Object.assign(new Error('请填写不以 - 开头的提交说明。'), { status: 400 });
  const commit = await githubRequest(env, ghPath(state.repository, '/git/commits'), { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [state.commitSha] }) });
  try {
    await githubRequest(env, ghPath(state.repository, `/git/refs/heads/${state.branch.split('/').map(encodeURIComponent).join('/')}`), { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
  } catch (error) {
    if (error?.githubStatus === 409 || error?.githubStatus === 422) throw Object.assign(new Error('GitHub 分支无法直接更新，可能受到保护规则限制；远程未被覆盖，请改用 PR 流程。'), { status: 409, branchProtected: true, commitSha: commit.sha });
    throw error;
  }
  const now = new Date().toISOString();
  for (const row of rows) await run(env, 'UPDATE studio_drafts SET state = \'submitted\', submitted_commit_sha = ?1, updated_at = ?2 WHERE user_id = ?3 AND repository = ?4 AND branch = ?5 AND path = ?6', commit.sha, now, identity.id, state.repository, state.branch, row.path);
  return { branch: state.branch, commitSha: commit.sha, files: rows.map((row) => ({ code: 'M', path: row.path })), dirty: false, submitted: rows.map((row) => row.path), repository: state.repository, release: null };
}

async function publish(env, identity, input) {
  const state = await branchState(env);
  const commitSha = String(input.commitSha || '');
  if (!commitSha || commitSha !== state.commitSha) throw Object.assign(new Error('只能发布当前目标分支上已确认的 commit。'), { status: 409 });
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await run(env, 'INSERT INTO studio_releases (id, user_id, repository, branch, workflow_path, commit_sha, status, stage, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, \'queued\', \'dispatching\', ?7, ?7)', id, identity.id, state.repository, state.branch, cfg(env).workflow, commitSha, now);
  try {
    await githubRequest(env, ghPath(state.repository, `/actions/workflows/${cfg(env).workflow.split('/').map(encodeURIComponent).join('/')}/dispatches`), { method: 'POST', body: JSON.stringify({ ref: state.branch, inputs: { expected_sha: commitSha, studio_release_id: id } }) });
    await run(env, 'UPDATE studio_releases SET status = \'running\', stage = \'queued\', updated_at = ?1 WHERE id = ?2', new Date().toISOString(), id);
  } catch (error) {
    await run(env, 'UPDATE studio_releases SET status = \'failed\', stage = \'failed\', error = ?1, updated_at = ?2 WHERE id = ?3', error.message, new Date().toISOString(), id);
  }
  const row = await firstRow(env, 'SELECT * FROM studio_releases WHERE id = ?1', id);
  return { release: await syncRelease(env, row) };
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/$/, '') || '/';
  const identity = requireAuthor(request, env);
  if (request.method !== 'GET') requireCsrf(request);
  if (path === '/__studio/api/docs' && request.method === 'GET') return listDocs(env, identity);
  if (path === '/__studio/api/doc' && request.method === 'GET') return readDoc(env, identity, url.searchParams.get('collection') || '', url.searchParams.get('id') || '');
  if (path === '/__studio/api/doc' && request.method === 'PUT') return saveDoc(env, identity, await readJson(request));
  if (path === '/__studio/api/create' && request.method === 'POST') return createDoc(env, identity, await readJson(request));
  if (path === '/__studio/api/blogs' && request.method === 'POST') {
    const body = await readJson(request);
    return updateDocRef(env, identity, 'pages', 'blogs', String(body.of || ''), body.present !== false);
  }
  if (path === '/__studio/api/link' && request.method === 'POST') {
    const body = await readJson(request);
    return updateDocRef(env, identity, String(body.collection || ''), String(body.id || ''), String(body.of || ''), true, body.pane);
  }
  if (path === '/__studio/api/git' && request.method === 'GET') return gitStatus(env, identity);
  if (path === '/__studio/api/git/commit' && request.method === 'POST') return commitDrafts(env, identity, await readJson(request));
  if (path === '/__studio/api/git/push' && request.method === 'POST') return gitStatus(env, identity);
  if (path === '/__studio/api/git/publish' && request.method === 'POST') return publish(env, identity, await readJson(request));
  if (path === '/__studio/api/tag-groups' && request.method === 'GET') return tagTaxonomy(env, identity);
  if (path === '/__studio/api/tag-groups' && request.method === 'PUT') return saveTags(env, identity, await readJson(request));
  throw Object.assign(new Error('not found'), { status: 404 });
}

function contentType(path) {
  if (path.endsWith('.html')) return 'text/html; charset=utf-8';
  if (path.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (path.endsWith('.css')) return 'text/css; charset=utf-8';
  if (path.endsWith('.svg')) return 'image/svg+xml';
  if (path.endsWith('.woff2')) return 'font/woff2';
  return 'application/octet-stream';
}

export function createHandler(assets = {}) {
  return async function handle(request, env = {}) {
    const url = new URL(request.url);
    try {
      if (url.pathname.startsWith('/__studio/api')) return json(await api(request, env));
      if (url.pathname === '/' || url.pathname === '/studio' || url.pathname === '/studio/') {
        const html = assets['index.html'];
        return html ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } }) : new Response('Not found', { status: 404 });
      }
      const key = url.pathname.replace(/^\//, '') || 'index.html';
      const value = assets[key];
      if (value != null) return new Response(value, { headers: { 'content-type': contentType(key), 'cache-control': key.includes('-') ? 'public, max-age=31536000, immutable' : 'no-store' } });
      return new Response('Not found', { status: 404 });
    } catch (error) {
      const status = Number(error?.status) || 500;
      const body = { error: error instanceof Error ? error.message : '服务器错误' };
      if (error?.conflicts) body.conflicts = error.conflicts;
      if (error?.conflict) body.conflict = error.conflict;
      return json(body, status);
    }
  };
}

export default createHandler();
