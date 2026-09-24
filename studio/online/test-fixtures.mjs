import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { passwordRecord } from './auth.mjs';
import { createHandler } from './server.mjs';

export const CARD = '6353c916-e0a9-4a0d-aa07-7a3512b72e92';
export const LINK = `heptabase://card/${CARD}`;
export const PATH = 'src/content/articles/example.mdx';
export const PASSWORD = 'local-test-only-password';
export const article = `---
slot: article
title: 测试文章
titleEn: Test article
description: 测试摘要
descriptionEn: Test description
date: 2026-09-21
draft: true
heptabaseCardLink: ${LINK}
customField: 保留字段
---

中文正文。

<div data-lang-split></div>

English body.
`;
// node:sqlite on some Node 22 builds rejects D1's ?1 placeholders and cannot reuse a number.
function positional(sql) {
  const order = [];
  const text = sql.replace(/\?(\d+)/g, (_, number) => {
    order.push(Number(number) - 1);
    return '?';
  });
  return { text, order };
}

export class TestD1 {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec(readFileSync(new URL('../../migrations/0004_studio.sql', import.meta.url), 'utf8'));
    this.sqlite.exec(readFileSync(new URL('../../migrations/0005_card_pulls.sql', import.meta.url), 'utf8'));
  }
  prepare(sql) {
    const { text, order } = positional(sql);
    const statement = this.sqlite.prepare(text); let args = [];
    const wrapper = {
      bind(...values) { args = order.map((index) => values[index]); return wrapper; },
      async first() { return statement.get(...args) || null; },
      async all() { return { results: statement.all(...args) }; },
      async run() { const result = statement.run(...args); return { success: true, meta: { changes: Number(result.changes) } }; },
    };
    return wrapper;
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try { const results = []; for (const s of statements) results.push(await s.run()); this.sqlite.exec('COMMIT'); return results; }
    catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}
const digest = (value) => createHash('sha1').update(JSON.stringify(value)).digest('hex');

