import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fixture, CARD, LINK, PATH, article } from './test-fixtures.mjs';
import { parseMdx, serializeMdx } from '../core.mjs';
import { onlyTagsChanged, tagDiff } from './review-content.mjs';
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
async function setup() { const f = await fixture(); globalThis.fetch = f.fetcher; await f.login(); await f.connect(); f.properties.get(CARD).Status = 'review'; return f; }
async function ok(r) { const res = await r, body = await res.json(); assert.equal(res.status, 200, JSON.stringify(body)); return body; }
const input = { cardLink: LINK, collection: 'articles', id: 'example', preparePublish: true, reviewOnly: true };
const preview = f => ok(f.request('/heptabase/preview', 'POST', input));
const selection = plan => ({ ...input, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash });
const decision = (f, plan, which = 'approve') => f.request('/heptabase/decision', 'POST', { ...selection(plan), decision: which, confirmPublic: true });
const other = '9732c208-c3b1-4a7b-a922-0c3483475d6b';
const writes = f => f.calls.filter(c => c.url.startsWith('https://api.github.com') && c.method !== 'GET' && !c.url.endsWith('/graphql'));

test('only Review roots are pulled; new and edited use GitHub publication, not a date heuristic', async () => {
  const f = await setup(); f.properties.set(other, { Status: 'writing' }); f.cardSources.set(other, '# 非 Review\n\n不能拉取');
  let cards = (await ok(f.request('/heptabase/cards'))).cards; assert.deepEqual(cards.map(c => c.id), [CARD]);
  assert.equal((await preview(f)).changes[0].previouslyPublished, false);
  f.remote(article.replace('draft: true', 'draft: false'));
  assert.equal((await preview(f)).changes[0].previouslyPublished, true);
  f.properties.get(CARD).Status = 'Published'; cards = (await ok(f.request('/heptabase/cards'))).cards; assert.equal(cards.length, 0);
  assert.equal((await f.request('/heptabase/preview', 'POST', input)).status, 409);
});
test('individual approval writes Published and first date immediately; not deployed, retries idempotent', async () => {
  const f = await setup(); const main = f.refs.get('main'), plan = await preview(f);
  const result = await ok(decision(f, plan)); assert.equal(result.properties.status, 'published');
  assert.equal(result.properties.date, null);
  assert.equal((await ok(f.request('/doc?collection=articles&id=example'))).frontmatter.date, '2026-09-21');
  assert.equal((await ok(f.request('/doc?collection=articles&id=example'))).frontmatter.created, '2026-09-21T00:00:00Z');
  assert.equal(f.refs.get('main'), main); assert.equal(writes(f).length, 0);
  assert.equal((await ok(f.request('/heptabase/cards'))).cards.length, 0);
  await ok(decision(f, plan));
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'edit_card_properties').length, 1);
  await ok(f.request('/git/commit', 'POST', { message: '审核通过' }));
  assert.equal(f.refs.get('main'), main);
});
test('reject writes Block only, keeps date and the old website, does not stage anything', async () => {
  const f = await setup(); f.properties.get(CARD)['Publish Date'] = { start: '2023-01-02T00:00:00Z' }; f.remote(article.replace('draft: true', 'draft: false'));
  const main = f.refs.get('main'); await ok(decision(f, await preview(f), 'reject'));
  assert.equal(f.properties.get(CARD).Status, 'block'); assert.equal(f.properties.get(CARD)['Publish Date'].start, '2023-01-02T00:00:00Z');
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 0); assert.equal(f.refs.get('main'), main); assert.equal(writes(f).length, 0);
});
test('edited approval preserves existing publication day', async () => {
  const f = await setup(); f.properties.get(CARD)['Publish Date'] = { start: '2023-01-02T00:00:00Z' };
  const result = await ok(decision(f, await preview(f))); assert.equal(result.properties.date, '2023-01-02');
  assert.equal(parseMdx(f.DB.sqlite.prepare('SELECT raw FROM studio_drafts WHERE path = ?').get(PATH).raw).frontmatter.date, '2023-01-02');
});
test('tag-only approval stages exact new tags while keeping body and date; rejection leaves public tags alone', async () => {
  for (const which of ['approve', 'reject']) {
    const f = await setup();
    const frontmatter = { slot: 'article', title: '测试文章', description: '摘要', date: '2023-01-02', created: '2026-09-21T00:00:00Z', updated: '2026-09-21T00:00:00Z', tags: ['Mission', 'AI Native'], heptabaseCardLink: LINK };
    f.remote(serializeMdx({ frontmatter, bodyZh: '标签更新，正文不动。' })); f.setSource('# 测试文章\n\n标签更新，正文不动。');
    f.properties.set(CARD, { Status: 'review', 'Publish Date': { start: '2023-01-02T00:00:00Z' }, Tag: ['Mission', 'Productivity'] });
    const main = f.refs.get('main'), plan = await preview(f), change = plan.changes[0];
    assert.equal(onlyTagsChanged(change), true);
    assert.deepEqual(tagDiff(change.beforeProperties.tags, change.afterProperties.tags), { added: ['Productivity'], removed: ['AI Native'], unchanged: ['Mission'] });
    await ok(decision(f, plan, which));
    assert.equal(f.refs.get('main'), main); assert.equal(writes(f).length, 0);
    assert.deepEqual(f.properties.get(CARD).Tag, ['Mission', 'Productivity']);
    assert.equal(f.properties.get(CARD)['Publish Date'].start, '2023-01-02T00:00:00Z');
    if (which === 'approve') {
      const staged = parseMdx(f.DB.sqlite.prepare('SELECT raw FROM studio_drafts WHERE path = ?').get(PATH).raw);
      assert.deepEqual(staged.frontmatter.tags, ['Mission', 'Productivity']);
      assert.equal(staged.bodyZh, '标签更新，正文不动。'); assert.equal(staged.frontmatter.date, '2023-01-02');
      await ok(f.request('/git/commit', 'POST', { message: '只更新标签' }));
      assert.deepEqual(f.changedFiles().map(c => c.filename), [PATH]);
    } else assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 0);
  }
});
test('tag edits after pulling invalidate the old review before any status write', async () => {
  const f = await setup(), plan = await preview(f); f.properties.get(CARD).Tag = ['Mission'];
  assert.equal((await decision(f, plan)).status, 409);
  assert.equal((await decision(f, plan, 'reject')).status, 409);
  assert.equal(f.properties.get(CARD).Status, 'review');
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'edit_card_properties').length, 0);
});
test('reference consent cannot approve another blog, and rejected dependencies cannot be uploaded', async () => {
  const f = await setup(); f.cardSources.set(other, '# 第二篇博客\n\n必须单独审核。'); f.properties.set(other, { Status: 'review' });
  f.setSource(`# 第一篇\n\n<hepta-mention type="card" id="${other}">第二篇</hepta-mention>`);
  await ok(decision(f, await preview(f)));
  assert.equal(f.properties.get(other).Status, 'review'); assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 1);
  assert.equal((await f.request('/git/commit', 'POST', { message: '不能带入另一篇' })).status, 409); assert.equal(writes(f).length, 0);
});
test('pending writes survive timeout and retry with the same first day and no duplicate drafts', async () => {
  const f = await setup(); const plan = await preview(f); let fail = true;
  globalThis.fetch = async (url, init) => {
    const response = await f.fetcher(url, init);
    if (fail && init?.body && JSON.parse(init.body).params?.name === 'edit_card_properties') { fail = false; throw new Error('simulated timeout after write'); }
    return response;
  };
  assert.equal((await decision(f, plan)).status, 500); assert.equal(f.properties.get(CARD).Status, 'published');
  assert.equal(f.DB.sqlite.prepare('SELECT status FROM studio_review_decisions').get().status, 'pending');
  assert.equal((await f.request('/git/commit', 'POST', { message: '暂不能提交' })).status, 409);
  await ok(f.request('/heptabase/decision', 'POST', { cardLink: LINK, decision: 'approve' }));
  assert.equal(f.DB.sqlite.prepare('SELECT status FROM studio_review_decisions').get().status, 'complete');
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 1);
});
test('failed local batch cannot publish a partial approval; retry restores the complete graph', async () => {
  const f = await setup(); f.cardSources.set(other, '# 引用\n\n资料'); f.properties.set(other, { 'Blog Type': 'Reference' });
  f.setSource(`# 第一篇\n\n<hepta-mention type="card" id="${other}">引用</hepta-mention>`);
  f.DB.sqlite.exec("CREATE TRIGGER fail_review BEFORE INSERT ON studio_reviews BEGIN SELECT RAISE(ABORT, 'rollback'); END");
  assert.equal((await decision(f, await preview(f))).status, 500);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 0);
  f.DB.sqlite.exec('DROP TRIGGER fail_review');
  await ok(f.request('/heptabase/decision', 'POST', { cardLink: LINK, decision: 'approve' }));
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 2);
});

