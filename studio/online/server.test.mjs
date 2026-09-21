import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fixture, article, PATH, LINK, CARD, PASSWORD } from './test-fixtures.mjs';
import { hash, passwordRecord } from './auth.mjs';
import { signReceipt } from './release-sync.mjs';
import { publicationDate } from './card-properties.mjs';
import { blogCards, readCard, toolResult } from './heptabase.mjs';
import { fromHeptabase } from './card-content.mjs';

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
async function setup() { const f = await fixture(); globalThis.fetch = f.fetcher; await f.login(); await f.connect(); return f; }
async function jsonOk(response) { const r = await response; const body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body; }
const input = { cardLink: LINK, collection: 'articles', id: 'example', preparePublish: true };
const preview = (f, extra = {}) => jsonOk(f.request('/heptabase/preview', 'POST', { ...input, ...extra }));
const selection = (plan, extra = {}) => ({ ...input, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, ...extra });
async function prepare(f, extra = {}) {
  const plan = await preview(f, extra);
  return jsonOk(f.request('/heptabase/apply', 'POST', selection(plan, { ...extra, confirmPublic: true, resolveConflict: true })));
}
const submit = (f) => jsonOk(f.request('/git/commit', 'POST', { message: '更新测试文章' }));
const gitWrites = f => f.calls.filter(c => c.url.startsWith('https://api.github.com') && c.method !== 'GET' && !c.url.endsWith('/graphql'));
const child = '9732c208-c3b1-4a7b-a922-0c3483475d6b';
const grandchild = '122560bd-b99f-4fb9-9fa5-742090feacb1';
const mention = (id, title) => `<hepta-mention type="card" id="${id}">${title}</hepta-mention>`;
function graph(f) {
  f.setSource(`# 主文\n\n${mention(child, '子文')}\n\n行内 ${mention(grandchild, '孙文')}。`);
  f.cardSources.set(child, `## 子文\n\n${mention(grandchild, '孙文')}`);
  f.cardSources.set(grandchild, `### 孙文\n\n${mention(CARD, '主文')}`);
}

test('Heptabase heading levels all supply a title without changing the remaining content', () => {
  for (let level = 1; level <= 6; level++) {
    const result = fromHeptabase(`${'#'.repeat(level)} 卡片标题\n\n正文。\n\n## 正文小节\n\n保留文字。`, new Map());
    assert.equal(result.title, '卡片标题');
    assert.equal(result.body, '正文。\n\n## 正文小节\n\n保留文字。');
  }
  assert.equal(fromHeptabase('## 卡片标题 ##\n\n正文。', new Map()).title, '卡片标题');
  for (const source of ['普通正文', '# ', '####### 非标题']) assert.throws(() => fromHeptabase(source, new Map()), /标题/);
});

test('an HTML response from Heptabase becomes an actionable error without leaking its page', async () => {
  const f = await setup();
  globalThis.fetch = async (url, options) => new URL(url).pathname === '/mcp'
    ? new Response('<!DOCTYPE html><html>upstream diagnostic data</html>', { headers: { 'content-type': 'text/html' } })
    : f.fetcher(url, options);
  const response = await f.request('/heptabase/cards');
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: 'Heptabase 返回了无法读取的数据，请稍后重新拉取。' });
});

test('public preview template is served at the directory URL used after deployment', async () => {
  const html = '<!doctype html><title>文章预览</title>';
  const f = await fixture({ 'preview.html': html });
  for (const path of ['/dashboard/preview/', '/dashboard/preview', '/dashboard/preview/index.html', '/dashboard/preview.html']) {
    const response = await f.handler(new Request(`https://ethanchang.io${path}`));
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.equal(await response.text(), html);
  }
});

