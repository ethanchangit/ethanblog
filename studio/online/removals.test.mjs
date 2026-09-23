import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fixture, CARD, LINK, PATH } from './test-fixtures.mjs';
import { serializeMdx } from '../core.mjs';
import { BLOG_INDEX, removalScope, withoutIndexRefs } from './removals.mjs';

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
const REF = '9732c208-c3b1-4a7b-a922-0c3483475d6b', SHARED = '122560bd-b99f-4fb9-9fa5-742090feacb1', OTHER = '34adea15-b8fa-49a2-9e90-922a661d7790';
const refPath = id => `src/content/articles/hepta-${id}.mdx`;
const docRef = id => `<DocRef of="articles/hepta-${id}" />`;
const raw = (id, title, body, listed = true) => serializeMdx({ frontmatter: { slot: 'article', title, description: '摘要', date: '2024-01-02', listed, heptabaseCardLink: `heptabase://card/${id}` }, bodyZh: body });
const input = { collection: 'articles', id: 'example', cardLink: LINK };
async function ok(response) { const r = await response, data = await r.json(); assert.equal(r.status, 200, JSON.stringify(data)); return data; }
async function setup(deleted = false) {
  const f = await fixture(); globalThis.fetch = f.fetcher; await f.login(); await f.connect();
  f.remote(raw(CARD, '即将撤下的文章', '原有正文。'));
  f.remote('---\nslot: page\ntitle: 博客\n---\n\n<DocList>\n  <DocRef of="articles/example" />\n</DocList>\n', BLOG_INDEX);
  f.properties.delete(CARD); if (deleted) f.missingCards.add(CARD);
  return f;
}
const preview = f => ok(f.request('/heptabase/removal-preview', 'POST', input));
const approve = (f, plan, extra = {}) => f.request('/heptabase/removal', 'POST', { ...input, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, confirmDelete: true, ...extra });
const commit = f => ok(f.request('/git/commit', 'POST', { message: '撤下已移除的文章' }));
const writes = f => f.calls.filter(c => c.url.startsWith('https://api.github.com') && c.method !== 'GET' && !c.url.endsWith('/graphql'));
async function approveOther(f) {
  f.properties.set(OTHER, { Status: 'review', Tag: ['Mission'] }); f.cardSources.set(OTHER, '# 新文章\n\n新文章的正文。');
  const other = { cardLink: `heptabase://card/${OTHER}`, collection: 'articles', id: `hepta-${OTHER}`, preparePublish: true, reviewOnly: true };
  const plan = await ok(f.request('/heptabase/preview', 'POST', other));
  await ok(f.request('/heptabase/decision', 'POST', { ...other, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true }));
  return other;
}

test('removed blog tag and confirmed missing object both produce reviewed deletions, never implicit writes', async () => {
  for (const deleted of [false, true]) {
    const f = await setup(deleted), main = f.refs.get('main');
    const listed = await ok(f.request('/heptabase/cards')); assert.equal(listed.cards.length, 0);
    assert.equal(listed.removals[0].reason, deleted ? 'deleted' : 'untagged');
    const plan = await preview(f); assert.equal(plan.changes[0].beforeContent, '原有正文。');
    assert.equal((await approve(f, plan, { confirmDelete: false })).status, 409);
    await ok(approve(f, plan)); await ok(approve(f, plan));
    assert.equal((await ok(f.request('/git'))).files[0].code, 'D');
    assert.equal((await ok(f.request('/docs'))).articles.length, 0);
    assert.equal(f.refs.get('main'), main); assert.equal(writes(f).length, 0);
    await commit(f);
    assert.deepEqual(f.changedFiles().map(c => [c.filename, c.status]), [[PATH, 'removed'], [BLOG_INDEX, 'modified']]);
    assert.equal(f.filesFor(f.refs.get('codex/studio-content'))[PATH], undefined);
    const review = await ok(f.request('/git/review')); await ok(f.request('/git/publish', 'POST', review));
    assert.equal(f.filesFor(f.refs.get('main'))[PATH], undefined);
    assert.equal((await ok(f.request('/heptabase/cards'))).removals.length, 0);
    assert.equal(f.calls.filter(c => ['edit_card_properties', 'edit_object_content', 'delete_object'].includes(c.body?.params?.name)).length, 0);
  }
});