export async function fixture(assets = {}) {
  const DB = new TestD1();
  const env = { DB, GITHUB_TOKEN: 'test-token-not-returned', STUDIO_PASSWORD_HASH: await passwordRecord(PASSWORD), STUDIO_SECRET: Buffer.alloc(32, 7).toString('base64') };
  const handler = createHandler(assets);
  const blobs = new Map(), trees = new Map(), commits = new Map(), refs = new Map();
  function blob(raw) { const sha = digest(raw); blobs.set(sha, raw); return sha; }
  function tree(files) { const entries = Object.entries(files).sort(); const sha = digest(entries); trees.set(sha, Object.fromEntries(entries)); return sha; }
  function commit(treeSha, parents = []) { const sha = digest([treeSha, parents]); commits.set(sha, { tree: { sha: treeSha }, parents: parents.map((sha) => ({ sha })) }); return sha; }
  refs.set('main', commit(tree({ [PATH]: blob(article), 'src/content/pages/blogs.mdx': blob('---\nslot: page\ntitle: 博客\n---\n\n<DocList />\n'), 'src/data/tag-groups.ts': blob('export const tagGroups = [];\n') })));
  let pr = null, checksPass = true, liveSha = '', source = '# 测试文章\n\n来自 Heptabase 的正文。', dropPrOnce = false;
  const cardSources = new Map(), referenceCards = new Set(), missingCards = new Set(), timestamps = new Map(), properties = new Map([[CARD, { Status: 'new', Tag: ['AI Native'] }]]);
  const baselines = new Map();
  // Heptabase bumps a card's edited time when its body or properties change.
  // An explicit timestamps entry stays as written, including an empty updated time.
  function cardHash(id) {
    const body = id === CARD ? source : (cardSources.get(id) || '# 测试文章');
    return digest([body, properties.get(id) || null]);
  }
  function stampFor(id) {
    if (timestamps.has(id)) {
      const stamp = timestamps.get(id) || {};
      return { created: stamp.created || '', updated: stamp.updated || '' };
    }
    const hash = cardHash(id);
    let seen = baselines.get(id);
    if (!seen) baselines.set(id, seen = { hash, revision: 0, updated: '2026-09-21T00:00:00Z' });
    else if (seen.hash !== hash) {
      seen.hash = hash;
      seen.updated = `2026-09-22T00:00:${String(++seen.revision).padStart(2, '0')}Z`;
    }
    return { created: '2026-09-21T00:00:00Z', updated: seen.updated };
  }
  // Dashboard property writes are not a new edit. Keep the edited time that the review already stored.
  function adoptBaseline(id) {
    const hash = cardHash(id);
    const seen = baselines.get(id);
    if (seen) seen.hash = hash;
    else baselines.set(id, { hash, revision: 0, updated: '2026-09-21T00:00:00Z' });
  }
  const calls = [];
  function filesFor(sha) { return trees.get(commits.get(sha).tree.sha); }
  const changedFiles = () => {
    const main = filesFor(refs.get('main')), next = filesFor(refs.get('codex/studio-content'));
    return [...new Set([...Object.keys(main), ...Object.keys(next)])].filter(p => main[p] !== next[p]).map(filename => ({ filename, status: !next[filename] ? 'removed' : !main[filename] ? 'added' : 'modified', patch: '@@\n-旧内容\n+新内容' }));
  };
  const fetcher = async (input, init = {}) => {
    const url = new URL(input); const method = init.method || 'GET';
    const body = init.body && String(init.body).startsWith('{') ? JSON.parse(init.body) : {};
    calls.push({ method, url: url.href, body });
    if (url.hostname === 'ethanchang.io') return Response.json({ commitSha: liveSha });
    if (url.hostname === 'api.heptabase.com') {
      if (url.pathname === '/v1/oauth/register') return Response.json({ client_id: 'test-client' });
      if (url.pathname === '/token') return Response.json({ access_token: 'private-access-token', refresh_token: 'private-refresh-token', expires_in: 3600 });
      if (url.pathname === '/mcp') {
        if (body.method === 'notifications/initialized') return new Response(null, { status: 202 });
        let result;
        if (body.method === 'initialize') result = { protocolVersion: '2025-03-26', capabilities: {}, serverInfo: { name: 'fixture', version: '1' } };
        else {
          const { name, arguments: args } = body.params;
          let content;
          if (name === 'list_tags') content = { content: `<tags total="2"><tag id="blog-id" name="blog" cardCount="${properties.size}"><tag id="reference-id" name="blog-reference" cardCount="${referenceCards.size}" /></tag></tags>` };
          else if (name === 'read_database') content = { configuration: { schema: {
            status: { name: 'Status', type: 'select', options: ['new', 'writing', 'block', 'review', 'published'].map((name) => ({ id: name, name })) },
            date: { name: 'Publish Date', type: 'date' },
            tags: { name: 'Tag', type: 'multiSelect', options: ['Mission', 'AI Native', 'Productivity'].map((name) => ({ id: name, name })) },
            type: { name: 'Blog Type', type: 'select', options: ['Article', 'Project', 'Page', 'Reference'].map((name) => ({ id: name, name })) },
            summary: { name: 'Summary', type: 'text' },
            remark: { name: 'Remark', type: 'text' },
            serial: { name: 'Serial', type: 'number' },
            language: { name: 'Language', type: 'select', options: [{ id: 'zh', name: 'simplified chinese' }, { id: 'en', name: 'english' }] },
            url: { name: 'URL', type: 'text' },
          } } };
          else if (name === 'edit_card_properties') {
            for (const edit of args.edits) {
              const values = properties.get(edit.cardId) || {}; const key = { status: 'Status', date: 'Publish Date', tags: 'Tag', type: 'Blog Type', remark: 'Remark' }[edit.propertyId];
              if (edit.value === null) delete values[key]; else values[key] = edit.value;
              properties.set(edit.cardId, values);
            }
            for (const edit of args.edits) adoptBaseline(edit.cardId);
            content = { results: args.edits.map((e) => ({ cardId: e.cardId, propertyId: e.propertyId, status: 'success' })) };
          }
          else if (name === 'list_cards') {
            const ids = args.cardIds?.length ? args.cardIds : [...(args.tagIds?.[0] === 'reference-id' ? referenceCards : properties.keys())];
            content = { content: 'Cards:\n' + ids.map(id => {
              const title = (id === CARD ? source : cardSources.get(id) || '# 测试文章').split('\n')[0].replace(/^# /, '');
              const stamp = stampFor(id);
              const meta = [stamp.created ? `created: ${stamp.created}` : '', stamp.updated ? `updated: ${stamp.updated}` : ''].filter(Boolean).join('; ');
              return `card ${JSON.stringify(title)} [${id}]${meta ? ` ${meta}` : ''}`;
            }).join('\n') };
          }
          else if (name === 'create_object') {
            const id = crypto.randomUUID(); cardSources.set(id, args.content); content = { objectId: id, url: `heptabase://card/${id}` };
          }
          else if (name === 'update_database_card_membership') {
            for (const id of args.cardIds) {
              if (args.tagId === 'reference-id') referenceCards.add(id);
              else if (!properties.has(id)) properties.set(id, {});
            }
            content = { affectedCardIds: args.cardIds, failedCardIds: [], invalidCardIds: [] };
          }
          else if (name === 'read_object') {
            if (missingCards.has(args.objectId)) return Response.json({ jsonrpc: '2.0', id: body.id, result: { isError: true, content: [{ type: 'text', text: 'The object was not found. Search for it again and reuse the returned object ID and type.' }] } });
            const lines = (args.objectId === CARD ? source : cardSources.get(args.objectId)).split('\n');
            const values = properties.get(args.objectId);
            const shown = values ? { 'Blog Type': 'Article', ...values } : null;
            const metadata = shown ? '--- Databases ---\n- tag "blog" [blog-id]\n' + Object.entries(shown).filter(([, v]) => v != null).map(([k, v]) => `  - ${JSON.stringify(k)}: ${JSON.stringify(v)}\n`).join('') : '';
            content = { content: `card "测试文章" [${args.objectId}] ${lines.length} lines\n` + metadata + lines.slice(args.offset, args.offset + args.limit).map((l, i) => `${args.offset + i + 1}\t${l}`).join('\n'), totalLines: lines.length, hasMore: args.offset + args.limit < lines.length };
          } else if (name === 'edit_object_content') {
            const old = args.objectId === CARD ? source : cardSources.get(args.objectId);
            if (!old?.includes(args.oldString)) return Response.json({ jsonrpc: '2.0', id: body.id, result: { isError: true } });
            if (args.objectId === CARD) source = old.replace(args.oldString, args.newString);
            else cardSources.set(args.objectId, old.replace(args.oldString, args.newString));
            content = { content: 'updated' };
          } else throw new Error(`Unexpected MCP tool: ${name}`);
          result = { structuredContent: { status: 'succeeded', ...content } };
        }
        return new Response(`event: message\ndata: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result })}\n\n`, { headers: { 'content-type': 'text/event-stream', 'mcp-session-id': 'test-session' } });
      }
    }
    const p = decodeURIComponent(url.pathname.replace('/repos/ethanchangit/ethanblog', ''));
    if (p === '/graphql') {
      const repository = {};
      for (const [, key, expression] of body.query.matchAll(/(f\d+): object\(expression:"([^"]+)"\)/g)) {
        const split = expression.indexOf(':'); const sha = expression.slice(0, split), path = expression.slice(split + 1);
        repository[key] = { text: blobs.get(filesFor(sha)[path]), isTruncated: false };
      }
      return Response.json({ data: { repository } });
    }
    if (p === '/pulls' && method === 'GET') return Response.json(pr && !pr.merged ? [{ ...pr, head: { ref: 'codex/studio-content', sha: refs.get('codex/studio-content') } }] : []);
    if (p === '/pulls' && method === 'POST') {
      if (dropPrOnce) { dropPrOnce = false; return Response.json({ message: 'temporary failure' }, { status: 502 }); }
      pr = { number: 1, html_url: 'https://github.com/ethanchangit/ethanblog/pull/1', merged: false };
      return Response.json(pr);
    }
    if (p === '/pulls/1/files') return Response.json(changedFiles());
    if (p === '/pulls/1') return Response.json(pr);
    if (p === '/pulls/1/merge') {
      if (body.sha !== refs.get('codex/studio-content')) return Response.json({ message: 'head moved' }, { status: 409 });
      const sha = commit(commits.get(body.sha).tree.sha, [refs.get('main'), body.sha]);
      refs.set('main', sha); pr = { ...pr, merged: true, merge_commit_sha: sha };
      return Response.json({ merged: true, sha });
    }
    if (p.includes('/actions/workflows/')) return Response.json({ workflow_runs: url.searchParams.get('event') === 'pull_request' ? [{ id: 2, run_number: 1, event: 'pull_request', head_sha: refs.get('codex/studio-content'), status: 'completed', conclusion: checksPass ? 'success' : 'failure', pull_requests: [{ number: 1, base: { sha: refs.get('main') } }] }] : [{ id: 3, head_sha: refs.get('main') }] });
    if (p === '/actions/runs/3') return Response.json({ head_sha: refs.get('main'), conclusion: 'success' });
    if (p.startsWith('/git/ref/heads/')) { const sha = refs.get(p.slice(15)); return Response.json(sha ? { object: { sha } } : { message: 'not found' }, { status: sha ? 200 : 404 }); }
    if (p === '/git/refs' && method === 'POST') {
      const ref = body.ref.replace('refs/heads/', '');
      if (refs.has(ref)) return Response.json({ message: 'already exists' }, { status: 422 });
      refs.set(ref, body.sha); return Response.json({ object: { sha: body.sha } });
    }
    if (p.startsWith('/git/refs/heads/') && method === 'PATCH') {
      const ref = p.slice(16), old = refs.get(ref);
      function ancestor(sha) { return sha === old || commits.get(sha).parents.some((x) => ancestor(x.sha)); }
      if (!ancestor(body.sha)) return Response.json({ message: 'not fast forward' }, { status: 422 });
      refs.set(ref, body.sha); return Response.json({ object: { sha: body.sha } });
    }
    if (p === '/git/blobs') return Response.json({ sha: blob(Buffer.from(body.content, 'base64').toString()) });
    if (p.startsWith('/git/blobs/')) return Response.json({ content: Buffer.from(blobs.get(p.slice(11))).toString('base64') });
    if (p === '/git/trees') {
      const next = { ...trees.get(body.base_tree) };
      for (const file of body.tree) { if (file.sha === null) delete next[file.path]; else next[file.path] = file.sha; }
      return Response.json({ sha: tree(next) });
    }
    if (p.startsWith('/git/trees/')) return Response.json({ tree: Object.entries(trees.get(p.slice(11))).map(([path, sha]) => ({ path, sha, type: 'blob' })) });
    if (p === '/git/commits') return Response.json({ sha: commit(body.tree, body.parents) });
    if (p.startsWith('/git/commits/')) return Response.json(commits.get(p.slice(13)));
    throw new Error(`Unexpected request: ${method} ${url}`);
  };
  let cookie = '';
  // Production host, so these calls still pass through the password. Loopback is covered separately.
  const origin = 'https://ethanchang.io';
  async function request(path, method = 'GET', body, headers = {}) {
    return handler(new Request(`${origin}/dashboard/api${path}`, { method, headers: { cookie, origin, 'content-type': 'application/json', ...headers }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }), env);
  }
  async function login() { const r = await request('/login', 'POST', { password: PASSWORD }); cookie = r.headers.get('set-cookie').split(';')[0]; return r; }
  async function connect() {
    const start = await (await request('/heptabase/connect', 'POST', {})).json();
    const state = new URL(start.url).searchParams.get('state');
    return request(`/heptabase/callback?state=${state}&code=test-code`);
  }
  return { DB, env, handler, fetcher, request, login, connect, calls, refs, filesFor, changedFiles, cardSources, properties, referenceCards, missingCards, timestamps,
    source: () => source, setSource: (text) => { source = text; },
    failChecks: () => { checksPass = false; }, deploy: () => { liveSha = refs.get('main'); },
    dropPr: () => { dropPrOnce = true; },
    remote(raw, path = PATH, branch = 'main') { const parent = refs.get(branch); refs.set(branch, commit(tree({ ...filesFor(parent), [path]: blob(raw) }), [parent])); },
    text(path, branch = 'codex/studio-content') { const sha = filesFor(refs.get(branch))[path]; return sha ? blobs.get(sha) : null; },
  };
}