test('password login cannot be replaced by ChatGPT headers; cookies, CSRF, logout and rotation', async () => {
  const f = await fixture(); globalThis.fetch = f.fetcher;
  assert.equal((await f.request('/docs', 'GET', undefined, { 'oai-authenticated-user-id': 'owner' })).status, 401);
  assert.equal((await f.request('/login', 'POST', { password: 'wrong' })).status, 401);
  const login = await f.login(); assert.match(login.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await f.request('/session')).status, 200);
  assert.equal((await f.request('/heptabase/apply', 'POST', {}, { origin: 'https://attacker.test' })).status, 403);
  await f.request('/logout', 'POST', {});
  assert.equal((await f.request('/session')).status, 401);
  await f.login(); f.env.STUDIO_PASSWORD_HASH = await passwordRecord(PASSWORD + '-changed');
  assert.equal((await f.request('/session')).status, 401);
  assert.equal(f.calls.length, 0);
});

test('rate limits guesses and rejects cross-origin login', async () => {
  const f = await fixture();
  assert.equal((await f.request('/login', 'POST', { password: PASSWORD }, { origin: 'https://attacker.test' })).status, 403);
  for (let i = 0; i < 10; i++) assert.equal((await f.request('/login', 'POST', { password: 'wrong' })).status, 401);
  assert.equal((await f.request('/login', 'POST', { password: PASSWORD })).status, 429);
});

test('publication-only dashboard has no editing, create, link, directory or tag editor APIs', async () => {
  const f = await setup();
  for (const [path, method] of [['/doc', 'PUT'], ['/create', 'POST'], ['/link', 'POST'], ['/blogs', 'PUT'], ['/tag-groups', 'PUT']]) {
    assert.equal((await f.request(path, method, {})).status, 404);
  }
  assert.equal((await f.request('/heptabase/preview', 'POST', { ...input, direction: 'push' })).status, 400);
  const docs = await jsonOk(f.request('/docs'));
  assert.equal(docs.articles[0].id, 'example');
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_drafts').get().n, 0);
});

test('Heptabase OAuth is session-bound and tokens are encrypted, never returned with card data', async () => {
  const f = await fixture(); globalThis.fetch = f.fetcher; await f.login();
  assert.equal((await jsonOk(f.request('/heptabase/status'))).connected, false);
  const start = await jsonOk(f.request('/heptabase/connect', 'POST', {}));
  await f.request('/logout', 'POST', {}); await f.login();
  assert.equal((await f.request(`/heptabase/callback?state=${new URL(start.url).searchParams.get('state')}&code=x`)).status, 400);
  assert.equal((await f.connect()).status, 303);
  assert.equal((await jsonOk(f.request('/heptabase/status'))).connected, true);
  assert.ok(!JSON.stringify(f.DB.sqlite.prepare('SELECT value FROM studio_connections').all()).includes('private-access-token'));
  f.properties.get(CARD).Status = 'review';
  const cards = await jsonOk(f.request('/heptabase/cards'));
  assert.equal(cards.cards[0].linked[0].id, 'example');
  assert.ok(!JSON.stringify(cards).includes('private-access-token'));
});

test('pull removes English copies, preserves metadata and does not touch GitHub or Heptabase text', async () => {
  const f = await setup(); const before = f.refs.get('main');
  const doc = await prepare(f, { preparePublish: false });
  assert.equal(doc.bodyEn, undefined); assert.ok(!doc.raw.includes('English body.'));
  assert.equal(doc.frontmatter.customField, '保留字段'); assert.equal(doc.frontmatter.draft, true);
  assert.equal(doc.bodyZh, '来自 Heptabase 的正文。');
  assert.equal(f.refs.get('main'), before); assert.equal(gitWrites(f).length, 0);
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'edit_object_content').length, 0);
  assert.equal((await f.request('/git/commit', 'POST', { message: '更新' })).status, 409);
});

