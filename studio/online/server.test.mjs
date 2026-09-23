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

test('loopback dev open skips the password; production and string flags do not', async () => {
  const f = await fixture();
  f.env.STUDIO_DEV_OPEN = true;
  const open = await f.handler(new Request('http://127.0.0.1:4321/dashboard/api/session'), f.env);
  assert.equal(open.status, 200);
  assert.equal((await open.json()).localOpen, true);
  assert.equal((await f.handler(new Request('https://ethanchang.io/dashboard/api/session'), f.env)).status, 401);
  f.env.STUDIO_DEV_OPEN = 'true';
  assert.equal((await f.handler(new Request('http://127.0.0.1:4321/dashboard/api/session'), f.env)).status, 401);
  delete f.env.STUDIO_DEV_OPEN;
  assert.equal((await f.handler(new Request('http://localhost:4321/dashboard/api/session'), f.env)).status, 401);
});

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
  assert.equal(marked.marked, 1); assert.equal(f.properties.get(grandchild)['Blog Type'], 'Reference');
  assert.equal(f.properties.get(child)?.['Blog Type'], undefined);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) AS n FROM studio_reviews').get().n, 0);
  await prepare(f);
  const read = id => jsonOk(f.request(`/doc?collection=articles&id=${id}`));
  const reference = await read(`hepta-${grandchild}`), mainChild = await read(`hepta-${child}`);
  assert.equal(reference.frontmatter.listed, false); assert.equal(reference.frontmatter.heptabaseType, 'reference'); assert.equal(reference.frontmatter.draft, undefined);
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
    const f = await setup(); graph(f);
    f.properties.set(child, { 'Blog Type': 'Reference' }); f.properties.set(grandchild, { 'Blog Type': 'Reference' });
    await prepare(f);
    if (change === 'source') f.setSource('# 更新\n\n私人信息');
    if (change === 'properties') f.properties.get(CARD).Tag = ['Mission'];
    if (change === 'reference') f.cardSources.set(grandchild, '# 新引用\n\n私人信息');
    if (change === 'raw') f.DB.sqlite.prepare('UPDATE studio_drafts SET raw = raw || ? WHERE path = ?').run('\n私人信息', PATH);
    if (change === 'tag') f.properties.delete(grandchild);
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
  assert.equal(f.properties.get(CARD)['Publish Date'], undefined);
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
  assert.equal(f.properties.get(id).Status, 'writing'); assert.equal(f.properties.get(id)['Blog Type'], 'Article'); assert.match(f.cardSources.get(id), /中文正文。/);
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

test('Page cards scale to their own address and do not replace a taken canonical page', async () => {
  const f = await setup();
  const fresh = '122560bd-b99f-4fb9-9fa5-742090feacb1';
  f.properties.set(fresh, { Status: 'review', 'Blog Type': 'Page' });
  f.cardSources.set(fresh, '# 读书笔记\n\n这是一张新的站点页。');
  const plan = await jsonOk(f.request('/heptabase/preview', 'POST', { cardLink: `heptabase://card/${fresh}`, preparePublish: true, reviewOnly: true }));
  assert.equal(plan.changes[0].path, `src/content/pages/hepta-${fresh}.mdx`);
  assert.equal(plan.pageChoiceRequired, false);
  assert.match(plan.pageNote, /最多显示 4 页/);
  assert.match(plan.pageNote, /不需要挑选/);
  assert.match(plan.pageNote, /没有上限/);
  assert.match(plan.pageNote, new RegExp(`/pages/hepta-${fresh}`));
  assert.equal(plan.changes[0].afterProperties.date, '2026-09-21');
  assert.equal(plan.changes[0].afterProperties.created, '2026-09-21T00:00:00Z');
  f.remote(`---\nslot: page\ntitle: 关于\ndescription: 关于\nheptabaseCardLink: heptabase://card/${CARD}\n---\n\n正文。\n`, 'src/content/pages/about.mdx');
  f.cardSources.set(CARD, '# 关于\n\n旧的关于。');
  f.properties.set(CARD, { Status: 'published', 'Blog Type': 'Page', 'Publish Date': { start: '2024-02-01T00:00:00.000Z' } });
  f.cardSources.set(fresh, '# 关于\n\n另一张关于。');
  const second = await jsonOk(f.request('/heptabase/preview', 'POST', { cardLink: `heptabase://card/${fresh}`, preparePublish: true, reviewOnly: true }));
  assert.equal(second.changes[0].path, `src/content/pages/hepta-${fresh}.mdx`);
  assert.match(second.pageNote, /已经连着另一张卡片/);
  assert.match(second.pageNote, /不会替换或丢掉/);
  f.timestamps.set(fresh, { created: '', updated: '' });
  f.properties.set(fresh, { Status: 'review', 'Blog Type': 'Page' });
  f.cardSources.set(fresh, '# 无日期\n\n卡片没有创建时间。');
  const invented = await jsonOk(f.request('/heptabase/preview', 'POST', { cardLink: `heptabase://card/${fresh}`, preparePublish: true, reviewOnly: true }));
  assert.equal(invented.changes[0].afterProperties.date, publicationDate());
  assert.equal(invented.changes[0].afterProperties.created, undefined);
});