test('rejecting one blog preserves the shared reference needed by an approved blog', async () => {
  const f = await setup(), ref = '122560bd-b99f-4fb9-9fa5-742090feacb1';
  const mention = `<hepta-mention type="card" id="${ref}">共同资料</hepta-mention>`;
  f.setSource(`# 第一篇\n\n${mention}`); f.cardSources.set(other, `# 第二篇\n\n${mention}`);
  f.cardSources.set(ref, '# 共同资料\n\n都引用这里'); f.properties.set(ref, { 'Blog Type': 'Reference' }); f.properties.set(other, { Status: 'review' });
  await ok(decision(f, await preview(f)));
  const second = { ...input, cardLink: `heptabase://card/${other}`, id: `hepta-${other}` };
  const plan = await ok(f.request('/heptabase/preview', 'POST', second));
  await ok(f.request('/heptabase/decision', 'POST', { ...selection(plan), ...second, decision: 'reject' }));
  assert.equal(f.properties.get(other).Status, 'block');
  const drafts = f.DB.sqlite.prepare('SELECT path FROM studio_drafts').all();
  assert.equal(drafts.length, 2); assert.ok(drafts.some(r => r.path.includes(ref)));
  await ok(f.request('/git/commit', 'POST', { message: '只提交通过的第一篇' }));
  assert.ok(f.changedFiles().every(c => !c.filename.includes(other)));
});

test('changed review cannot approve or reject a newer card version', async () => {
  const f = await setup(), plan = await preview(f); f.setSource('# 新内容\n\n审核之后发生的修改');
  assert.equal((await decision(f, plan)).status, 409);
  assert.equal((await decision(f, plan, 'reject')).status, 409);
  assert.equal(f.properties.get(CARD).Status, 'review');
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'edit_card_properties').length, 0);
});