test('permission, network, malformed and incomplete listings never mean deleted', async () => {
  for (const failure of ['noReadPermission', 'objectTypeMismatch', 'network', 'malformed', 'incomplete']) {
    const f = await setup();
    globalThis.fetch = async (url, init) => {
      const body = init?.body?.startsWith('{') ? JSON.parse(init.body) : {}, name = body.params?.name;
      if (failure === 'incomplete' && name === 'list_tags') return Response.json({ id: body.id, result: { structuredContent: { content: '<tags><tag id="blog-id" name="blog" cardCount="2" /></tags>' } } });
      if (name === 'read_object') {
        if (failure === 'network') return new Response('Unavailable', { status: 503 });
        return Response.json({ id: body.id, result: { structuredContent: failure === 'malformed' ? { content: '' } : { status: 'failed', failureReasonCode: failure, content: 'Cannot read.' } } });
      }
      return f.fetcher(url, init);
    };
    assert.notEqual((await f.request('/heptabase/cards')).status, 200, failure);
    assert.notEqual((await f.request('/heptabase/removal-preview', 'POST', input)).status, 200, failure);
    assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 0); assert.equal(writes(f).length, 0);
  }
});

test('removal includes exclusive cyclic references but keeps shared pages', async () => {
  const f = await setup();
  f.remote(raw(CARD, '主文', `${docRef(REF)}\n\n${docRef(SHARED)}`));
  f.remote(raw(REF, '专属资料', docRef(REF), false), refPath(REF));
  f.remote(raw(SHARED, '共享资料', '两个文章都用它。', false), refPath(SHARED));
  f.remote(raw(OTHER, '另一篇文章', docRef(SHARED)), refPath(OTHER));
  f.properties.set(OTHER, { Status: 'published' }); f.cardSources.set(OTHER, '# 另一篇文章\n\n正文');
  f.cardSources.set(REF, '# 专属资料\n\n正文'); f.cardSources.set(SHARED, '# 共享资料\n\n正文');
  const listed = await ok(f.request('/heptabase/cards'));
  assert.equal(listed.removals.some(item => item.title === '主文'), true);
  assert.equal(listed.removals.some(item => item.title === '专属资料'), false);
  const plan = await preview(f);
  assert.deepEqual(plan.changes.map(c => c.path), [PATH, refPath(REF)]); assert.equal(plan.keptReferences[0].title, '共享资料');
  await ok(approve(f, plan)); await commit(f);
  const files = f.filesFor(f.refs.get('codex/studio-content'));
  assert.equal(files[PATH], undefined); assert.equal(files[refPath(REF)], undefined); assert.ok(files[refPath(SHARED)]); assert.ok(files[refPath(OTHER)]);
});

test('inbound mentions or ordinary links block removal until reviewed source updates resolve them', async () => {
  for (const body of ['<DocRef of="articles/example" />', '[正文链接](/articles/example#part)', '<a href="/articles/example" data-doc-mention>文章</a>']) {
    const f = await setup(); f.remote(raw(OTHER, '仍在引用它', body), refPath(OTHER));
    const plan = await preview(f); assert.equal(plan.blockers[0].title, '仍在引用它');
    assert.equal((await approve(f, plan)).status, 409); assert.equal(writes(f).length, 0);
  }
});

test('re-added cards, changed removal reason and newer GitHub text invalidate review', async () => {
  for (const change of ['restored', 'deleted', 'github']) {
    const f = await setup(), plan = await preview(f);
    if (change === 'restored') f.properties.set(CARD, { Status: 'published' });
    if (change === 'deleted') f.missingCards.add(CARD);
    if (change === 'github') f.remote(raw(CARD, '新标题', '新的线上正文'));
    assert.equal((await approve(f, plan)).status, 409, change); assert.equal(writes(f).length, 0);
  }
});

test('deletion is rechecked before public upload and merge; newly incoming links are caught', async () => {
  for (const phase of ['commit', 'merge', 'incoming']) {
    const f = await setup(); await ok(approve(f, await preview(f)));
    if (phase === 'merge') await commit(f);
    if (phase === 'incoming') f.remote(raw(OTHER, '新增的引用', '[链接](/articles/example)'), refPath(OTHER));
    else f.properties.set(CARD, { Status: 'published' });
    const main = f.refs.get('main'), before = writes(f).length;
    const result = phase === 'merge' ? await f.request('/git/publish', 'POST', await ok(f.request('/git/review'))) : await f.request('/git/commit', 'POST', { message: '删除' });
    assert.equal(result.status, 409, phase); assert.equal(f.refs.get('main'), main); assert.equal(writes(f).length, before);
  }
});