test('status mapping, existing publication date and tags follow the database', async () => {
  const f = await setup();
  for (const status of ['new', 'writing', 'block', 'published']) {
    f.properties.set(CARD, { Status: status, 'Publish Date': { start: '2024-02-01T00:00:00.000Z' }, Tag: ['Mission', 'AI Native'] });
    const doc = await prepare(f, { preparePublish: false });
    assert.equal(Boolean(doc.frontmatter.draft), status !== 'published');
    assert.equal(doc.frontmatter.date, '2024-02-01'); assert.equal(doc.frontmatter.heptabaseStatus, status);
    assert.deepEqual(doc.frontmatter.tags, ['AI Native', 'Mission']);
  }
});

test('privacy confirmation and exact preview are required before saving', async () => {
  const f = await setup(); const plan = await preview(f);
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan))).status, 409);
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan, { confirmPublic: true, planHash: 'wrong' }))).status, 409);
  f.setSource('# 修改后\n\n不能套用旧的审查。');
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan, { confirmPublic: true }))).status, 409);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_drafts').get().n, 0);
  assert.equal(gitWrites(f).length, 0);
});

test('prepare-publish cannot be smuggled into a draft preview', async () => {
  const f = await setup(); const plan = await preview(f, { preparePublish: false });
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan, { confirmPublic: true }))).status, 409);
});

test('recursive mentions deduplicate cycles; only non-blog cards receive the reference tag', async () => {
  const f = await setup(); graph(f);
  f.properties.set(child, { Status: 'writing', Tag: ['Mission'] });
  const plan = await preview(f);
  assert.equal(plan.references.length, 2); assert.match(plan.next, /DocList pane="embed"/); assert.match(plan.next, /data-doc-mention/);
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan, { confirmPublic: true }))).status, 409);
  const marked = await jsonOk(f.request('/heptabase/mark-references', 'POST', selection(plan)));
  assert.equal(marked.marked, 1); assert.deepEqual([...f.referenceCards], [grandchild]);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_reviews').get().n, 0);
  await prepare(f);
  const read = id => jsonOk(f.request(`/doc?collection=articles&id=${id}`));
  const reference = await read(`hepta-${grandchild}`), mainChild = await read(`hepta-${child}`);
  assert.equal(reference.frontmatter.listed, false); assert.equal(reference.frontmatter.draft, undefined);
  assert.equal(mainChild.frontmatter.listed, true); assert.match(reference.bodyZh, /articles\/example/);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_drafts').get().n, 3);
  await submit(f);
});

test('reference tags alone are not consent, and failed or stale tagging cannot prepare publication', async () => {
  const f = await setup(); graph(f); const plan = await preview(f);
  f.referenceCards.add(child); f.referenceCards.add(grandchild);
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan))).status, 409);
  f.cardSources.set(child, '# 已变化\n\n私人资料');
  assert.equal((await f.request('/heptabase/mark-references', 'POST', selection(plan))).status, 409);
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'update_database_card_membership').length, 0);
});

test('approved source, properties, graph, raw snapshot and reference tags are rechecked before any GitHub upload', async () => {
  for (const change of ['source', 'properties', 'reference', 'raw', 'tag']) {
    const f = await setup(); graph(f); f.referenceCards.add(child); f.referenceCards.add(grandchild); await prepare(f);
    if (change === 'source') f.setSource('# 更新\n\n私人信息');
    if (change === 'properties') f.properties.get(CARD).Tag = ['Mission'];
    if (change === 'reference') f.cardSources.set(grandchild, '# 新引用\n\n私人信息');
    if (change === 'raw') f.DB.sqlite.prepare('UPDATE studio_drafts SET raw = raw || ? WHERE path = ?').run('\n私人信息', PATH);
    if (change === 'tag') f.referenceCards.delete(grandchild);
    const response = await f.request('/git/commit', 'POST', { message: '更新' });
    assert.equal(response.status, 409, change); assert.equal(gitWrites(f).length, 0, change);
  }
});

