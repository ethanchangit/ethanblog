import {
  CORE_PAGE_BY_TITLE,
  isSafeDocRef,
  isSafeId,
  listDocRefs,
  PAGE_CAP,
  PAGE_ORDER_PATH,
  defaultPageOrder,
  pageHref,
  pageOrderSource,
  parsePageOrderSource,
  pageIdFromPath,
  pageReviewNote,
  parseMdx,
  publicHref,
  serializeMdx,
  validateContentFile,
} from '../core.mjs';
import { parseTagGroupsSource } from '../tag-groups-core.mjs';
import { author, login, logout, loopbackRequest, readJson, requireCsrf, boundedText, fail, fetchNoRedirect, hash, withLock } from './auth.mjs';
import { connectionStatus, connect, callback, mcpClient, blogCards, readCard, cardId, cardTimestamps, readPullScan, writePullScan, clearPullScan, readCardPulls, readCardPull, saveCardProperties, saveCardContent } from './heptabase.mjs';
import { blogSchema, readProperties, writeProperties, validatePropertyTags, publicationDate, dateFromCard, collectionForBlogType, urlArticleId } from './card-properties.mjs';
import { references, fromHeptabase, toHeptabase, blogReferences } from './card-content.mjs';
import { prepareWriteback, completeWriteback, verifyReceipt } from './release-sync.mjs';
import { BLOG_INDEX, removalReason, removalReasons, removalScope, linkedPaths, withoutIndexRefs } from './removals.mjs';

const DEFAULT_REPOSITORY = 'ethanchangit/ethanblog';
const DEFAULT_BRANCH = 'main';
const WORKFLOW_PATH = '.github/workflows/deploy.yml';
const BLOG_URL = 'https://ethanchang.io';
const CONTENT_BRANCH = 'codex/studio-content';
const ALLOWED_CONTENT = /^(src\/content\/(articles|projects)\/[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)*\.mdx|src\/content\/pages\/[a-z0-9]+(?:-[a-z0-9]+)*\.mdx|src\/data\/tag-groups\.ts|src\/data\/page-order\.ts)$/;

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

function db(env) {
  if (!env.DB) throw fail('后台存储尚未完成配置。', 503);
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
  const token = String(env.GITHUB_TOKEN || env.GITHUB_TOKEN_BLOG || '');
  if (!token) throw fail('请在 Cloudflare 私密配置中连接 GitHub 仓库。', 503);
  const headers = new Headers(init.headers || {});
  headers.set('accept', 'application/vnd.github+json');
  headers.set('content-type', 'application/json');
  headers.set('x-github-api-version', '2022-11-28');
  headers.set('authorization', `Bearer ${token}`);
  headers.set('user-agent', 'ethanblog-dashboard');
  const response = await fetchNoRedirect(`https://api.github.com${path}`, { ...init, headers, signal: AbortSignal.timeout(20000) });
  const text = await boundedText(response, 4_000_000);
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; }
  if (!response.ok) {
    const detail = data?.message ? `：${data.message}` : '';
    const status = response.status === 409 || response.status === 422 ? 409 : response.status === 404 ? 404 : 502;
    throw Object.assign(new Error(`GitHub 请求失败（${response.status}）${detail}`), { status, githubStatus: response.status });
  }
  return data;
}

async function openPr(env) {
  const { repository, branch } = cfg(env);
  const prs = await githubRequest(env, ghPath(repository, `/pulls?state=open&base=${encodeURIComponent(branch)}&head=${encodeURIComponent(repository.split('/')[0] + ':' + CONTENT_BRANCH)}`));
  return prs[0] || null;
}

async function branchState(env, branchOverride) {
  const { repository, branch } = cfg(env);
  const pr = branchOverride ? null : await openPr(env);
  const readBranch = branchOverride || pr?.head.ref || branch;
  const ref = await githubRequest(env, ghPath(repository, `/git/ref/heads/${readBranch.split('/').map(encodeURIComponent).join('/')}`));
  const commitSha = ref.object.sha;
  const commit = await githubRequest(env, ghPath(repository, `/git/commits/${encodeURIComponent(commitSha)}`));
  const tree = await githubRequest(env, ghPath(repository, `/git/trees/${encodeURIComponent(commit.tree.sha)}?recursive=1`));
  if (tree.truncated) throw fail('GitHub 文件列表不完整，已停止操作。', 502);
  const entries = new Map((tree.tree ?? []).filter((item) => item.type === 'blob').map((item) => [item.path, item]));
  return { repository, branch, readBranch, pr, commitSha, treeSha: commit.tree.sha, entries };
}

async function readBlob(env, state, filePath) {
  const entry = state.entries.get(filePath);
  if (!entry) return null;
  state.blobs ??= new Map();
  if (state.blobs.has(entry.sha)) return state.blobs.get(entry.sha);
  const blob = await githubRequest(env, ghPath(state.repository, `/git/blobs/${encodeURIComponent(entry.sha)}`));
  const raw = base64Decode(blob.content); state.blobs.set(entry.sha, raw); return raw;
}

async function primeBlobs(env, state, paths) {
  state.blobs ??= new Map();
  const missing = paths.filter((p) => state.entries.has(p) && !state.blobs.has(state.entries.get(p).sha));
  const [owner, name] = state.repository.split('/');
  for (let offset = 0; offset < missing.length; offset += 40) {
    const batch = missing.slice(offset, offset + 40);
    const fields = batch.map((p, i) => `f${i}: object(expression:${JSON.stringify(state.commitSha + ':' + p)}) { ... on Blob { text isTruncated } }`).join('\n');
    const result = await githubRequest(env, '/graphql', { method: 'POST', body: JSON.stringify({ query: `query { repository(owner:${JSON.stringify(owner)}, name:${JSON.stringify(name)}) { ${fields} } }` }) });
    if (result.errors?.length) throw fail('GitHub 未能完整读取内容，请稍后重试。', 502);
    batch.forEach((p, i) => {
      const blob = result.data?.repository?.[`f${i}`];
      if (typeof blob?.text !== 'string' || blob.isTruncated) throw fail('GitHub 内容不完整，未继续操作。', 502);
      state.blobs.set(state.entries.get(p).sha, blob.text);
    });
  }
}

function docPath(collection, id) {
  if (!isSafeId(collection, id)) throw Object.assign(new Error(`不合法的文档 id：${collection}/${id}`), { status: 400 });
  if (collection === 'pages') return id === 'blogs' ? 'src/content/pages/blogs.mdx' : `src/content/pages/${id}.mdx`;
  return `src/content/${collection}/${id}.mdx`;
}

function pathDoc(filePath) {
  let match = /^src\/content\/(articles|projects)\/(.+)\.mdx$/.exec(filePath);
  if (match && isSafeId(match[1], match[2])) return { collection: match[1], id: match[2] };
  if (filePath === 'src/content/pages/blogs.mdx') return { collection: 'pages', id: 'blogs' };
  const pageId = pageIdFromPath(filePath);
  if (pageId && isSafeId('pages', pageId)) return { collection: 'pages', id: pageId };
  return null;
}

function contentPath(filePath) {
  return /^src\/content\/(articles|projects)\//.test(filePath) || Boolean(pageIdFromPath(filePath));
}