test('core pages and reference-only pages drop when the card leaves its tag or is deleted', async () => {
  const about = 'a51ada66-ee0b-4759-9b1f-830c8374fcae';
  const aboutPath = 'src/content/pages/about.mdx';
  const aboutRaw = `---\nslot: page\ntitle: 关于\ndescription: 关于\nheptabaseCardLink: heptabase://card/${about}\n---\n\n正文。\n`;
  for (const deleted of [false, true]) {
    const f = await setup();
    f.remote(aboutRaw, aboutPath);
    f.cardSources.set(about, '# 关于\n\n正文。');
    f.remote(raw(REF, '资料', '正文', false), refPath(REF));
    f.cardSources.set(REF, '# 资料\n\n正文');
    if (deleted) { f.missingCards.add(about); f.missingCards.add(REF); }
    const listed = await ok(f.request('/heptabase/cards'));
    const reasons = Object.fromEntries(listed.removals.map((item) => [item.id, item.reason]));
    assert.equal(reasons.about, deleted ? 'deleted' : 'untagged');
    assert.equal(reasons[`hepta-${REF}`], deleted ? 'deleted' : 'untagged');
  }
  const f = await setup();
  f.remote(raw(REF, '资料', '正文', false), refPath(REF));
  f.cardSources.set(REF, '# 资料\n\n正文');
  f.referenceCards.add(REF);
  const onlyOldTag = await ok(f.request('/heptabase/cards'));
  assert.equal(onlyOldTag.removals.some((item) => item.id === `hepta-${REF}`), true);
  f.properties.set(REF, { 'Blog Type': 'Reference' });
  const listed = await ok(f.request('/heptabase/cards'));
  assert.equal(listed.removals.some((item) => item.id === `hepta-${REF}`), false);
});

test('reference becoming a blog cannot be swept away with its former parent', async () => {
  const f = await setup(); f.remote(raw(CARD, '主文', docRef(REF))); f.remote(raw(REF, '资料', '正文', false), refPath(REF));
  await ok(approve(f, await preview(f))); f.properties.set(REF, { Status: 'review' }); f.cardSources.set(REF, '# 资料\n\n正文');
  assert.equal((await f.request('/git/commit', 'POST', { message: '删除' })).status, 409); assert.equal(writes(f).length, 0);
});

test('pending deletion survives reload and can be cancelled without touching the source or public website', async () => {
  const f = await setup(), main = f.refs.get('main'); await ok(approve(f, await preview(f)));
  assert.equal((await preview(f)).approved, true); assert.equal((await ok(f.request('/git'))).removals.length, 1);
  await ok(f.request('/heptabase/removal-cancel', 'POST', { cardLink: LINK }));
  assert.equal((await ok(f.request('/git'))).draftCount, 0); assert.equal((await ok(f.request('/docs'))).articles[0].title, '即将撤下的文章');
  assert.equal(f.refs.get('main'), main); assert.equal(writes(f).length, 0);
});

test('atomic failure queues neither a partial removal nor its approval record', async () => {
  const f = await setup(), plan = await preview(f);
  f.DB.sqlite.exec("CREATE TRIGGER fail_removal BEFORE INSERT ON studio_review_decisions BEGIN SELECT RAISE(ABORT, 'rollback'); END");
  assert.equal((await approve(f, plan)).status, 500);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 0);
});

test('unreviewed deletions and arbitrary index edits cannot be smuggled into a release', async () => {
  const f = await setup(); await ok(approve(f, await preview(f)));
  f.DB.sqlite.exec('DELETE FROM studio_review_decisions');
  assert.equal((await f.request('/git/commit', 'POST', { message: '删除' })).status, 409); assert.equal(writes(f).length, 0);
});

test('new approvals and removals can be submitted and deployed together', async () => {
  const f = await setup(); await approveOther(f); await ok(approve(f, await preview(f))); await commit(f);
  assert.deepEqual(new Set(f.changedFiles().map(c => c.status)), new Set(['added', 'modified', 'removed']));
  await ok(f.request('/git/publish', 'POST', await ok(f.request('/git/review'))));
  const files = f.filesFor(f.refs.get('main')); assert.equal(files[PATH], undefined); assert.ok(files[refPath(OTHER)]);
});