test('more than four page cards require a choice and do not drop the extras', async () => {
  const f = await setup();
  const kept = [
    ['11111111-1111-4111-8111-111111111111', '关于', 'about'],
    ['22222222-2222-4222-8222-222222222222', 'Now', 'now'],
    ['33333333-3333-4333-8333-333333333333', '联系', 'contact'],
  ];
  const dropped = ['44444444-4444-4444-8444-444444444444', '隐私', 'privacy'];
  const fresh = '55555555-5555-4555-8555-555555555555';
  for (const [id, title, slug] of [...kept, dropped]) {
    f.properties.set(id, { Status: 'published', 'Blog Type': 'Page', 'Publish Date': { start: '2026-09-21T00:00:00.000Z' } });
    f.cardSources.set(id, `# ${title}\n\n${title}页。`);
    f.remote(`---\nslot: page\ntitle: ${title}\ndescription: ${title}\ndate: 2026-09-21\nheptabaseCardLink: heptabase://card/${id}\n---\n\n${title}页。\n`, `src/content/pages/${slug}.mdx`);
  }
  f.properties.set(fresh, { Status: 'review', 'Blog Type': 'Page' });
  f.cardSources.set(fresh, '# 读书笔记\n\n新的站点页。');
  f.properties.set('66666666-6666-4666-8666-666666666666', { Status: 'published', 'Blog Type': 'Reference' });
  f.cardSources.set('66666666-6666-4666-8666-666666666666', '# 参考\n\n不是站点页。');
  const listed = await jsonOk(f.request('/heptabase/cards'));
  assert.equal(listed.pageSet.cap, 4);
  assert.equal(listed.pageSet.choiceRequired, true);
  assert.equal(listed.pageSet.cards.length, 5);
  assert.equal(listed.pageSet.cards.some(card => card.id.startsWith('6666')), false);
  const plan = await jsonOk(f.request('/heptabase/preview', 'POST', { cardLink: `heptabase://card/${fresh}`, preparePublish: true, reviewOnly: true }));
  assert.equal(plan.pageChoiceRequired, true);
  assert.match(plan.pageNote, /最多显示 4 页/);
  assert.match(plan.pageNote, /选择留下哪几页/);
  assert.equal(plan.changes[0].afterProperties.date, '2026-09-21');
  assert.equal(plan.changes[0].afterProperties.created, '2026-09-21T00:00:00Z');
  const blocked = await f.request('/heptabase/decision', 'POST', { cardLink: `heptabase://card/${fresh}`, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true, resolveConflict: true });
  assert.equal(blocked.status, 409);
  assert.match((await blocked.json()).error, /请先在审核清单里选择留下哪几页/);
  const tooMany = await f.request('/heptabase/page-choice', 'POST', { keep: [...kept.map(([id]) => id), dropped[0], fresh] });
  assert.equal(tooMany.status, 400);
  assert.match((await tooMany.json()).error, /最多留下 4 页/);
  const choice = await jsonOk(f.request('/heptabase/page-choice', 'POST', { keep: [...kept.map(([id]) => id), fresh] }));
  assert.deepEqual(choice.keep, [...kept.map(([id]) => id), fresh].sort());
  assert.equal(choice.removals.length, 1);
  assert.equal(choice.removals[0].title, '隐私');
  assert.equal(f.properties.has(dropped[0]), true);
  const removal = await jsonOk(f.request('/heptabase/removal-preview', 'POST', { collection: 'pages', id: 'privacy', cardLink: `heptabase://card/${dropped[0]}` }));
  assert.equal(removal.reason, 'capped');
  const again = await jsonOk(f.request('/heptabase/preview', 'POST', { cardLink: `heptabase://card/${fresh}`, preparePublish: true, reviewOnly: true }));
  await jsonOk(f.request('/heptabase/decision', 'POST', { cardLink: `heptabase://card/${fresh}`, sourceHash: again.sourceHash, documentHash: again.documentHash, planHash: again.planHash, decision: 'approve', confirmPublic: true, resolveConflict: true }));
  assert.equal(f.properties.get(fresh)['Publish Date'], undefined);
  await jsonOk(f.request('/git/commit', 'POST', { message: '留下四页' }));
  const files = f.filesFor(f.refs.get('codex/studio-content'));
  assert.equal(files['src/content/pages/privacy.mdx'], undefined);
  assert.equal(['about', 'now', 'contact'].every(slug => Boolean(files[`src/content/pages/${slug}.mdx`])), true);
  const doc = await jsonOk(f.request(`/doc?collection=pages&id=hepta-${fresh}`));
  assert.match(doc.raw, /读书笔记/);
  assert.match(doc.raw, /2026-09-21/);
  assert.match(doc.raw, /created: "2026-09-21T00:00:00Z"/);
  assert.equal((await f.request('/doc?collection=pages&id=privacy')).status, 404);
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
  assert.throws(() => toolResult({ isError: true, content: [{ type: 'text', text: 'The object was not found.' }] }), (error) => error.heptabaseReason === 'objectNotFound');
});