test('reviewed snapshots persist, reject stale reviews, retain history and roll back failed batches', async () => {
  const f = await setup(); await prepare(f); const plan = await preview(f);
  await prepare(f);
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan, { confirmPublic: true }))).status, 200);
  // Unchanged content can be reviewed again; a changed snapshot cannot.
  f.setSource('# 新版\n\n新正文'); await prepare(f);
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(plan, { confirmPublic: true }))).status, 409);
  const before = f.DB.sqlite.prepare('SELECT raw FROM studio_drafts WHERE path = ?').get(PATH).raw;
  f.setSource('# 再一版\n\n整批应回滚');
  f.DB.sqlite.exec("CREATE TRIGGER fail_review BEFORE UPDATE ON studio_reviews BEGIN SELECT RAISE(ABORT, 'test rollback'); END");
  const next = await preview(f);
  assert.equal((await f.request('/heptabase/apply', 'POST', selection(next, { confirmPublic: true }))).status, 500);
  assert.equal(f.DB.sqlite.prepare('SELECT raw FROM studio_drafts WHERE path = ?').get(PATH).raw, before);
  assert.ok(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_draft_history').get().n > 0);
});

test('submit never overwrites changes made directly in GitHub or leaks content in conflict errors', async () => {
  const f = await setup(); await prepare(f); f.remote(article.replace('中文正文。', '别人更新。'));
  const response = await f.request('/git/commit', 'POST', { message: '更新' });
  assert.equal(response.status, 409); assert.ok(!(await response.text()).includes('来自 Heptabase 的正文'));
  assert.equal(gitWrites(f).length, 0);
});

test('required and one-to-one card link is enforced even for corrupted stored snapshots', async () => {
  const f = await setup(); await prepare(f);
  const row = f.DB.sqlite.prepare('SELECT raw FROM studio_drafts WHERE path = ?').get(PATH);
  f.DB.sqlite.prepare('UPDATE studio_drafts SET raw = ? WHERE path = ?').run(row.raw.replace(/^heptabaseCardLink:.*\n/m, ''), PATH);
  assert.equal((await f.request('/git/commit', 'POST', { message: '更新' })).status, 400);
  assert.equal(gitWrites(f).length, 0);
  f.remote(article, 'src/content/articles/duplicate.mdx');
  assert.equal((await f.request('/heptabase/preview', 'POST', input)).status, 400);
});

test('submission creates only a PR; publish needs exact review, trusted checks and fresh private-source review', async () => {
  const f = await setup(); const main = f.refs.get('main'); await prepare(f); const result = await submit(f);
  assert.equal(f.refs.get('main'), main); assert.ok(result.pullRequest.url);
  assert.equal((await jsonOk(f.request('/git'))).dirty, false);
  const review = await jsonOk(f.request('/git/review')); assert.equal(review.changes[0].path, PATH);
  assert.equal((await f.request('/git/publish', 'POST', { ...review, commitSha: 'outdated' })).status, 409);
  f.setSource('# 审查后变化\n\n不能继续合并');
  assert.equal((await f.request('/git/publish', 'POST', review)).status, 409);
  f.failChecks(); assert.equal((await f.request('/git/publish', 'POST', review)).status, 409);
  assert.equal(f.refs.get('main'), main);
});

test('merge is not published until Actions and live version match; next release starts from main', async () => {
  const f = await setup(); await prepare(f); await submit(f);
  const review = await jsonOk(f.request('/git/review'));
  const merged = await jsonOk(f.request('/git/publish', 'POST', review));
  assert.notEqual(merged.release.status, 'succeeded'); assert.notEqual(f.refs.get('main'), review.baseSha);
  f.deploy(); assert.equal((await jsonOk(f.request('/git'))).release.status, 'succeeded');
  assert.equal((await jsonOk(f.request('/git/publish', 'POST', review))).release.id, merged.release.id);
  assert.equal(f.calls.filter(c => c.url.endsWith('/merge')).length, 1);
  f.setSource('# 测试文章\n\n下一版'); await prepare(f); await submit(f);
});