function summary(collection, id, raw, extra = {}) {
  const data = parseMdx(raw).frontmatter ?? {};
  return {
    collection, id, title: data.title ?? id,
    description: data.description ?? '',
    tags: Array.isArray(data.tags) ? data.tags : [], draft: Boolean(data.draft), listed: data.listed,
    date: data.date ? String(data.date).slice(0, 10) : '',
    slot: data.slot ?? (collection === 'projects' ? 'project' : collection === 'articles' ? 'article' : undefined),
    href: publicHref(collection, id), heptabaseCardLink: data.heptabaseCardLink || '', series: id.includes('/') && !id.endsWith('/cn'),
    serial: typeof data.serial === 'number' ? data.serial : null, language: data.language || null, url: typeof data.url === 'string' ? data.url : null, ...extra,
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
  return withLock(env, `draft:${state.repository}:${filePath}`, async () => {
  const existing = await draftFor(env, identity, filePath);
  if (existing && existing.state === 'draft' && Number(expectedVersion ?? existing.version) !== Number(existing.version)) {
    throw Object.assign(new Error(`草稿版本已变化，请刷新后处理冲突（${filePath}）。`), { status: 409, conflict: { path: filePath, expectedVersion, actualVersion: existing.version } });
  }
  const version = existing && existing.state === 'draft' ? Number(existing.version) + 1 : 1;
  const now = new Date().toISOString();
  const active = existing?.state === 'draft';
  const baseSha = active ? existing.base_commit_sha : baseCommitSha ?? state.commitSha;
  const original = active ? existing.base_raw : baseRaw ?? null;
  if (existing) await run(env, 'INSERT INTO studio_draft_history (path, raw, saved_at) VALUES (?1, ?2, ?3)', filePath, existing.raw, now);
  await run(env, `INSERT INTO studio_drafts
    (user_id, repository, branch, path, raw, base_commit_sha, base_raw, version, state, saved_at, updated_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'draft', ?9, ?9)
    ON CONFLICT(user_id, repository, branch, path) DO UPDATE SET
      raw = excluded.raw, base_commit_sha = excluded.base_commit_sha, base_raw = excluded.base_raw,
      version = excluded.version, state = 'draft', saved_at = excluded.saved_at,
      updated_at = excluded.updated_at`,
    identity.id, state.repository, state.branch, filePath, raw, baseSha, original, version, now);
  return { version, savedAt: now, baseCommitSha: baseSha };
  });
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

async function listDocs(env, identity, state = null) {
  state ??= await branchState(env);
  const paths = [...state.entries.keys()].filter((filePath) => pathDoc(filePath));
  await primeBlobs(env, state, paths);
  const rows = await draftRows(env, identity);
  const drafts = new Map(rows.map((row) => [row.path, row]));
  const articles = [];
  const projects = [];
  const sitePages = [];
  const pushDoc = (item) => {
    if (item.collection === 'articles') articles.push(item);
    else if (item.collection === 'projects') projects.push(item);
    else if (item.collection === 'pages' && item.id !== 'blogs') sitePages.push(item);
  };
  for (const filePath of paths) {
    const target = pathDoc(filePath);
    const remoteRaw = await readBlob(env, state, filePath);
    const draft = drafts.get(filePath);
    if (draft?.raw === '') continue; // An approved removal is not an empty article.
    pushDoc(summary(target.collection, target.id, draft?.raw ?? remoteRaw, draft ? { privateDraft: true, draftSavedAt: draft.saved_at, draftVersion: Number(draft.version) } : {}));
  }
  for (const row of rows) {
    if (row.raw && pathDoc(row.path) && !state.entries.has(row.path)) {
      const target = pathDoc(row.path);
      pushDoc(summary(target.collection, target.id, row.raw, { privateDraft: true, draftSavedAt: row.saved_at, draftVersion: Number(row.version) }));
    }
  }
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  projects.sort((a, b) => a.id.localeCompare(b.id));
  const blogsPath = 'src/content/pages/blogs.mdx';
  const blogs = await effectiveFile(env, identity, state, blogsPath);
  return {
    articles, projects, sitePages,
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

async function gitStatus(env, identity) {
  const state = await branchState(env);
  const rows = await draftRows(env, identity);
  const releaseRow = await firstRow(env, 'SELECT * FROM studio_releases WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 ORDER BY created_at DESC LIMIT 1', identity.id, state.repository, state.branch);
  const release = releaseRow ? await syncRelease(env, releaseRow) : null;
  const lastSubmitted = await firstRow(env, 'SELECT submitted_commit_sha FROM studio_drafts WHERE user_id = ?1 AND repository = ?2 AND branch = ?3 AND state = \'submitted\' AND submitted_commit_sha IS NOT NULL ORDER BY updated_at DESC LIMIT 1', identity.id, state.repository, state.branch);
  return {
    branch: state.branch, commitSha: state.commitSha, files: rows.map((row) => ({ code: row.raw === '' ? 'D' : 'M', path: row.path })), dirty: rows.length > 0,
    removals: (await removalDecisions(env)).filter(plan => rows.some(row => row.path === plan.filePath && row.raw === '')).map(plan => ({ cardLink: `heptabase://card/${plan.id}`, title: plan.graph[0].parsed.frontmatter.title })),
    repository: state.repository, draftCount: rows.length, lastUserCommitSha: state.pr?.head.sha || lastSubmitted?.submitted_commit_sha || null, release,
    pullRequest: state.pr ? { number: state.pr.number, url: state.pr.html_url, sha: state.pr.head.sha } : null,
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
  if (row?.status === 'succeeded') return { ...releaseView(row), heptabase: await completeWriteback(env, row.id) };
  if (!row || !['queued', 'running'].includes(row.status)) return releaseView(row);
  let next = row;
  try {
    if (row.stage === 'merging') {
      const pr = await githubRequest(env, ghPath(row.repository, `/pulls/${row.pr_number}`));
      if (!pr.merged) return releaseView(row);
      await run(env, "UPDATE studio_releases SET commit_sha = ?1, stage = 'queued' WHERE id = ?2", pr.merge_commit_sha, row.id);
      row = { ...row, commit_sha: pr.merge_commit_sha, stage: 'queued' };
      next = row;
    }
    if (!row.workflow_run_id) {
      const workflow = row.workflow_path.split('/').pop();
      const runs = await githubRequest(env, ghPath(row.repository, `/actions/workflows/${encodeURIComponent(workflow)}/runs?event=push&head_sha=${encodeURIComponent(row.commit_sha)}&per_page=20`));
      const match = (runs.workflow_runs ?? []).find((runInfo) => runInfo.head_sha === row.commit_sha);
      if (match) {
        await run(env, 'UPDATE studio_releases SET workflow_run_id = ?1, updated_at = ?2 WHERE id = ?3', String(match.id), new Date().toISOString(), row.id);
        next = { ...row, workflow_run_id: String(match.id), updated_at: new Date().toISOString() };
      }
    }
    if (next.workflow_run_id) {
      const runInfo = await githubRequest(env, ghPath(row.repository, `/actions/runs/${encodeURIComponent(next.workflow_run_id)}`));
      let status = runInfo.conclusion === 'success' ? 'running' : runInfo.conclusion ? 'failed' : 'running';
      let stage = status === 'failed' ? 'failed' : runInfo.conclusion === 'success' ? 'verifying' : 'building';
      if (runInfo.head_sha !== row.commit_sha) throw fail('发布记录与 GitHub 版本不一致。', 409);
      if (stage === 'verifying') {
        const response = await fetch(`${BLOG_URL}/__studio-release.json?check=${Date.now()}`, { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } });
        if (response.ok && JSON.parse(await boundedText(response)).commitSha === row.commit_sha) { status = 'succeeded'; stage = 'deployed'; }
      }
      const error = status === 'failed' ? `GitHub Actions 结论：${runInfo.conclusion}` : null;
      const updatedAt = new Date().toISOString();
      await run(env, 'UPDATE studio_releases SET status = ?1, stage = ?2, error = ?3, url = ?4, updated_at = ?5 WHERE id = ?6', status, stage, error, status === 'succeeded' ? BLOG_URL : null, updatedAt, row.id);
      next = { ...next, status, stage, error, url: status === 'succeeded' ? BLOG_URL : null, updated_at: updatedAt };
    }
  } catch (error) {
    // A temporarily unavailable Actions listing must not turn a known release into a false failure.
    if (error?.status === 404) return releaseView(row);
  }
  return { ...releaseView(next), ...(next.status === 'succeeded' ? { heptabase: await completeWriteback(env, next.id) } : {}) };
}

async function commitDrafts(env, identity, input) {
  return withLock(env, 'publication', async (lease) => {
  if (await firstRow(env, "SELECT card_id FROM studio_review_decisions WHERE status = 'pending' LIMIT 1")) throw fail('还有审核属性尚未回写完成，请先重试该操作。', 409);
  const message = String(input.message || '').trim();
  if (!message || message.startsWith('-')) throw fail('请填写本次更新说明。');
  const rows = await draftRows(env, identity);
  if (!rows.length) throw Object.assign(new Error('没有可提交的私人草稿。'), { status: 400 });
  const state = await branchState(env);
  await primeBlobs(env, state, [...state.entries.keys()].filter((p) => pathDoc(p)));
  const main = await branchState(env, state.branch), published = await contentFiles(env, main);
  const proposed = await contentFiles(env, state, rows);
  const removed = [...published.keys()].filter(path => !proposed.has(path));
  if (removed.length && published.has(BLOG_INDEX)) {
    const previousRemovals = [...published.keys()].filter(path => !state.entries.has(path));
    const currentIndex = await readBlob(env, state, BLOG_INDEX);
    if (currentIndex !== withoutIndexRefs(published.get(BLOG_INDEX), previousRemovals)) throw fail('GitHub 目录还有其他修改，未覆盖。请先审查这些修改后再提交删除。', 409);
    const index = withoutIndexRefs(published.get(BLOG_INDEX), removed);
    if (index !== currentIndex) rows.push({ path: BLOG_INDEX, raw: index, base_raw: currentIndex, base_commit_sha: state.commitSha });
  }
  for (const row of rows) {
    if (!ALLOWED_CONTENT.test(row.path)) throw Object.assign(new Error(`拒绝提交未授权路径：${row.path}`), { status: 400 });
    try {
      if (row.raw && row.path.endsWith('.mdx')) validateContentFile(row.path, row.raw);
      if (row.path === 'src/data/tag-groups.ts') parseTagGroupsSource(row.raw);
      if (row.path === PAGE_ORDER_PATH) parsePageOrderSource(row.raw);
    } catch (error) { throw fail(error.message); }
  }
  const linked = new Map();
  await primeBlobs(env, state, [...state.entries.keys()].filter((p) => pathDoc(p)));
  for (const [filePath] of state.entries) {
    if (!contentPath(filePath) || rows.some((r) => r.path === filePath)) continue;
    const link = parseMdx(await readBlob(env, state, filePath)).frontmatter.heptabaseCardLink;
    if (link) linked.set(cardId(link), filePath);
  }
  for (const row of rows.filter((r) => r.raw && contentPath(r.path))) {
    const id = cardId(parseMdx(row.raw).frontmatter.heptabaseCardLink);
    if (linked.has(id) && linked.get(id) !== row.path) throw fail(`一张 Heptabase 卡片只能对应一篇文章：${linked.get(id)}`);
    linked.set(id, row.path);
  }
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
  assertPublicPageCount(proposed);
  await assertReviewed(env, state, rows);
  const treeEntries = [];
  for (const row of rows) {
    await lease();
    if (row.raw === '') { if (state.entries.has(row.path)) treeEntries.push({ path: row.path, mode: '100644', type: 'blob', sha: null }); continue; }
    const blob = await githubRequest(env, ghPath(state.repository, '/git/blobs'), { method: 'POST', body: JSON.stringify({ content: base64Encode(row.raw), encoding: 'base64' }) });
    treeEntries.push({ path: row.path, mode: '100644', type: 'blob', sha: blob.sha });
  }
  const tree = await githubRequest(env, ghPath(state.repository, '/git/trees'), { method: 'POST', body: JSON.stringify({ base_tree: state.treeSha, tree: treeEntries }) });
  let commit = { sha: state.commitSha };
  if (!state.pr && tree.sha === state.treeSha) {
    for (const row of rows.filter(row => row.version)) await run(env, "UPDATE studio_drafts SET state = 'submitted', submitted_commit_sha = ?1 WHERE user_id = ?2 AND repository = ?3 AND branch = ?4 AND path = ?5 AND version = ?6", state.commitSha, identity.id, state.repository, state.branch, row.path, row.version);
    return { ...await gitStatus(env, identity), unchanged: true };
  }
  let recovered = false;
  if (!state.pr) {
    try {
      const orphan = await branchState(env, CONTENT_BRANCH);
      const details = await githubRequest(env, ghPath(state.repository, `/git/commits/${orphan.commitSha}`));
      if (orphan.treeSha === tree.sha && details.parents?.[0]?.sha === state.commitSha) { commit = { sha: orphan.commitSha }; recovered = true; }
    } catch (error) { if (error.githubStatus !== 404) throw error; }
  }
  if (!recovered && tree.sha !== state.treeSha) commit = await githubRequest(env, ghPath(state.repository, '/git/commits'), { method: 'POST', body: JSON.stringify({ message, tree: tree.sha, parents: [state.commitSha] }) });
  try {
    const refPath = ghPath(state.repository, `/git/refs/heads/${CONTENT_BRANCH}`);
    if (state.pr) await githubRequest(env, refPath, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
    else {
      try { await githubRequest(env, ghPath(state.repository, '/git/refs'), { method: 'POST', body: JSON.stringify({ ref: `refs/heads/${CONTENT_BRANCH}`, sha: commit.sha }) }); }
      catch (error) {
        if (error.githubStatus !== 422) throw error;
        // A previously merged content branch may be advanced, never force-reset.
        await githubRequest(env, refPath, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
      }
    }
  } catch (error) {
    if (error?.githubStatus === 409 || error?.githubStatus === 422) throw fail('GitHub 上还有未完成的内容更新，请检查并恢复原发布请求。编辑内容仍保留。', 409);
    throw error;
  }
  const pr = state.pr || await openPr(env) || await githubRequest(env, ghPath(state.repository, '/pulls'), { method: 'POST', body: JSON.stringify({ title: message, body: '从 Studio 提交的博客内容更新。检查通过后在后台确认发布。', head: CONTENT_BRANCH, base: state.branch }) });
  const now = new Date().toISOString();
  for (const row of rows.filter(row => row.version)) await run(env, 'UPDATE studio_drafts SET state = \'submitted\', submitted_commit_sha = ?1, updated_at = ?2 WHERE user_id = ?3 AND repository = ?4 AND branch = ?5 AND path = ?6 AND version = ?7', commit.sha, now, identity.id, state.repository, state.branch, row.path, row.version);
  return { ...await gitStatus(env, identity), commitSha: commit.sha, submitted: rows.map((row) => row.path), pullRequest: { number: pr.number, url: pr.html_url, sha: commit.sha } };
  });
}

async function publish(env, identity, input) {
  return withLock(env, 'publication', async (lease) => {
  const commitSha = String(input.commitSha || '');
  const id = await hash(`${cfg(env).repository}:${commitSha}`);
  const existing = await firstRow(env, 'SELECT * FROM studio_releases WHERE id = ?1', id);
  const state = await branchState(env);
  if (!state.pr && existing) return { release: await syncRelease(env, existing) };
  if (!state.pr || !commitSha || commitSha !== state.commitSha) throw fail('发布请求已变化，请刷新并重新确认。', 409);
  if ((await draftRows(env, identity)).length) throw fail('还有未提交的编辑，请先提交到 GitHub。', 409);
  const main = await branchState(env, cfg(env).branch);
  if (input.baseSha !== main.commitSha) throw fail('线上来源已变化，请重新查看发布清单。', 409);
  const reviewed = await review(env);
  if (!reviewed.changes.length) throw fail('这批更新已撤销，没有需要发布的页面。', 409);
  if (reviewed.commitSha !== commitSha || reviewed.baseSha !== input.baseSha) throw fail('发布清单已变化，请重新确认。', 409);
  const workflow = cfg(env).workflow.split('/').pop();
  const checks = await githubRequest(env, ghPath(state.repository, `/actions/workflows/${encodeURIComponent(workflow)}/runs?event=pull_request&head_sha=${commitSha}&per_page=20`));
  const required = checks.workflow_runs?.filter((r) => r.head_sha === commitSha && r.event === 'pull_request').sort((a, b) => b.run_number - a.run_number)[0];
  if (!required || required.status !== 'completed' || required.conclusion !== 'success') throw fail('请等待本次 GitHub 检查通过后发布。', 409);
  if (!required.pull_requests?.some((p) => p.number === state.pr.number && p.base.sha === main.commitSha)) throw fail('主版本已更新，请在 GitHub 更新分支并重新检查。', 409);
  const reviewedRows = [];
  for (const change of reviewed.changes) reviewedRows.push({ path: change.path, raw: await readBlob(env, state, change.path) });
  assertPublicPageCount(await contentFiles(env, state));
  await assertReviewed(env, state, reviewedRows);
  await lease();
  const now = new Date().toISOString();
  await run(env, "INSERT OR IGNORE INTO studio_releases (id, user_id, repository, branch, workflow_path, commit_sha, pr_number, status, stage, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'queued', 'merging', ?8, ?8)", id, identity.id, state.repository, state.branch, cfg(env).workflow, commitSha, state.pr.number, now);
  const cards = [];
  for (const change of reviewed.changes) {
    if (!/^src\/content\/(articles|projects)\//.test(change.path) || change.kind === 'removed') continue;
    const parsed = parseMdx(await readBlob(env, state, change.path));
    if (!parsed.frontmatter.draft && parsed.frontmatter.heptabaseCardLink) cards.push(cardId(parsed.frontmatter.heptabaseCardLink));
  }
  await prepareWriteback(env, id, cards);
  await lease();
  const merged = await githubRequest(env, ghPath(state.repository, `/pulls/${state.pr.number}/merge`), { method: 'PUT', body: JSON.stringify({ sha: commitSha, merge_method: 'merge' }) });
  if (!merged.merged) throw fail('GitHub 尚未完成合并，请查看发布请求。', 409);
  await run(env, "UPDATE studio_releases SET commit_sha = ?1, stage = 'queued', updated_at = ?2 WHERE id = ?3", merged.sha, now, id);
  const row = await firstRow(env, 'SELECT * FROM studio_releases WHERE id = ?1', id);
  return { release: await syncRelease(env, row) };
  });
}

async function review(env) {
  const state = await branchState(env);
  if (!state.pr) throw fail('请先提交内容更新。');
  const main = await branchState(env, cfg(env).branch);
  const files = [];
  for (let page = 1; page <= 30; page++) {
    const batch = await githubRequest(env, ghPath(state.repository, `/pulls/${state.pr.number}/files?per_page=100&page=${page}`));
    files.push(...batch);
    if (batch.length < 100) break;
    if (page === 30) throw fail('改动过多，请在 GitHub 查看并拆分。');
  }
  if (files.some((f) => !ALLOWED_CONTENT.test(f.filename))) throw fail('本次请求含有网站程序改动，请在 GitHub 审查。');
  return { pullRequest: { number: state.pr.number, url: state.pr.html_url }, commitSha: state.commitSha, baseSha: main.commitSha,
    changes: files.map((f) => ({ path: f.filename, kind: f.status, patch: f.patch || '请在 GitHub 查看完整变化。' })) };
}

const PAGE_CHOICE_ID = 'page-cap';

function publicPageCount(files) {
  let count = 0;
  for (const [path, raw] of files) {
    if (!pageIdFromPath(path) || !raw || parseMdx(raw).frontmatter.draft) continue;
    count += 1;
  }
  return count;
}

function pageFileFor(published, card) {
  for (const [filePath, raw] of published) {
    if (!pageIdFromPath(filePath) || !raw) continue;
    const frontmatter = parseMdx(raw).frontmatter;
    if (frontmatter.draft) continue;
    if (String(frontmatter.heptabaseCardLink || '').toLowerCase() === card.cardLink) return filePath;
  }
  return null;
}

async function loadPageCards(client, schema, cards, published) {
  const pages = [];
  for (const card of cards) {
    if (card.type !== 'card') continue;
    const properties = await readProperties(client, card.id, schema);
    if (!properties.member || properties.type !== 'page') continue;
    const path = pageFileFor(published, card);
    const pageId = path ? pageIdFromPath(path) : null;
    pages.push({
      id: card.id, title: card.title, cardLink: card.cardLink, onSite: Boolean(path), path, pageId,
      href: pageId ? pageHref(pageId) : null,
    });
  }
  pages.sort((a, b) => a.title.localeCompare(b.title, 'zh') || a.id.localeCompare(b.id));
  return pages;
}

async function storedPageChoice(env) {
  const row = await firstRow(env, "SELECT payload FROM studio_review_decisions WHERE card_id = ?1 AND decision = 'page-cap'", PAGE_CHOICE_ID);
  if (!row) return null;
  try {
    const payload = JSON.parse(row.payload);
    if (!Array.isArray(payload.seen) || !Array.isArray(payload.keep) || !Array.isArray(payload.order)) return null;
    return payload;
  } catch { return null; }
}

function choiceMatches(choice, pages) {
  if (!choice) return false;
  const seen = pages.map(page => page.id).sort();
  const stored = [...choice.seen].sort();
  const keep = [...new Set(choice.keep)];
  const order = choice.order;
  const sameOrder = order.length === keep.length && new Set(order).size === order.length && order.every(id => keep.includes(id));
  return seen.join() === stored.join() && keep.length === choice.keep.length && keep.length <= PAGE_CAP && keep.every(id => seen.includes(id)) && sameOrder;
}

async function publishedFiles(env, state) {
  const main = state.pr ? await branchState(env, cfg(env).branch) : state;
  return contentFiles(env, main);
}

async function assertKeptPage(env, identity, id) {
  const client = await mcpClient(env);
  const { cards, tagId } = await blogCards(client);
  const schema = await blogSchema(client, tagId);
  const pages = await loadPageCards(client, schema, cards, await publishedFiles(env, await branchState(env)));
  if (pages.length <= PAGE_CAP) return;
  const choice = await storedPageChoice(env);
  if (!choiceMatches(choice, pages)) throw fail(`站点页面最多显示 ${PAGE_CAP} 页。现在有 ${pages.length} 张 Page 卡片，请先在审核清单里选择留下哪几页。`, 409);
  if (!choice.keep.includes(id)) throw fail('这张页面不在你选择留下的页面里。要发布它，请先改选择。', 409);
  const rows = await draftRows(env, identity);
  for (const page of pages) {
    if (choice.keep.includes(page.id) || !page.onSite) continue;
    if (!rows.some(row => row.path === page.path && row.raw === '')) throw fail(`「${page.title}」已在网站上，但不在留下的 ${PAGE_CAP} 页里。请先确认选择，让它进入待删除。`, 409);
  }
}

function assertPublicPageCount(files) {
  const count = publicPageCount(files);
  if (count > PAGE_CAP) throw fail(`站点页面最多显示 ${PAGE_CAP} 页。这一版会留下 ${count} 页。请先选择留下哪几页；多出来的页面不会被悄悄去掉。`, 409);
}

function assignPageId(title, card, docs, targets) {
  const canonicalTitle = String(title || '').trim();
  const canonical = CORE_PAGE_BY_TITLE.get(canonicalTitle);
  const taken = (pageId) => {
    const occupant = docs.find((doc) => doc.collection === 'pages' && doc.id === pageId);
    const link = occupant?.heptabaseCardLink?.toLowerCase();
    if (link && link !== `heptabase://card/${card}`) return true;
    for (const [otherId, target] of targets) if (otherId !== card && target.collection === 'pages' && target.id === pageId) return true;
    return false;
  };
  if (canonical && !taken(canonical)) return { id: canonical, displaced: false, canonicalTitle };
  return { id: `hepta-${card}`, displaced: Boolean(canonical), canonicalTitle };
}

function typeRouteMessage(type) {
  if (type === 'project') return '这张卡片的 Blog Type 是 Project，对应项目页面。';
  if (type === 'page') return '这张卡片的 Blog Type 是 Page，对应站点页面。';
  if (type === 'reference') return '这张卡片的 Blog Type 是 Reference，有自己的页面，不进文章列表。';
  if (type === 'article') return '这张卡片的 Blog Type 是 Article，对应文章列表。';
  return '请在 Heptabase 为这张卡片选择 Blog Type（Article、Project、Page 或 Reference）。';
}

function blogBody(parsed) { return `# ${parsed.frontmatter.title}\n\n${parsed.bodyZh.trim()}`; }
function blogProjection(parsed) { return JSON.stringify({ body: blogBody(parsed), draft: Boolean(parsed.frontmatter.draft), status: parsed.frontmatter.heptabaseStatus, date: parsed.frontmatter.date, tags: parsed.frontmatter.tags || [] }); }

const sourceDigest = (source, properties, stamps) => hash(JSON.stringify([source, properties, stamps?.created || '', stamps?.updated || '']));

// Check every reachable page, even if it is unchanged in this particular PR.
// No card bytes are sent to GitHub before this check succeeds.
async function assertReviewed(env, state, rows) {
  await assertRemovals(env, state, rows);
  const client = await mcpClient(env);
  const { tagId } = await blogCards(client), schema = await blogSchema(client, tagId);
  const pending = rows.filter(row => row.raw && row.path !== BLOG_INDEX && row.path !== PAGE_ORDER_PATH), seen = new Set(), changes = new Map(rows.map(r => [r.path, r.raw]));
  while (pending.length) {
    const row = pending.shift(); if (seen.has(row.path)) continue; seen.add(row.path);
    if (seen.size > 200) throw fail('发布范围超过 200 张卡片，请拆分审查。');
    if (!pathDoc(row.path) || (row.path.includes('/pages/') && !pageIdFromPath(row.path))) throw fail('后台仅发布从 Heptabase 审查过的文章。');
    if (!row.raw) throw fail('引用资料尚未完整拉取，请重新审查。', 409);
    const parsed = parseMdx(row.raw), id = cardId(parsed.frontmatter.heptabaseCardLink);
    if (parsed.frontmatter.draft) throw fail('待发布清单中仍有草稿，请先选择“准备发布这一版”并审查。', 409);
    const approved = await firstRow(env, 'SELECT * FROM studio_reviews WHERE path = ?1', row.path);
    if (!approved || approved.card_id !== id || approved.raw_hash !== await hash(row.raw)) throw fail('内容未通过隐私审查，或审查后已有变化，请重新拉取并确认。', 409);
    let source, properties;
    try { source = await readCard(client, id); properties = await readProperties(client, id, schema); }
    catch (error) {
      if (error.heptabaseReason === 'objectNotFound') throw fail('这篇文章的卡片已经删除。请重新拉取并撤下，不要把已删除的文章发回网站。', 409);
      throw error;
    }
    const stamps = (await cardTimestamps(client, [id])).get(id);
    if (!properties.member) throw fail('卡片已移出 #blog，请重新拉取并审查删除，不能继续发布旧副本。', 409);
    if (approved.source_hash !== await sourceDigest(source, properties, stamps)) throw fail('Heptabase 内容、属性或引用关系已变化，请重新拉取并审查。', 409);
    const copied = dateFromCard({ publishDate: properties.date, created: stamps.created, timezone: env.STUDIO_TIMEZONE });
    const expectedDay = copied.date || publicationDate(new Date(), env.STUDIO_TIMEZONE);
    if (properties.member && String(parsed.frontmatter.date || '').slice(0, 10) !== expectedDay) throw fail(copied.invented ? '首次发布日期已跨天，请重新拉取审查，让网站与 Heptabase 日期一致。' : '网站日期与卡片上的发布日期或创建时间不一致，请重新拉取。', 409);
    for (const ref of blogReferences(parsed.bodyZh)) {
      if (!isSafeDocRef(ref)) throw fail('引用路径不合法。');
      const path = `src/content/${ref}.mdx`;
      pending.push({ path, raw: changes.has(path) ? changes.get(path) : await readBlob(env, state, path) });
    }
  }
}

const PROPERTY_BATCH = 20;

async function heptabaseCards(env, identity) {
  const client = await mcpClient(env);
  const { cards, tagId } = await blogCards(client);
  const schema = await blogSchema(client, tagId);
  // One Worker request stays under the free-plan subrequest limit. Reading every
  // card in the same request is what turned a full #blog pull into an HTML 502.
  const batched = cards.length > PROPERTY_BATCH;
  const signature = cards.map((card) => card.id).join('\n');
  let scan = batched ? await readPullScan(env, identity.sessionId) : null;
  if (!scan || scan.signature !== signature) scan = { signature, props: {}, cursor: 0 };
  const started = scan.cursor;
  const pulls = await readCardPulls(env);
  const budget = batched ? PROPERTY_BATCH : Number.POSITIVE_INFINITY;
  let fetches = 0;
  // The list above already carries each card's edited time. Unchanged cards reuse
  // the last successful pull. Only a new or changed edited time spends a subrequest,
  // and those reads stay inside the same batch that avoids the 50-subrequest 502.
  while (scan.cursor < cards.length && fetches < budget) {
    const card = cards[scan.cursor];
    if (card.type !== 'card') { scan.props[card.id] = null; scan.cursor++; continue; }
    const cached = pulls.get(card.id);
    if (card.updated && cached?.edited_at === card.updated && currentShape(cached.properties)) {
      scan.props[card.id] = cached.properties;
      scan.cursor++;
      continue;
    }
    try {
      const properties = await readProperties(client, card.id, schema);
      scan.props[card.id] = properties;
      await saveCardProperties(env, card.id, card.updated, card.created, properties);
    } catch (error) {
      if (error.heptabaseReason !== 'objectNotFound') throw error;
      scan.props[card.id] = null;
    }
    scan.cursor++;
    fetches++;
  }
  if (batched && (scan.cursor < cards.length || scan.cursor > started)) {
    await writePullScan(env, identity.sessionId, scan);
    return { partial: true, scanned: scan.cursor, total: cards.length };
  }
  if (batched) await clearPullScan(env, identity.sessionId);
  const state = await branchState(env), docs = await listDocs(env, identity, state);
  const entries = [...docs.articles, ...docs.projects, ...docs.sitePages];
  const result = [], pageCandidates = [];
  for (const card of cards) {
    const linked = entries.filter((doc) => doc.heptabaseCardLink?.toLowerCase() === card.cardLink);
    const properties = scan.props[card.id] || null;
    if (!properties) continue;
    if (properties.member && properties.type === 'page') pageCandidates.push(card);
    if (properties.status !== 'review') continue;
    result.push({ ...card, properties, linked: linked.map(({ collection, id, title, draft }) => ({ collection, id, title, draft })), unsupported: card.type !== 'card' });
  }
  const main = state.pr ? await branchState(env, cfg(env).branch) : state;
  const published = await contentFiles(env, main);
  const files = new Map(published), rows = await draftRows(env, identity), removals = [];
  for (const [path, raw] of await contentFiles(env, state, rows)) files.set(path, raw);
  for (const plan of await removalDecisions(env)) if (rows.some(row => row.path === plan.filePath && row.raw === '')) files.set(plan.filePath, plan.graph[0].current.raw);
  const blogIds = new Set(cards.map(card => card.id)), candidates = [];
  for (const [path, raw] of files) {
    const p = parseMdx(raw).frontmatter;
    if (path === BLOG_INDEX || p.draft || !p.heptabaseCardLink) continue;
    const id = cardId(p.heptabaseCardLink), reason = await removalReason(client, id, schema, blogIds);
    if (reason) candidates.push({ path, title: p.title, cardLink: p.heptabaseCardLink, reason, listed: p.listed });
  }
  // A listed:false page already inside a main article's removal is withdrawn with that article.
  // Listing it again duplicates the same page in Deleted articles.
  const covered = new Set();
  for (const item of candidates) {
    if (item.listed === false) continue;
    for (const child of removalScope(files, item.path).paths) if (child !== item.path) covered.add(child);
  }
  for (const item of candidates) {
    if (covered.has(item.path)) continue;
    removals.push({ ...pathDoc(item.path), cardLink: item.cardLink, title: item.title, reason: item.reason, reasonLabel: removalReasons[item.reason] });
  }
  const pages = pageCandidates.map(card => {
    const path = pageFileFor(published, card);
    const pageId = path ? pageIdFromPath(path) : null;
    return { id: card.id, title: card.title, cardLink: card.cardLink, onSite: Boolean(path), path, pageId, href: pageId ? pageHref(pageId) : null };
  }).sort((a, b) => a.title.localeCompare(b.title, 'zh') || a.id.localeCompare(b.id));
  const stored = await storedPageChoice(env);
  const matched = choiceMatches(stored, pages);
  const pageSet = {
    cap: PAGE_CAP,
    choiceRequired: pages.length > PAGE_CAP,
    cards: pages,
    order: matched ? stored.order : (pages.length <= PAGE_CAP ? defaultPageOrder(pages) : []),
    choice: matched ? { keep: stored.keep, order: stored.order } : null,
  };
  if (pageSet.choice) {
    for (const plan of await removalDecisions(env)) {
      if (plan.reason !== 'capped' || pageSet.choice.keep.includes(plan.id)) continue;
      const cardLink = `heptabase://card/${plan.id}`;
      if (removals.some(item => item.cardLink === cardLink)) continue;
      removals.push({ ...pathDoc(plan.filePath), cardLink, title: plan.graph[0].parsed.frontmatter.title, reason: 'capped', reasonLabel: removalReasons.capped });
    }
  }
  return { cards: result, removals, pageSet, tagOptions: schema.tags.options.map((o) => o.name) };
}

async function contentFiles(env, state, rows = []) {
  const paths = [...state.entries.keys()].filter(path => pathDoc(path));
  await primeBlobs(env, state, paths);
  const files = new Map();
  for (const path of paths) files.set(path, await readBlob(env, state, path));
  for (const row of rows) { if (row.raw) files.set(row.path, row.raw); else files.delete(row.path); }
  return files;
}

async function removalDecisions(env) {
  return (await allRows(env, "SELECT payload FROM studio_review_decisions WHERE decision = 'remove' AND status = 'complete'")).map(row => JSON.parse(row.payload));
}

async function removalPlan(env, identity, input, forcedReason = null) {
  const path = docPath(input.collection, input.id), id = cardId(input.cardLink);
  const state = await branchState(env), rows = await draftRows(env, identity);
  const main = state.pr ? await branchState(env, cfg(env).branch) : state, publishedRaw = await readBlob(env, main, path);
  const saved = (await removalDecisions(env)).find(plan => plan.id === id);
  const files = await contentFiles(env, state, rows);
  const original = files.get(path) || publishedRaw || (rows.some(row => row.path === path && row.raw === '') ? saved?.graph[0].current.raw : null);
  const parsed = parseMdx(original);
  const sitePage = input.collection === 'pages' && input.id !== 'blogs' && isSafeId('pages', input.id);
  if (!original || parsed.frontmatter.draft || parsed.frontmatter.heptabaseCardLink !== input.cardLink || (input.collection === 'pages' && !sitePage)) throw fail('只能撤下已关联的公开或待发布主文章，请重新拉取。', 409);
  const client = await mcpClient(env), { cards, tagId } = await blogCards(client), schema = await blogSchema(client, tagId);
  const live = await removalReason(client, id, schema, new Set(cards.map(c => c.id)));
  const reason = live || (forcedReason === 'capped' || saved?.reason === 'capped' ? 'capped' : null);
  if (!reason) throw fail('卡片已恢复到 #blog，未继续删除。请取消待删除并重新拉取。', 409);
  if (reason === 'capped') {
    const pages = await loadPageCards(client, schema, cards, await contentFiles(env, main));
    const choice = await storedPageChoice(env);
    if (!choiceMatches(choice, pages) || choice.keep.includes(id)) throw fail('站点页面选择已变化，请重新选择留下哪几页。', 409);
  }
  if (saved && saved.reason === reason && saved.graph[0].publishedRaw === publishedRaw && (rows.some(row => row.path === path && row.raw === '') || !state.entries.has(path))) return { ...saved, approved: true };
  if (!files.has(path)) throw fail('已有待删除操作，请先取消后重新拉取。', 409);
  const scope = removalScope(files, path), graph = [];
  if (scope.paths.length > 200) throw fail('关联删除超过 200 个页面，请拆分审查。');
  const published = await contentFiles(env, main);
  for (const filePath of scope.paths) {
    const current = await effectiveFile(env, identity, state, filePath), parsed = parseMdx(current.raw);
    graph.push({ id: cardId(parsed.frontmatter.heptabaseCardLink), path: filePath, parsed, current, publishedRaw: published.get(filePath) || null, next: '', remove: true });
  }
  const plan = { id, filePath: path, reason, reasonLabel: removalReasons[reason], graph, blockers: scope.blockers, keptReferences: scope.keptReferences,
    state: { repository: state.repository, branch: state.branch, commitSha: state.commitSha } };
  plan.sourceHash = await hash(JSON.stringify([id, reason]));
  plan.documentHash = await hash(JSON.stringify(graph.map(n => [n.path, n.current.raw, n.current.remoteRaw, n.publishedRaw])));
  plan.planHash = await hash(JSON.stringify([plan.sourceHash, plan.documentHash, scope]));
  return plan;
}

function removalView(plan) {
  return { ...plan, graph: undefined, state: undefined, changes: plan.graph.map((node, i) => ({ id: node.id, path: node.path, cardLink: node.parsed.frontmatter.heptabaseCardLink, title: node.parsed.frontmatter.title,
    mainArticle: i === 0, previouslyPublished: true, kind: '删除', beforeContent: node.parsed.bodyZh, afterContent: '', beforeProperties: node.parsed.frontmatter, afterProperties: {} })) };
}

async function decideRemoval(env, identity, input) {
  return withLock(env, 'publication', async lease => {
    const plan = await removalPlan(env, identity, input); samePlan(input, plan);
    if (input.confirmDelete !== true) throw fail('请明确确认从网站删除这些页面。', 409);
    if (plan.blockers.length) throw fail(`仍被其他文章引用：${plan.blockers.map(b => b.title).join('、')}。请先在 Heptabase 移除引用并审核更新，或先撤下引用它的文章。`, 409);
    if (plan.approved) return { removed: plan.graph.length };
    if (await firstRow(env, "SELECT card_id FROM studio_review_decisions WHERE status = 'pending' LIMIT 1")) throw fail('还有未完成的审核回写，请先重试。', 409);
    const completion = db(env).prepare("INSERT INTO studio_review_decisions (card_id, decision, status, payload, created_at) VALUES (?1, 'remove', 'complete', ?2, ?3) ON CONFLICT(card_id) DO UPDATE SET decision = 'remove', status = 'complete', payload = excluded.payload, created_at = excluded.created_at").bind(plan.id, JSON.stringify(plan), new Date().toISOString());
    await savePlan(env, identity, plan, lease, completion);
    return { removed: plan.graph.length };
  });
}

async function cancelRemoval(env, identity, input) {
  return withLock(env, 'publication', async lease => {
    const id = cardId(input.cardLink), plan = (await removalDecisions(env)).find(p => p.id === id);
    if (!plan) throw fail('没有待取消的删除。', 409);
    const rows = await draftRows(env, identity);
    if (!plan.graph.every(n => rows.some(row => row.path === n.path && row.raw === ''))) throw fail('删除已提交 GitHub，请先在 GitHub 恢复，不能在这里覆盖已提交版本。', 409);
    const statements = [];
    for (const node of plan.graph) {
      const previous = node.current.draft;
      if (previous?.state === 'draft') statements.push(db(env).prepare("UPDATE studio_drafts SET raw = ?1, base_raw = ?2, base_commit_sha = ?3, version = version + 1 WHERE path = ?4 AND state = 'draft'").bind(previous.raw, previous.base_raw, previous.base_commit_sha, node.path));
      else statements.push(db(env).prepare("DELETE FROM studio_drafts WHERE path = ?1 AND state = 'draft'").bind(node.path));
    }
    statements.push(db(env).prepare("DELETE FROM studio_review_decisions WHERE card_id = ?1 AND decision = 'remove'").bind(id));
    await lease(); await db(env).batch(statements); return { cancelled: true };
  });
}

async function assertRemovals(env, state, rows) {
  const main = await branchState(env, state.branch), published = await contentFiles(env, main), proposed = await contentFiles(env, state, rows);
  const removed = [...published.keys()].filter(path => !proposed.has(path));
  if (!removed.length && !rows.some(row => !row.raw || row.path === BLOG_INDEX)) return;
  if (removed.includes(BLOG_INDEX)) throw fail('不能删除博客目录。', 409);
  const plans = await removalDecisions(env), checked = new Set();
  const client = await mcpClient(env), { cards, tagId } = await blogCards(client), schema = await blogSchema(client, tagId), blogIds = new Set(cards.map(c => c.id));
  for (const path of new Set([...removed, ...rows.filter(row => !row.raw).map(row => row.path)])) {
    const plan = plans.find(p => p.graph.some(n => n.path === path));
    const node = plan?.graph.find(n => n.path === path);
    if (!node || node.publishedRaw !== (published.get(path) || null)) throw fail('删除尚未审核，或 GitHub 文章已有变化，请重新拉取。', 409);
    if (proposed.has(plan.filePath)) throw fail('不能单独删除仍在发布的文章所用资料。', 409);
    if (!checked.has(plan.id)) {
      const live = await removalReason(client, plan.id, schema, blogIds);
      if (plan.reason === 'capped') {
        const pages = await loadPageCards(client, schema, cards, published);
        const choice = await storedPageChoice(env);
        if (live || pages.length <= PAGE_CAP || !choiceMatches(choice, pages) || choice.keep.includes(plan.id)) throw fail('站点页面选择已变化，请取消待删除并重新选择留下哪几页。', 409);
      } else if (live !== plan.reason) throw fail('卡片已恢复或移除原因变化，请取消待删除并重新拉取。', 409);
      checked.add(plan.id);
    }
    if (node.id !== plan.id && blogIds.has(node.id)) throw fail('引用资料已成为 #blog 主文章，未继续删除。请取消待删除并重新拉取。', 409);
  }
  const expectedIndex = published.has(BLOG_INDEX) ? withoutIndexRefs(published.get(BLOG_INDEX), removed) : undefined;
  if (proposed.get(BLOG_INDEX) !== expectedIndex) throw fail('目录变化不只是移除已审核文章，请在 GitHub 单独审查。', 409);
  const missing = new Set([...removed, ...rows.filter(row => !row.raw).map(row => row.path)]);
  for (const [path, raw] of proposed) if (linkedPaths(raw).some(ref => missing.has(ref))) throw fail(`「${parseMdx(raw).frontmatter.title || path}」仍引用待删除页面，请先处理引用。`, 409);
}

// Full content is fetched only when the edited time changed, or this card has never been pulled.
// Cards still in the list keep the stored body when the edited time matches. A missing list entry is not revived from the cache.
async function pullCard(env, client, schema, id, listed) {
  let created = listed?.created || '';
  let updated = listed?.updated || '';
  if (!listed) {
    const stamps = (await cardTimestamps(client, [id])).get(id);
    created = stamps?.created || '';
    updated = stamps?.updated || '';
  }
  const cached = updated ? await readCardPull(env, id) : null;
  if (updated && cached?.edited_at === updated && currentShape(cached.properties) && cached.source != null) {
    return { source: cached.source, properties: cached.properties, created: cached.card_created || created, updated };
  }
  const source = updated && cached?.edited_at === updated && cached.source != null ? cached.source : await readCard(client, id);
  const properties = updated && cached?.edited_at === updated && currentShape(cached.properties) ? cached.properties : await readProperties(client, id, schema);
  if (updated) await saveCardContent(env, id, updated, created, properties, source);
  return { source, properties, created, updated };
}

// Properties cached before the Remark / Serial / Language / URL columns existed are read again.
const currentShape = properties => Boolean(properties && 'url' in properties && 'remark' in properties);

async function rememberProperties(env, id, properties) {
  const cached = await readCardPull(env, id);
  if (cached?.edited_at) await saveCardProperties(env, id, cached.edited_at, cached.card_created, properties);
}

// URL / Serial routing for articles. The same Serial is the same article: language versions
// share one URL (English at <url>, Chinese at <url>/cn) and an existing page is updated in place.
async function articleRoute(env, entries, id, properties) {
  if (!properties.member || collectionForBlogType(properties.type) !== 'articles') return null;
  const serial = properties.serial;
  const sameSerial = serial == null ? [] : entries.filter(doc => doc.collection === 'articles' && doc.serial === serial);
  let url = properties.url;
  if (!url && serial != null) {
    const partner = sameSerial.find(doc => doc.heptabaseCardLink !== `heptabase://card/${id}` && doc.url);
    if (partner) url = partner.url;
    else for (const [otherId, row] of await readCardPulls(env)) {
      if (otherId !== id && row.properties?.serial === serial && row.properties?.url) { url = row.properties.url; break; }
    }
  }
  const language = properties.language === 'cn' ? 'cn' : null;
  if (url) return { id: urlArticleId(url, language), url };
  const inPlace = sameSerial.find(doc => (doc.language === 'cn' ? 'cn' : null) === language);
  return inPlace ? { id: inPlace.id, url: null } : null;
}

function assertRouteFree(entries, route, cardLink, properties) {
  const occupant = entries.find(doc => doc.collection === 'articles' && doc.id === route.id);
  if (!occupant || !occupant.heptabaseCardLink || occupant.heptabaseCardLink === cardLink) return;
  if (properties.serial != null && occupant.serial === properties.serial) return;
  throw fail(`地址 /articles/${route.id} 已被「${occupant.title}」使用。请在 Heptabase 换一个 URL，或给两张卡片同一个 Serial（同一篇文章）。`, 409);
}

async function heptabasePlan(env, identity, input) {
  if (input.direction && input.direction !== 'pull') throw fail('请在 Heptabase 编辑内容；后台仅负责拉取与发布。');
  const id = cardId(input.cardLink);
  const client = await mcpClient(env);
  const { cards, tagId } = await blogCards(client);
  const schema = await blogSchema(client, tagId);
  const card = cards.find((c) => c.id === id);
  if (!card || card.type !== 'card') throw fail('只能同步 #blog 下的文字卡片。');
  const listedById = new Map(cards.map((item) => [item.id, item]));
  const pulled = new Map();
  const cardPull = async (nextId) => {
    if (pulled.has(nextId)) return pulled.get(nextId);
    const value = await pullCard(env, client, schema, nextId, listedById.get(nextId));
    pulled.set(nextId, value);
    return value;
  };
  const rootPull = await cardPull(id);
  const rootProperties = rootPull.properties;
  const routed = collectionForBlogType(rootProperties.type);
  if (input.collection && input.collection !== routed) throw fail(typeRouteMessage(rootProperties.type));
  const state = await branchState(env);
  const docs = await listDocs(env, identity, state);
  const entries = [...docs.articles, ...docs.projects, ...docs.sitePages];
  const linked = entries.filter((d) => d.heptabaseCardLink?.toLowerCase() === card.cardLink);
  if (linked.some((d) => d.collection !== routed)) throw fail('已关联页面与 Blog Type 不一致。Article 和 Reference 对应文章页，Project 对应项目，Page 对应站点页面。Reference 不进文章列表。');
  const collection = input.collection || linked[0]?.collection || routed;
  const pageCards = routed === 'pages' ? await loadPageCards(client, schema, cards, await publishedFiles(env, state)) : [];
  const rootPage = routed === 'pages' ? assignPageId(card.title, id, entries, new Map()) : null;
  const route = collection === 'articles' ? await articleRoute(env, entries, id, rootProperties) : null;
  if (route) {
    assertRouteFree(entries, route, card.cardLink, rootProperties);
    const moved = linked.find(d => d.id !== route.id);
    if (moved) throw fail(`这张卡片已发布在 /articles/${moved.id}。${route.url ? `URL「${route.url}」` : '同一 Serial'} 会换到 /articles/${route.id}；后台不会自动搬移已发布的文章。请先清空 URL 保持原地址，或在 GitHub 把文件移到新地址后再拉取。`, 409);
  }
  const documentId = route?.id || input.id || linked[0]?.id || rootPage?.id || `hepta-${id}`;
  const filePath = docPath(collection, documentId);
  if (collection === 'pages' && documentId === 'blogs') throw fail('博客目录不能绑定为一张内容卡片。');
  if (linked.some((d) => d.collection !== collection || d.id !== documentId)) throw fail('这张卡片已连接另一篇文章，请打开原文章同步。');
  const targets = new Map(entries.filter((d) => d.heptabaseCardLink).map((d) => [cardId(d.heptabaseCardLink), d]));
  targets.set(id, { collection, id: documentId, url: route?.url || null, displaced: Boolean(rootPage?.displaced), canonicalTitle: rootPage?.canonicalTitle || '' });
  const graph = [], pending = [id], seen = new Set();
  while (pending.length) {
    const nextId = pending.shift(); if (seen.has(nextId)) continue; seen.add(nextId);
    if (seen.size > 200) throw fail('引用超过 200 张卡片，请先拆分发布范围；没有遗漏后继续发布。');
    const loaded = await cardPull(nextId);
    const source = loaded.source;
    const properties = loaded.properties;
    const routedCollection = properties.member ? collectionForBlogType(properties.type) : null;
    const known = targets.get(nextId);
    if (routedCollection && known && known.collection !== routedCollection) throw fail('已关联页面与 Blog Type 不一致。Article 和 Reference 对应文章页，Project 对应项目，Page 对应站点页面。Reference 不进文章列表。');
    const heading = (/^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/m.exec(source) || [])[1]?.trim() || '';
    const assigned = routedCollection === 'pages' && !known ? assignPageId(heading, nextId, entries, targets) : null;
    const nodeRoute = !known && routedCollection === 'articles' ? await articleRoute(env, entries, nextId, properties) : null;
    if (nodeRoute) assertRouteFree(entries, nodeRoute, `heptabase://card/${nextId}`, properties);
    const target = known || { collection: routedCollection || 'articles', id: nodeRoute?.id || assigned?.id || `hepta-${nextId}`, url: nodeRoute?.url || null, displaced: Boolean(assigned?.displaced), canonicalTitle: assigned?.canonicalTitle || '' };
    targets.set(nextId, target);
    const path = docPath(target.collection, target.id);
    const current = await effectiveFile(env, identity, state, path);
    const stamps = { created: loaded.created, updated: loaded.updated };
    const copied = dateFromCard({ publishDate: properties.date, created: stamps.created, timezone: env.STUDIO_TIMEZONE });
    const parsed = current.raw ? parseMdx(current.raw) : { frontmatter: { slot: target.collection === 'pages' ? 'page' : target.collection === 'projects' ? 'project' : 'article', description: '待补充摘要', date: copied.date || publicationDate(), created: stamps.created || undefined, updated: stamps.updated || undefined, draft: true, ...(nextId !== id && target.collection !== 'pages' ? { listed: false } : {}) }, imports: '', bodyZh: '' };
    if (current.draft?.state === 'draft' && current.draft.raw === '') throw fail('这篇文章已在待删除清单，请先取消删除后重新拉取。', 409);
    if (current.raw && !parsed.frontmatter.draft && parsed.frontmatter.listed !== false && !properties.member) throw fail('引用的主文章已移出 #blog，请先处理撤下和引用关系，不能自动作为资料继续公开。', 409);
    const sameArticle = properties.serial != null && parsed.frontmatter.serial === properties.serial;
    if (parsed.frontmatter.heptabaseCardLink && cardId(parsed.frontmatter.heptabaseCardLink) !== nextId && !sameArticle) throw fail('文章已连接另一张卡片。');
    graph.push({ id: nextId, path, target, source, properties, created: stamps.created, updated: stamps.updated, parsed, current });
    for (const ref of references(source)) { if (!seen.has(ref.id)) pending.push(ref.id); }
  }
  const rootDraft = input.preparePublish === true ? false : graph[0].properties.status !== 'published';
  for (const node of graph) {
    const { parsed, properties } = node;
    // Opaque interactive MDX is only restored from the already-trusted GitHub copy.
    // A modified code archive is never executed as new website code.
    const archived = /^# [^\n]+\n\n`{3,}mdx\n/.test(node.source);
    if (archived && (!node.current.raw || node.source !== toHeptabase(parsed, entries))) throw fail('这张卡片保存了交互内容的源码。此类程序改动需通过 GitHub 审查，不能直接从卡片运行到网站。');
    const content = archived ? { title: parsed.frontmatter.title, body: parsed.bodyZh, imports: parsed.imports } : fromHeptabase(node.source, targets, parsed.imports);
    const copied = dateFromCard({ publishDate: properties.date, created: node.created, timezone: env.STUDIO_TIMEZONE });
    const frontmatter = { ...parsed.frontmatter, slot: node.target.collection === 'pages' ? 'page' : node.target.collection === 'projects' ? 'project' : 'article', title: content.title || '未命名卡片', tags: properties.tags,
      description: properties.summary || '',
      date: copied.date || (!rootDraft && properties.member ? publicationDate(new Date(), env.STUDIO_TIMEZONE) : parsed.frontmatter.date || publicationDate(new Date(), env.STUDIO_TIMEZONE)),
      created: node.created || undefined, updated: node.updated || undefined,
      draft: node.id === id ? rootDraft : rootDraft && Boolean(parsed.frontmatter.draft), listed: node.target.collection === 'pages' ? undefined : properties.type === 'reference' ? false : properties.member,
      heptabaseType: properties.type || undefined, heptabaseStatus: properties.member ? properties.status : undefined, heptabaseCardLink: `heptabase://card/${node.id}`,
      ...(node.target.collection === 'articles' ? {
        serial: properties.serial ?? undefined,
        language: ['cn', 'en'].includes(properties.language) ? properties.language : undefined,
        url: node.target.url || undefined,
      } : {}) };
    node.next = serializeMdx({ ...parsed, frontmatter, imports: content.imports, bodyZh: content.body });
    const previous = await firstRow(env, 'SELECT * FROM studio_heptabase_sync WHERE card_id = ?1', node.id);
    node.conflict = Boolean(previous && previous.source !== JSON.stringify([node.source, properties]) && previous.blog_body !== blogProjection(parsed));
  }
  const root = graph[0];
  if (input.reviewOnly && root.properties.status !== 'review') throw fail('这张卡片已不在 Review，请重新拉取。', 409);
  return { id, collection, documentId, filePath, source: root.source, raw: root.current.raw, next: root.next,
    blog: root.current.raw ? blogBody(root.parsed) : '尚未创建', nextBlog: blogBody(parseMdx(root.next)),
    properties: root.properties,
    sourceHash: await hash(JSON.stringify(graph.map((n) => [n.id, n.source, n.properties, n.created || '', n.updated || '']))),
    pageNote: root.target.collection === 'pages' ? pageReviewNote(root.target.id, { ...root.target, choiceRequired: pageCards.length > PAGE_CAP }) : undefined,
    pageChoiceRequired: root.target.collection === 'pages' && pageCards.length > PAGE_CAP,
    documentHash: await hash(JSON.stringify(graph.map((n) => [n.id, n.current.raw]))),
    planHash: await hash(JSON.stringify(graph.map((n) => [n.id, n.next]))),
    conflict: graph.some((n) => n.conflict), graph, state, schema };
}

async function heptabasePreview(env, identity, input) {
  const plan = await heptabasePlan(env, identity, input);
  const { state, schema, graph, ...visible } = plan;
  // An open PR is a proposed release, not an already-published article.
  const baseline = state.readBranch === state.branch ? state : await branchState(env, state.branch);
  const published = new Map();
  for (const node of graph) published.set(node.id, await readBlob(env, baseline, node.path));
  const changes = graph.map(n => ({ id: n.id, cardLink: `heptabase://card/${n.id}`, title: parseMdx(n.next).frontmatter.title,
    path: n.path, mainArticle: Boolean(n.properties.member && n.properties.type !== 'reference'), referenceTagged: Boolean(n.properties.member && n.properties.type === 'reference'),
    previouslyPublished: Boolean(published.get(n.id) && !parseMdx(published.get(n.id)).frontmatter.draft),
    kind: !published.get(n.id) ? '新增' : n.next === published.get(n.id) ? '未变化' : '更新',
    beforeContent: published.get(n.id) ? parseMdx(published.get(n.id)).bodyZh : '',
    afterContent: parseMdx(n.next).bodyZh,
    beforeProperties: published.get(n.id) ? parseMdx(published.get(n.id)).frontmatter : {},
    afterProperties: parseMdx(n.next).frontmatter,
    before: published.get(n.id) || '', after: n.next, conflict: n.conflict }));
  return { ...visible, changes, references: changes.slice(1) };
}

function samePlan(input, plan) {
  if (input.sourceHash !== plan.sourceHash || input.documentHash !== plan.documentHash || input.planHash !== plan.planHash) throw fail('内容在预览之后发生变化，请重新拉取并审查。', 409);
}

async function markReferences(env, identity, input) {
  return withLock(env, 'publication', async (lease) => {
    const plan = await heptabasePlan(env, identity, input); samePlan(input, plan);
    const client = await mcpClient(env), { tagId } = await blogCards(client);
    const option = plan.schema.type.options.find((item) => item.name.trim().toLowerCase() === 'reference');
    if (!option) throw fail('Blog Type 需要一个 Reference 选项。');
    // A mentioned #blog article keeps its own Blog Type. Only cards outside #blog become Reference.
    const ids = plan.graph.filter(n => !n.properties.member).map(n => n.id);
    if (ids.length) {
      await lease();
      const result = await client.call('update_database_card_membership', { tagId, operation: 'add', cardIds: ids });
      if (result.failedCardIds?.length || result.invalidCardIds?.length) throw fail('部分引用尚未加入 #blog，未批准发布；请重新拉取后重试。', 409);
      const edited = await client.call('edit_card_properties', { tagId, edits: ids.map((cardId) => ({ cardId, propertyId: plan.schema.type.id, type: 'select', value: option.name })) });
      if (!edited.results || edited.results.length !== ids.length || edited.results.some((item) => item.status !== 'success')) throw fail('引用的 Blog Type 没有全部写成 Reference，未批准发布。', 409);
      for (const id of ids) {
        const actual = await readProperties(client, id, plan.schema);
        if (!actual.member || actual.type !== 'reference') throw fail('Heptabase 尚未确认引用已加入 #blog 且 Blog Type 为 Reference。', 409);
        await rememberProperties(env, id, actual);
      }
    }
    return { marked: ids.length };
  });
}

async function heptabaseApply(env, identity, input) {
  return withLock(env, 'publication', async (lease) => {
    const plan = await heptabasePlan(env, identity, input);
    samePlan(input, plan);
    if (input.confirmPublic !== true) throw fail('请先审查所有文章和引用卡片，并明确确认可以公开。', 409);
    if (plan.graph.some(n => !n.properties.member)) throw fail('请先把引用资料加入 #blog，并把 Blog Type 设为 Reference，再完成隐私审查。', 409);
    if (plan.conflict && input.resolveConflict !== true) throw fail('两边都有更新，请比较后明确确认采用 Heptabase 的版本。', 409);
    if (plan.graph[0].properties.type === 'page') await assertKeptPage(env, identity, plan.graph[0].id);
    await savePlan(env, identity, plan, lease);
    return readDoc(env, identity, plan.collection, plan.documentId);
  });
}

async function savePlan(env, identity, plan, lease, completion) {
    // Save all of this blog's references together; no partial graph is queued.
    const statements = [], now = new Date().toISOString();
    for (const node of plan.graph) {
      const previous = node.current.draft, active = previous?.state === 'draft';
      if (previous) statements.push(db(env).prepare('INSERT INTO studio_draft_history (path, raw, saved_at) VALUES (?1, ?2, ?3)').bind(node.path, previous.raw, now));
      statements.push(db(env).prepare(`INSERT INTO studio_drafts
        (user_id, repository, branch, path, raw, base_commit_sha, base_raw, version, state, saved_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'draft', ?9, ?9)
        ON CONFLICT(user_id, repository, branch, path) DO UPDATE SET
        raw = excluded.raw, base_commit_sha = excluded.base_commit_sha, base_raw = excluded.base_raw,
        version = excluded.version, state = 'draft', saved_at = excluded.saved_at, updated_at = excluded.updated_at`)
        .bind(identity.id, plan.state.repository, plan.state.branch, node.path, node.next,
          active ? previous.base_commit_sha : plan.state.commitSha, active ? previous.base_raw : node.current.remoteRaw,
          active ? Number(previous.version) + 1 : 1, now));
      if (!node.remove) {
        statements.push(db(env).prepare('INSERT INTO studio_heptabase_sync (card_id, path, source, blog_body) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(card_id) DO UPDATE SET path = excluded.path, source = excluded.source, blog_body = excluded.blog_body').bind(node.id, node.path, JSON.stringify([node.source, node.properties]), blogProjection(parseMdx(node.next))));
        statements.push(db(env).prepare('INSERT INTO studio_reviews (path, card_id, source_hash, raw_hash, reviewed_at) VALUES (?1, ?2, ?3, ?4, ?5) ON CONFLICT(path) DO UPDATE SET card_id = excluded.card_id, source_hash = excluded.source_hash, raw_hash = excluded.raw_hash, reviewed_at = excluded.reviewed_at').bind(node.path, node.id, await sourceDigest(node.source, node.properties, node), await hash(node.next), now));
      }
    }
    if (completion) statements.push(completion);
    await lease();
    await db(env).batch(statements);
}

async function restoreRemoval(env, identity, id, lease) {
  const plan = (await removalDecisions(env)).find(p => p.id === id);
  if (!plan) return false;
  const rows = await draftRows(env, identity);
  if (!plan.graph.every(n => rows.some(row => row.path === n.path && row.raw === ''))) throw fail('删除已提交 GitHub，请先在 GitHub 恢复，不能在这里覆盖已提交版本。', 409);
  const statements = [];
  for (const node of plan.graph) {
    const previous = node.current.draft;
    if (previous?.state === 'draft') statements.push(db(env).prepare("UPDATE studio_drafts SET raw = ?1, base_raw = ?2, base_commit_sha = ?3, version = version + 1 WHERE path = ?4 AND state = 'draft'").bind(previous.raw, previous.base_raw, previous.base_commit_sha, node.path));
    else statements.push(db(env).prepare("DELETE FROM studio_drafts WHERE path = ?1 AND state = 'draft'").bind(node.path));
  }
  statements.push(db(env).prepare("DELETE FROM studio_review_decisions WHERE card_id = ?1 AND decision = 'remove'").bind(id));
  await lease();
  await db(env).batch(statements);
  return true;
}

function permutation(order, ids) {
  return Array.isArray(order) && order.length === ids.length && new Set(order).size === order.length && order.every(id => ids.includes(id));
}

async function choosePages(env, identity, input) {
  return withLock(env, 'publication', async lease => {
    if (!Array.isArray(input.keep) || input.keep.some(id => typeof id !== 'string')) throw fail('请选择要留下的站点页面。');
    const keep = [...new Set(input.keep)];
    if (keep.length !== input.keep.length) throw fail('请选择要留下的站点页面。');
    if (keep.length > PAGE_CAP) throw fail(`站点页面最多留下 ${PAGE_CAP} 页。`);
    const client = await mcpClient(env);
    const { cards, tagId } = await blogCards(client);
    const schema = await blogSchema(client, tagId);
    const state = await branchState(env);
    const pages = await loadPageCards(client, schema, cards, await publishedFiles(env, state));
    const selecting = pages.length > PAGE_CAP;
    const ids = new Set(pages.map(page => page.id));
    let order;
    if (!selecting) {
      if (!Array.isArray(input.order)) throw fail(`现在不超过 ${PAGE_CAP} 张站点页，会全部发布，不需要挑选。`);
      order = input.order;
      if (!permutation(order, pages.map(page => page.id))) throw fail('导航顺序要包含全部站点页，且每页只出现一次。');
    } else {
      if (keep.some(id => !ids.has(id))) throw fail('只能从 Page 卡片里选择留下的页面。');
      const kept = pages.filter(page => keep.includes(page.id));
      order = Array.isArray(input.order) ? input.order : defaultPageOrder(kept);
      if (!permutation(order, keep)) throw fail('导航顺序要和留下的页面一致，且每页只出现一次。');
    }
    const keptIds = selecting ? keep : pages.map(page => page.id);
    for (const plan of await removalDecisions(env)) {
      if (plan.reason === 'capped' && keptIds.includes(plan.id)) await restoreRemoval(env, identity, plan.id, lease);
    }
    const seen = pages.map(page => page.id).sort();
    const docs = await listDocs(env, identity, state);
    const targets = new Map();
    const slugs = [];
    for (const id of order) {
      const card = pages.find(page => page.id === id);
      const assigned = card.pageId ? { id: card.pageId } : assignPageId(card.title, card.id, docs.sitePages, targets);
      targets.set(id, { collection: 'pages', id: assigned.id });
      slugs.push(assigned.id);
    }
    await lease();
    await run(env, "INSERT INTO studio_review_decisions (card_id, decision, status, payload, created_at) VALUES (?1, 'page-cap', 'complete', ?2, ?3) ON CONFLICT(card_id) DO UPDATE SET decision = 'page-cap', status = 'complete', payload = excluded.payload, created_at = excluded.created_at", PAGE_CHOICE_ID, JSON.stringify({ seen, keep: [...keptIds].sort(), order }), new Date().toISOString());
    const existing = await draftFor(env, identity, PAGE_ORDER_PATH);
    await upsertDraft(env, identity, state, PAGE_ORDER_PATH, pageOrderSource(slugs), {
      baseCommitSha: state.commitSha,
      baseRaw: await readBlob(env, state, PAGE_ORDER_PATH),
      expectedVersion: existing?.state === 'draft' ? existing.version : 0,
    });
    if (!selecting) return { cap: PAGE_CAP, keep: [...keptIds].sort(), order, seen, removals: [] };
    for (const page of pages) {
      if (!page.onSite || keep.includes(page.id)) continue;
      const plan = await removalPlan(env, identity, { collection: 'pages', id: pageIdFromPath(page.path), cardLink: page.cardLink }, 'capped');
      if (plan.approved) continue;
      if (plan.blockers.length) throw fail(`「${page.title}」仍被其他文章引用：${plan.blockers.map(b => b.title).join('、')}。先处理引用，再选择不留下这一页。`, 409);
      const completion = db(env).prepare("INSERT INTO studio_review_decisions (card_id, decision, status, payload, created_at) VALUES (?1, 'remove', 'complete', ?2, ?3) ON CONFLICT(card_id) DO UPDATE SET decision = 'remove', status = 'complete', payload = excluded.payload, created_at = excluded.created_at").bind(plan.id, JSON.stringify(plan), new Date().toISOString());
      await savePlan(env, identity, plan, lease, completion);
    }
    const statements = [];
    for (const row of await draftRows(env, identity)) {
      if (!row.raw || !pageIdFromPath(row.path)) continue;
      const link = parseMdx(row.raw).frontmatter.heptabaseCardLink;
      if (!link) continue;
      let card;
      try { card = cardId(link); } catch { continue; }
      if (!ids.has(card) || keep.includes(card)) continue;
      statements.push(db(env).prepare("DELETE FROM studio_drafts WHERE path = ?1 AND state = 'draft'").bind(row.path));
      statements.push(db(env).prepare('DELETE FROM studio_reviews WHERE path = ?1').bind(row.path));
      statements.push(db(env).prepare("DELETE FROM studio_review_decisions WHERE card_id = ?1 AND decision = 'approve'").bind(card));
    }
    if (statements.length) { await lease(); await db(env).batch(statements); }
    const removals = (await removalDecisions(env)).filter(plan => plan.reason === 'capped' && !keep.includes(plan.id)).map(plan => ({
      ...pathDoc(plan.filePath), cardLink: `heptabase://card/${plan.id}`, title: plan.graph[0].parsed.frontmatter.title, reason: plan.reason, reasonLabel: plan.reasonLabel,
    }));
    return { cap: PAGE_CAP, keep: [...keep].sort(), order, seen, removals };
  });
}

async function reviewDecisions(env) {
  const rows = await allRows(env, 'SELECT * FROM studio_review_decisions ORDER BY created_at DESC');
  return { decisions: rows.filter(row => row.decision === 'approve' || row.decision === 'reject').map(row => {
    const plan = JSON.parse(row.payload), root = plan.graph[0];
    return { id: row.card_id, title: root.parsed.frontmatter.title, decision: row.decision, status: row.status, date: plan.date };
  }) };
}

async function decideReview(env, identity, input) {
  return withLock(env, 'publication', async lease => {
    const id = cardId(input.cardLink);
    if (!['approve', 'reject'].includes(input.decision)) throw fail('请选择通过或拒绝。');
    if (input.remark !== undefined && typeof input.remark !== 'string') throw fail('Remark 应是一段文字。');
    if (typeof input.remark === 'string' && input.remark.length > 2000) throw fail('Remark 最多 2000 字。');
    const remark = input.remark;
    let saved = await firstRow(env, 'SELECT * FROM studio_review_decisions WHERE card_id = ?1', id), plan;
    const savedPlan = saved ? JSON.parse(saved.payload) : null;
    const sameRequest = savedPlan && input.sourceHash === savedPlan.sourceHash && input.documentHash === savedPlan.documentHash && input.planHash === savedPlan.planHash;
    const client = await mcpClient(env), { tagId } = await blogCards(client), schema = await blogSchema(client, tagId);
    if (saved?.status === 'complete' && saved.decision === input.decision && sameRequest) {
      const current = await readProperties(client, id, schema);
      const wantRemark = input.decision === 'reject' && remark !== undefined;
      if (current.status === (saved.decision === 'approve' ? 'published' : 'block') && (!wantRemark || current.remark === remark)) return { id, decision: saved.decision, status: 'complete', properties: current };
    }
    // A decided card may be decided again from the same review, as long as nothing else changed.
    // The card is no longer in Review, so the reviewed plan is reused instead of pulled again.
    const revising = saved?.status === 'complete' && sameRequest;
    const previous = revising ? savedPlan.applied || { status: saved.decision === 'approve' ? 'published' : 'block' } : null;
    if (saved?.status === 'pending' && (!input.sourceHash || sameRequest)) {
      if (input.decision !== saved.decision) throw fail('上次属性回写尚未完成，请先重试原操作。', 409);
      plan = JSON.parse(saved.payload);
    } else if (revising) {
      plan = savedPlan;
      if (input.decision === 'approve' && input.confirmPublic !== true) throw fail('请先确认这篇文章和所有引用都可以公开。', 409);
      if (input.decision === 'approve' && plan.graph.some(n => !n.properties.member)) throw fail('引用资料还没有加入 #blog。请把卡片重新标为 Review 后拉取，再通过。', 409);
      await run(env, "UPDATE studio_review_decisions SET decision = ?2, status = 'pending', created_at = ?3 WHERE card_id = ?1", id, input.decision, new Date().toISOString());
    } else {
      plan = await heptabasePlan(env, identity, { ...input, reviewOnly: true, preparePublish: true });
      samePlan(input, plan);
      // Approving is the public-release confirmation; the dashboard sends it with the single click.
      if (input.decision === 'approve') {
        if (input.confirmPublic !== true) throw fail('请先确认这篇文章和所有引用都可以公开。', 409);
        if (plan.conflict && input.resolveConflict !== true) throw fail('两边都有更新，请确认采用 Heptabase 版本。', 409);
        if (plan.graph.some(n => !n.properties.member)) throw fail('请先把引用资料加入 #blog，并把 Blog Type 设为 Reference，再完成隐私审查。', 409);
      }
      // Other #blog cards always need their own decision. A mention must never
      // smuggle a rejected or still-unreviewed blog into this approval.
      plan.graph = plan.graph.filter(n => n.id === id || n.properties.type === 'reference');
      const copied = dateFromCard({ publishDate: plan.graph[0].properties.date, created: plan.graph[0].created, timezone: env.STUDIO_TIMEZONE });
      plan.date = copied.date || publicationDate(new Date(), env.STUDIO_TIMEZONE);
      plan.inventDate = copied.invented;
      plan.state = { repository: plan.state.repository, branch: plan.state.branch, commitSha: plan.state.commitSha };
      await run(env, "INSERT INTO studio_review_decisions (card_id, decision, status, payload, created_at) VALUES (?1, ?2, 'pending', ?3, ?4) ON CONFLICT(card_id) DO UPDATE SET decision = excluded.decision, status = 'pending', payload = excluded.payload, created_at = excluded.created_at", id, input.decision, JSON.stringify(plan), new Date().toISOString());
    }
    const root = plan.graph[0];
    const desired = input.decision === 'approve'
      ? { status: 'published', ...(!root.properties.date && !root.created ? { date: plan.date } : {}) }
      : { status: 'block', ...(remark !== undefined ? { remark } : {}) };
    const current = await readProperties(client, id, schema);
    // A timed-out write may have applied none, some, or all properties. Accept
    // only those exact intermediate states; never overwrite unrelated edits.
    for (const node of plan.graph) {
      const properties = node.id === id ? current : await readProperties(client, node.id, schema);
      const expected = node.id === id ? { ...properties, status: root.properties.status, date: root.properties.date, remark: root.properties.remark } : properties;
      if (await readCard(client, node.id) !== node.source || JSON.stringify(expected) !== JSON.stringify(node.properties)) throw fail('审核期间内容或属性又有变化，未覆盖新内容。请恢复原版本后重试，或重新拉取审核。', 409);
    }
    const statuses = [root.properties.status, desired.status, previous?.status].filter(Boolean);
    const dates = [root.properties.date, desired.date ?? root.properties.date, previous?.date ?? root.properties.date];
    if (!statuses.includes(current.status) || !dates.includes(current.date)) throw fail('Status 或日期又有变化，未覆盖你的新标记。', 409);
    // Retry must not overwrite a newer reviewed copy created while a remote
    // property write was interrupted. A copy staged by this same review's approval is expected.
    for (const node of plan.graph) {
      const staged = await draftFor(env, identity, node.path), stagedRaw = staged?.state === 'draft' ? staged.raw : null;
      const planned = node.current.draft?.state === 'draft' ? node.current.draft.raw : null;
      if (stagedRaw !== planned && !(previous && stagedRaw === node.next)) throw fail('已有更新的审核副本，请重新把卡片标为 Review 后拉取。', 409);
    }
    if (input.decision === 'approve' && plan.graph[0].properties.type === 'page') await assertKeptPage(env, identity, id);
    await lease(); await writeProperties(client, id, schema, desired);
    const after = await readProperties(client, id, schema);
    const applied = { ...(previous || {}), ...desired };
    if (await readCard(client, id) !== root.source || JSON.stringify(after) !== JSON.stringify({ ...root.properties, ...applied })) throw fail('属性已回写，但内容或标签同时被修改。请重新标为 Review 后拉取审查，尚未提交 GitHub。', 409);
    await rememberProperties(env, id, after);
    if (input.decision === 'approve') {
      root.properties = after;
      const parsed = parseMdx(root.next);
      parsed.frontmatter.heptabaseStatus = 'published'; parsed.frontmatter.date = plan.date;
      root.next = serializeMdx(parsed);
    }
    const record = JSON.stringify({ ...plan, applied });
    const completion = db(env).prepare("UPDATE studio_review_decisions SET status = 'complete', payload = ?2 WHERE card_id = ?1").bind(id, record);
    if (input.decision === 'approve') {
      await savePlan(env, identity, plan, lease, completion);
    } else {
      const remaining = (await draftRows(env, identity)).filter(row => row.path !== root.path);
      const byPath = new Map(remaining.map(row => [row.path, row])), reachable = new Set();
      const pending = remaining.filter(row => parseMdx(row.raw).frontmatter.listed !== false).map(row => row.path);
      while (pending.length) {
        const path = pending.pop(); if (reachable.has(path)) continue; reachable.add(path);
        const row = byPath.get(path); if (row) pending.push(...blogReferences(parseMdx(row.raw).bodyZh).map(ref => `src/content/${ref}.mdx`));
      }
      const unused = remaining.filter(row => !reachable.has(row.path));
      await db(env).batch([
        db(env).prepare("DELETE FROM studio_drafts WHERE path = ?1 AND state = 'draft'").bind(root.path),
        db(env).prepare('DELETE FROM studio_reviews WHERE path = ?1').bind(root.path),
        ...unused.flatMap(row => [db(env).prepare("DELETE FROM studio_drafts WHERE path = ?1 AND state = 'draft'").bind(row.path), db(env).prepare('DELETE FROM studio_reviews WHERE path = ?1').bind(row.path)]), completion,
      ]);
    }
    return { id, decision: input.decision, status: 'complete', properties: after };
  });
}

async function exportCard(env, identity, input) {
  const path = docPath(input.collection, input.id);
  if (input.collection === 'pages' && input.id === 'blogs') throw fail('目录页不能创建为内容卡片。');
  return withLock(env, 'publication', async (lease) => {
    const state = await branchState(env);
    const current = await effectiveFile(env, identity, state, path);
    if (!current.raw) throw fail('请先创建并保存文章。');
    const parsed = parseMdx(current.raw);
    if (parsed.frontmatter.heptabaseCardLink) return readDoc(env, identity, input.collection, input.id);
    if (input.documentHash !== await hash(current.raw)) throw fail('文章已变化，请重新确认创建卡片。', 409);
    const client = await mcpClient(env), { tagId } = await blogCards(client), schema = await blogSchema(client, tagId);
    validatePropertyTags(parsed.frontmatter.tags || [], schema);
    const docs = await listDocs(env, identity, state);
    const source = toHeptabase(parsed, [...docs.articles, ...docs.projects, ...docs.sitePages]);
    let exported = await firstRow(env, 'SELECT * FROM studio_card_exports WHERE path = ?1', path);
    if (exported && !exported.card_id) throw fail('上次创建结果尚未确认。请在 Heptabase 检查是否已有卡片，并把它的链接填回文章；不会重复创建。', 409);
    if (!exported) {
      await lease();
      await run(env, 'INSERT INTO studio_card_exports (path, source, started_at) VALUES (?1, ?2, ?3)', path, source, new Date().toISOString());
      const result = await client.call('create_object', { objectType: 'card', content: source });
      const id = cardId(`heptabase://card/${result.objectId}`);
      await run(env, 'UPDATE studio_card_exports SET card_id = ?1 WHERE path = ?2', id, path);
      exported = { card_id: id, source };
    }
    if (await readCard(client, exported.card_id) !== source) throw fail('已创建的卡片与当前文章不同，请填入卡片链接后比较两边内容。', 409);
    await lease();
    const membership = await client.call('update_database_card_membership', { tagId, operation: 'add', cardIds: [exported.card_id] });
    if (membership.failedCardIds?.length || membership.invalidCardIds?.length) throw fail('卡片已创建，但还没有加入 #blog，请重新尝试。');
    await lease();
    await writeProperties(client, exported.card_id, schema, { status: 'writing', tags: parsed.frontmatter.tags || [], type: input.collection === 'projects' ? 'project' : input.collection === 'pages' ? 'page' : 'article' });
    parsed.frontmatter.heptabaseCardLink = `heptabase://card/${exported.card_id}`;
    parsed.frontmatter.heptabaseStatus = parsed.frontmatter.draft ? parsed.frontmatter.heptabaseStatus || 'writing' : 'writing';
    await upsertDraft(env, identity, state, path, serializeMdx(parsed), { baseRaw: current.remoteRaw, expectedVersion: current.draft?.state === 'draft' ? current.draft.version : 0 });
    return readDoc(env, identity, input.collection, input.id);
  });
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/dashboard\/api/, '/__studio/api').replace(/\/$/, '') || '/';
  const identity = await author(request, env);
  if (request.method !== 'GET') requireCsrf(request);
  if (path === '/__studio/api/session') return { authenticated: true, localPreview: env.STUDIO_LOCAL_PREVIEW === true, localOpen: loopbackRequest(request) };
  if (path === '/__studio/api/heptabase/status' && request.method === 'GET') return connectionStatus(env);
  if (path === '/__studio/api/heptabase/connect' && request.method === 'POST') return connect(request, env, identity);
  if (path === '/__studio/api/heptabase/cards' && request.method === 'GET') return heptabaseCards(env, identity);
  if (path === '/__studio/api/heptabase/page-choice' && request.method === 'POST') return choosePages(env, identity, await readJson(request));
  if (path === '/__studio/api/heptabase/removal-preview' && request.method === 'POST') return removalView(await removalPlan(env, identity, await readJson(request)));
  if (path === '/__studio/api/heptabase/removal' && request.method === 'POST') return decideRemoval(env, identity, await readJson(request));
  if (path === '/__studio/api/heptabase/removal-cancel' && request.method === 'POST') return cancelRemoval(env, identity, await readJson(request));
  if (path === '/__studio/api/heptabase/decisions' && request.method === 'GET') return reviewDecisions(env);
  if (path === '/__studio/api/heptabase/decision' && request.method === 'POST') return decideReview(env, identity, await readJson(request));
  if (path === '/__studio/api/heptabase/preview' && request.method === 'POST') return heptabasePreview(env, identity, await readJson(request));
  if (path === '/__studio/api/heptabase/mark-references' && request.method === 'POST') return markReferences(env, identity, await readJson(request));
  if (path === '/__studio/api/heptabase/apply' && request.method === 'POST') return heptabaseApply(env, identity, await readJson(request));
  if (path === '/__studio/api/heptabase/export' && request.method === 'POST') return exportCard(env, identity, await readJson(request));
  if (path === '/__studio/api/docs' && request.method === 'GET') return listDocs(env, identity);
  if (path === '/__studio/api/doc' && request.method === 'GET') return readDoc(env, identity, url.searchParams.get('collection') || '', url.searchParams.get('id') || '');
  if (path === '/__studio/api/git' && request.method === 'GET') return gitStatus(env, identity);
  if (path === '/__studio/api/git/commit' && request.method === 'POST') return commitDrafts(env, identity, await readJson(request));
  if (path === '/__studio/api/git/push' && request.method === 'POST') return gitStatus(env, identity);
  if (path === '/__studio/api/git/publish' && request.method === 'POST') return publish(env, identity, await readJson(request));
  if (path === '/__studio/api/git/review' && request.method === 'GET') return review(env);
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
      let response;
      if (url.pathname === '/dashboard/api/deployed' && request.method === 'POST') {
        const payload = await verifyReceipt(env, request);
        const live = await fetchNoRedirect(`${BLOG_URL}/__studio-release.json?check=${Date.now()}`, { signal: AbortSignal.timeout(15000), headers: { 'cache-control': 'no-cache' } });
        if (!live.ok || JSON.parse(await boundedText(live)).commitSha !== payload.commitSha) throw fail('线上版本尚未对应本次发布。', 409);
        const row = await firstRow(env, 'SELECT * FROM studio_releases WHERE commit_sha = ?1', payload.commitSha);
        if (row) {
          await run(env, "UPDATE studio_releases SET status = 'succeeded', stage = 'deployed', url = ?1, error = NULL WHERE id = ?2", BLOG_URL, row.id);
          const result = await completeWriteback(env, row.id);
          response = json(result, result.pending ? 503 : 200);
        } else response = json({ pending: 0 });
      }
      else if (url.pathname === '/dashboard/api/login' && request.method === 'POST') response = await login(request, env);
      else if (url.pathname === '/dashboard/api/logout' && request.method === 'POST') response = await logout(request, env);
      else if (url.pathname === '/dashboard/api/heptabase/callback' && request.method === 'GET') response = await callback(request, env, await author(request, env));
      else if (url.pathname.startsWith('/dashboard/api/')) response = json(await api(request, env));
      if (response) {
        const secured = new Response(response.body, response);
        secured.headers.set('cache-control', 'no-store'); secured.headers.set('x-content-type-options', 'nosniff');
        secured.headers.set('referrer-policy', 'no-referrer'); return secured;
      }
      if (url.pathname === '/dashboard' || url.pathname === '/dashboard/') {
        const html = assets['index.html'];
        return html ? new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', 'x-frame-options': 'DENY', 'referrer-policy': 'no-referrer', 'content-security-policy': "frame-ancestors 'none'; object-src 'none'; base-uri 'self'" } }) : new Response('Not found', { status: 404 });
      }
      const key = url.pathname.replace(/^\/dashboard\//, '');
      const assetKey = key === 'preview' || key === 'preview/' || key === 'preview/index.html' ? 'preview.html' : key;
      const value = assets[assetKey];
      if (value != null) return new Response(value, { headers: { 'content-type': contentType(assetKey), 'cache-control': assetKey.includes('-') ? 'public, max-age=31536000, immutable' : 'no-store' } });
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