test('summary fills the preview slot and an empty summary does not copy the first paragraph', async () => {
  const f = await setup();
  f.properties.get(CARD).Summary = '局部最优是搜索问题，不是选择问题。';
  f.setSource('# 标题\n\n第一段不该变成摘要。');
  const filled = await preview(f);
  assert.match(filled.next, /description: "局部最优是搜索问题，不是选择问题。"/);
  assert.doesNotMatch(filled.next, /description: "第一段不该变成摘要。"/);
  f.properties.get(CARD).Summary = '   ';
  const empty = await preview(f);
  assert.match(empty.next, /description: ""/);
  assert.match(empty.next, /第一段不该变成摘要。/);
  assert.equal(empty.changes[0].afterProperties.date, '2026-09-21');
});

test('a deleted card is listed for removal and is not republished', async () => {
  const f = await setup();
  const id = 'ea84aa8e-dac4-46cb-91d1-1b10dc5350c0';
  f.remote(`---\nslot: article\ntitle: 占位 2025-01\ndescription: 摘要\ndate: 2025-01-01\nheptabaseCardLink: heptabase://card/${id}\n---\n\n占位。\n`, 'src/content/articles/dummy-2025-01.mdx');
  f.missingCards.add(id);
  const listed = await jsonOk(f.request('/heptabase/cards'));
  assert.equal(listed.cards.some((card) => card.id === id), false);
  assert.equal(listed.removals.find((item) => item.id === 'dummy-2025-01').reason, 'deleted');
  assert.equal((await f.request('/heptabase/preview', 'POST', { cardLink: `heptabase://card/${id}`, preparePublish: true })).status, 400);
});

test('a large tag database is read in batches instead of one subrequest per card', async () => {
  const f = await setup();
  for (let i = 0; i < 40; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    f.properties.set(id, { Status: 'published', 'Blog Type': 'Article' });
    f.cardSources.set(id, `# 卡片 ${i}\n\n正文`);
  }
  const first = await jsonOk(f.request('/heptabase/cards'));
  assert.equal(first.partial, true);
  assert.equal(first.scanned, 20);
  const reads = f.calls.filter((call) => call.body?.params?.name === 'read_object').length;
  assert.ok(reads <= 20, String(reads));
  let payload = first, guard = 0;
  while (payload.partial) {
    assert.ok(++guard < 8);
    payload = await jsonOk(f.request('/heptabase/cards'));
  }
  assert.equal(payload.cards.some((card) => card.id === CARD), false);
  assert.equal(payload.pageSet.cap, 4);
});

const readObjects = (f) => f.calls.filter((call) => call.body?.params?.name === 'read_object');