test('lost PR response is retryable without another commit or lost reviewed snapshot', async () => {
  const f = await setup(); await prepare(f); f.dropPr();
  assert.equal((await f.request('/git/commit', 'POST', { message: '更新' })).status, 502);
  const created = f.refs.get('codex/studio-content');
  const result = await submit(f); assert.equal(result.commitSha, created);
  assert.equal(f.calls.filter(c => c.method === 'POST' && c.url.endsWith('/git/commits')).length, 1);
});

test('verified publication writes status and first date only; receipt is authenticated and expiring', async () => {
  const f = await setup(); await prepare(f); await submit(f);
  await jsonOk(f.request('/git/publish', 'POST', await jsonOk(f.request('/git/review'))));
  assert.equal(f.properties.get(CARD).Status, 'new');
  const payload = JSON.stringify({ commitSha: f.refs.get('main'), timestamp: Date.now() });
  const receipt = signature => f.handler(new Request('https://ethanchang.io/dashboard/api/deployed', { method: 'POST', body: payload, headers: { 'x-studio-signature': signature } }), f.env);
  assert.equal((await receipt('0'.repeat(64))).status, 403);
  const signature = await signReceipt(f.env.STUDIO_SECRET, payload); assert.equal((await receipt(signature)).status, 409);
  f.deploy(); await jsonOk(receipt(signature));
  assert.equal(f.properties.get(CARD).Status, 'published');
  assert.equal(f.properties.get(CARD)['Publish Date'].start.slice(0, 10), publicationDate());
  f.properties.get(CARD)['Publish Date'] = { start: '2025-02-03T00:00:00.000Z' };
  await jsonOk(receipt(signature)); assert.equal(f.properties.get(CARD)['Publish Date'].start, '2025-02-03T00:00:00.000Z');
  const expired = JSON.stringify({ commitSha: f.refs.get('main'), timestamp: 1 });
  assert.equal((await f.handler(new Request('https://ethanchang.io/dashboard/api/deployed', { method: 'POST', body: expired, headers: { 'x-studio-signature': await signReceipt(f.env.STUDIO_SECRET, expired) } }), f.env)).status, 403);
  assert.equal(publicationDate(new Date('2026-09-20T21:30:00Z')), '2026-09-21');
});

test('writeback respects pre-existing dates and concurrent status edits', async () => {
  const f = await setup(); f.properties.get(CARD)['Publish Date'] = { start: '2024-02-01T00:00:00.000Z' };
  await prepare(f); await submit(f); await jsonOk(f.request('/git/publish', 'POST', await jsonOk(f.request('/git/review'))));
  f.properties.get(CARD).Status = 'block'; f.deploy();
  const result = await jsonOk(f.request('/git'));
  assert.equal(result.release.status, 'succeeded'); assert.equal(result.release.heptabase.pending, 1);
  assert.equal(f.properties.get(CARD).Status, 'block'); assert.equal(f.properties.get(CARD)['Publish Date'].start, '2024-02-01T00:00:00.000Z');
});

test('first association exports one existing page and retries without creating duplicate cards', async () => {
  const f = await setup(); const raw = article.replace(`heptabaseCardLink: ${LINK}\n`, ''); f.remote(raw);
  const request = { collection: 'articles', id: 'example', documentHash: await hash(raw) };
  const doc = await jsonOk(f.request('/heptabase/export', 'POST', request));
  const id = doc.frontmatter.heptabaseCardLink.split('/').pop();
  assert.equal(f.properties.get(id).Status, 'writing'); assert.equal(f.properties.get(id)['Blog Type'], 'Blog'); assert.match(f.cardSources.get(id), /中文正文。/);
  await jsonOk(f.request('/heptabase/export', 'POST', request));
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'create_object').length, 1);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_reviews').get().n, 0);
});