test('successive removals in one PR preserve earlier deletions and never overwrite manual directory edits', async () => {
  for (const tampered of [false, true]) {
    const f = await setup(); f.remote(raw(OTHER, '第二篇旧文章', '正文'), refPath(OTHER)); f.cardSources.set(OTHER, '# 第二篇旧文章\n\n正文');
    const directory = `---\nslot: page\ntitle: 博客\n---\n\n<DocList><DocRef of="articles/example" />${docRef(OTHER)}</DocList>\n`;
    f.remote(directory, BLOG_INDEX);
    await ok(approve(f, await preview(f))); await commit(f);
    if (tampered) f.remote(withoutIndexRefs(directory, [PATH]) + '\n保留这段手工补充。\n', BLOG_INDEX, 'codex/studio-content');
    const other = { cardLink: `heptabase://card/${OTHER}`, collection: 'articles', id: `hepta-${OTHER}` };
    const plan = await ok(f.request('/heptabase/removal-preview', 'POST', other));
    await ok(f.request('/heptabase/removal', 'POST', { ...other, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, confirmDelete: true }));
    const before = writes(f).length, response = await f.request('/git/commit', 'POST', { message: '继续删除' });
    if (tampered) { assert.equal(response.status, 409); assert.match((await response.json()).error, /未覆盖/); assert.equal(writes(f).length, before); }
    else { await ok(response); assert.equal(f.changedFiles().filter(c => c.status === 'removed').length, 2); }
  }
});

test('approved but not yet published new cards can be withdrawn, before or after uploading the PR', async () => {
  for (const uploaded of [false, true]) {
    const f = await setup(), other = await approveOther(f);
    if (uploaded) await commit(f);
    f.properties.delete(OTHER); f.missingCards.add(OTHER);
    assert.ok((await ok(f.request('/heptabase/cards'))).removals.some(c => c.cardLink === other.cardLink));
    const plan = await ok(f.request('/heptabase/removal-preview', 'POST', other));
    const selection = { ...other, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, confirmDelete: true };
    await ok(f.request('/heptabase/removal', 'POST', selection)); await ok(f.request('/heptabase/removal', 'POST', selection));
    assert.equal((await ok(f.request('/heptabase/removal-preview', 'POST', other))).approved, true);
    const result = await commit(f);
    assert.equal((await ok(f.request('/git'))).draftCount, 0);
    if (!uploaded) assert.equal(result.unchanged, true);
    else {
      assert.equal(f.changedFiles().length, 0);
      assert.equal((await f.request('/git/publish', 'POST', await ok(f.request('/git/review')))).status, 409);
    }
  }
});

test('cancelling a removal restores a previously approved edit and keeps its consent valid', async () => {
  const f = await setup(); f.properties.set(CARD, { Status: 'review', Tag: ['Mission'] }); f.setSource('# 已编辑的文章\n\n修改后的正文。');
  const edit = await ok(f.request('/heptabase/preview', 'POST', { ...input, preparePublish: true, reviewOnly: true }));
  await ok(f.request('/heptabase/decision', 'POST', { ...input, sourceHash: edit.sourceHash, documentHash: edit.documentHash, planHash: edit.planHash, decision: 'approve', confirmPublic: true }));
  const properties = structuredClone(f.properties.get(CARD)); f.properties.delete(CARD);
  await ok(approve(f, await preview(f))); await ok(f.request('/heptabase/removal-cancel', 'POST', { cardLink: LINK }));
  f.properties.set(CARD, properties); await commit(f);
  assert.equal(f.changedFiles().find(c => c.filename === PATH).status, 'modified');
});

test('scope and index cleanup ignore code examples, preserve unrelated content and support shared graphs', () => {
  const index = '<DocList>\n<DocRef of="articles/example" />\n<DocRef of="articles/other" />\n</DocList>\n\n```mdx\n<DocRef of="articles/example" />\n```';
  assert.equal(withoutIndexRefs(index, [PATH]), '<DocList>\n<DocRef of="articles/other" />\n</DocList>\n\n```mdx\n<DocRef of="articles/example" />\n```');
  assert.equal(removalScope(new Map([[PATH, raw(CARD, '主文', '正文')], [refPath(OTHER), raw(OTHER, '代码', '```mdx\n<DocRef of="articles/example" />\n```')]]), PATH).blockers.length, 0);
});