test('later pulls reuse unchanged cards, refetch edited ones, and do not recreate deleted cards', async () => {
  const f = await setup();
  f.properties.get(CARD).Status = 'review';
  f.properties.get(CARD)['Blog Type'] = 'Article';
  const first = await preview(f);
  assert.match(first.next, /来自 Heptabase 的正文/);
  const stored = f.DB.sqlite.prepare('SELECT edited_at, source FROM studio_card_pulls WHERE card_id = ?').get(CARD);
  assert.equal(stored.edited_at, '2026-09-21T00:00:00Z');
  assert.match(stored.source, /来自 Heptabase 的正文/);
  f.calls.length = 0;
  const again = await preview(f);
  assert.equal(again.next, first.next);
  assert.equal(readObjects(f).length, 0);
  assert.ok(f.calls.some((call) => call.body?.params?.name === 'list_cards'));
  await f.login();
  f.calls.length = 0;
  const listed = await jsonOk(f.request('/heptabase/cards'));
  assert.deepEqual(listed.cards.map((card) => card.id), [CARD]);
  assert.equal(readObjects(f).length, 0);

  f.timestamps.set(CARD, { created: '2026-09-21T00:00:00Z', updated: '2026-09-23T01:00:00Z' });
  f.setSource('# 测试文章\n\n只改这一篇。');
  f.calls.length = 0;
  const changed = await preview(f);
  assert.match(changed.next, /只改这一篇/);
  assert.ok(readObjects(f).some((call) => call.body.params.arguments.objectId === CARD));

  const removed = 'ea84aa8e-dac4-46cb-91d1-1b10dc5350c0';
  f.remote(`---\nslot: article\ntitle: 已删除\ndescription: 摘要\ndate: 2025-01-01\nheptabaseCardLink: heptabase://card/${removed}\n---\n\n占位。\n`, 'src/content/articles/removed-card.mdx');
  f.missingCards.add(removed);
  f.DB.sqlite.prepare('INSERT INTO studio_card_pulls (card_id, edited_at, properties, source, card_created, pulled_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    removed, '2026-09-21T00:00:00Z', JSON.stringify({ member: true, status: 'review', date: null, tags: [], type: 'article', summary: '' }),
    '# 已删除\n\n不该复活。', '2026-09-21T00:00:00Z', '2026-09-23T00:00:00.000Z');
  const afterDelete = await jsonOk(f.request('/heptabase/cards'));
  assert.equal(afterDelete.cards.some((card) => card.id === removed), false);
  assert.equal(afterDelete.removals.find((item) => item.id === 'removed-card').reason, 'deleted');
  assert.equal((await f.request('/heptabase/preview', 'POST', { cardLink: `heptabase://card/${removed}`, preparePublish: true })).status, 400);
});

test('a second large pull still lists every card, skips unchanged bodies, and batches the ones that changed', async () => {
  const f = await setup();
  const ids = [];
  for (let i = 0; i < 40; i++) {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    ids.push(id);
    f.properties.set(id, { Status: 'published', 'Blog Type': 'Article' });
    f.cardSources.set(id, `# 卡片 ${i}\n\n正文`);
  }
  let payload = await jsonOk(f.request('/heptabase/cards')), guard = 0;
  while (payload.partial) {
    assert.ok(++guard < 8);
    payload = await jsonOk(f.request('/heptabase/cards'));
  }
  const pages = payload.pageSet.cards.map((card) => card.id);
  f.calls.length = 0;
  let again = await jsonOk(f.request('/heptabase/cards')), hops = 0;
  while (again.partial) {
    assert.ok(++hops < 4);
    again = await jsonOk(f.request('/heptabase/cards'));
  }
  assert.equal(readObjects(f).length, 0);
  assert.ok(f.calls.some((call) => call.body?.params?.name === 'list_cards'));
  assert.deepEqual(again.pageSet.cards.map((card) => card.id), pages);
  const changed = ids.slice(0, 25);
  for (const id of changed) f.timestamps.set(id, { created: '2026-09-21T00:00:00Z', updated: '2026-09-23T00:00:00Z' });
  f.calls.length = 0;
  const next = await jsonOk(f.request('/heptabase/cards'));
  assert.equal(next.partial, true);
  const reread = readObjects(f).map((call) => call.body.params.arguments.objectId);
  assert.ok(reread.length > 0 && reread.length <= 20, String(reread.length));
  assert.ok(reread.every((id) => changed.includes(id)));
});