test('unknown card-creation outcome and unknown tag options cannot silently duplicate or lose data', async () => {
  const f = await setup(); const raw = article.replace(`heptabaseCardLink: ${LINK}\n`, ''); f.remote(raw);
  f.DB.sqlite.prepare('INSERT INTO studio_card_exports (path, source, started_at) VALUES (?, ?, ?)').run(PATH, raw, new Date().toISOString());
  assert.equal((await f.request('/heptabase/export', 'POST', { collection: 'articles', id: 'example', documentHash: await hash(raw) })).status, 409);
  f.remote(raw.replace('customField:', 'tags: [未知标签]\ncustomField:'));
  const doc = await jsonOk(f.request('/doc?collection=articles&id=example'));
  assert.equal((await f.request('/heptabase/export', 'POST', { collection: 'articles', id: 'example', documentHash: await hash(doc.raw) })).status, 400);
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'create_object').length, 0);
});

test('protected regions stop sync without silently losing or executing content', async () => {
  const f = await setup(); f.setSource('# 标题\n\n<hepta-embed id="private" />');
  assert.equal((await f.request('/heptabase/preview', 'POST', input)).status, 400);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_drafts').get().n, 0);
});

test('Blog Type routes a card to articles or projects and is stored when creating one', async () => {
  const f = await setup();
  f.properties.get(CARD)['Blog Type'] = 'Project';
  const denied = await f.request('/heptabase/preview', 'POST', input);
  assert.equal(denied.status, 400);
  assert.match((await denied.json()).error, /Project/);
  f.remote(article.replace(`heptabaseCardLink: ${LINK}\n`, ''));
  const plan = await jsonOk(f.request('/heptabase/preview', 'POST', { cardLink: LINK, preparePublish: true }));
  assert.equal(plan.changes[0].path, `src/content/projects/hepta-${CARD}.mdx`);
  assert.equal(plan.changes[0].afterProperties.slot, 'project');
  f.properties.get(CARD)['Blog Type'] = null;
  assert.equal((await f.request('/heptabase/preview', 'POST', { cardLink: LINK, preparePublish: true })).status, 400);
  const project = '---\nslot: project\ntitle: 旧项目\ndescription: 摘要\nstatus: active\n---\n\n项目正文。\n';
  f.remote(project, 'src/content/projects/legacy.mdx');
  const raw = (await jsonOk(f.request('/doc?collection=projects&id=legacy'))).raw;
  const doc = await jsonOk(f.request('/heptabase/export', 'POST', { collection: 'projects', id: 'legacy', documentHash: await hash(raw) }));
  const id = doc.frontmatter.heptabaseCardLink.split('/').pop();
  assert.equal(f.properties.get(id)['Blog Type'], 'Project');
  assert.equal(doc.frontmatter.slot, 'project');
});

test('MCP pagination reads every numbered line and rejects incomplete lists', async () => {
  const full = Array.from({ length: 451 }, (_, i) => `line ${i + 1}`);
  const client = { async call(name, args) { return { content: full.slice(args.offset, args.offset + 200).map((line, i) => `${args.offset + i + 1}\t${line}`).join('\n'), totalLines: full.length, hasMore: args.offset + 200 < full.length }; } };
  assert.equal(await readCard(client, 'card'), full.join('\n'));
  await assert.rejects(() => blogCards({ call: async (name) => ({ content: name === 'list_tags' ? '<tag id="blog" name="blog" cardCount="2" />' : '' }) }), /数量/);
  const blog = 'dba5b41b-67a4-4ca5-a794-2fae3dc51786', ref = '87e9b69a-a568-4d28-bc82-24b7586cd70b', card = '6353c916-e0a9-4a0d-aa07-7a3512b72e92';
  const calls = [];
  const listed = await blogCards({ call: async (name, args) => {
    calls.push(args);
    return { content: name === 'list_tags' ? `tag "blog" [${blog}] cards: 1\ntag "blog-reference" [${ref}] cards: 0` : `card "标题" [${card}] created: 2026-09-14` };
  } });
  assert.equal(listed.tagId, blog);
  assert.equal(listed.cards[0].title, '标题');
  assert.equal(calls[0].nameFilter, undefined);
  assert.equal(calls[0].limit, 100);
  assert.throws(() => toolResult({ isError: true, content: [] }), /未能/);
});
