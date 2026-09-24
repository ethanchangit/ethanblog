import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fixture, CARD } from './test-fixtures.mjs';
import { parseMdx, serializeMdx } from '../core.mjs';
import { routeSlug, languageCode, urlArticleId } from './card-properties.mjs';
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
async function ok(r) { const res = await r, body = await res.json(); assert.equal(res.status, 200, JSON.stringify(body)); return body; }
const EN = '11111111-1111-4111-8111-111111111111', ZH = '22222222-2222-4222-8222-222222222222', OLD = '33333333-3333-4333-8333-333333333333';
const link = id => `heptabase://card/${id}`;
async function setup(cards) {
  const f = await fixture(); globalThis.fetch = f.fetcher; await f.login(); await f.connect();
  f.properties.get(CARD).Status = 'writing';
  for (const [id, title, props] of cards) { f.cardSources.set(id, `# ${title}\n\n${title}的正文。`); f.properties.set(id, { Status: 'review', ...props }); }
  return f;
}
const preview = (f, id, extra = {}) => f.request('/heptabase/preview', 'POST', { cardLink: link(id), collection: 'articles', preparePublish: true, reviewOnly: true, ...extra });

test('URL column is the slug as written; Chinese is served at /cn', () => {
  assert.equal(routeSlug(' /toolset/ '), 'toolset');
  assert.equal(routeSlug(''), null);
  assert.throws(() => routeSlug('My Toolset'));
  assert.throws(() => routeSlug('2024'));
  assert.equal(languageCode('simplified chinese'), 'cn');
  assert.equal(languageCode('English'), 'en');
  assert.equal(languageCode(null), null);
  assert.equal(urlArticleId('toolset', 'cn'), 'toolset/cn');
  assert.equal(urlArticleId('toolset', null), 'toolset');
});

test('a Serial pair maps English to /<url> and Chinese to /<url>/cn', async () => {
  const f = await setup([[EN, 'My toolset', { Serial: 7, URL: 'toolset' }], [ZH, '我的工具箱', { Serial: 7, Language: 'simplified chinese' }]]);
  await ok(f.request('/heptabase/cards'));
  const en = await ok(preview(f, EN)), zh = await ok(preview(f, ZH));
  assert.equal(en.filePath, 'src/content/articles/toolset.mdx');
  assert.equal(zh.filePath, 'src/content/articles/toolset/cn.mdx');
  const enFront = en.changes[0].afterProperties, zhFront = zh.changes[0].afterProperties;
  assert.deepEqual([enFront.serial, enFront.language, enFront.url], [7, undefined, 'toolset']);
  assert.deepEqual([zhFront.serial, zhFront.language, zhFront.url], [7, 'cn', 'toolset']);
  assert.equal(en.changes[0].title, 'My toolset');
  for (const [id, plan] of [[EN, en], [ZH, zh]]) await ok(f.request('/heptabase/decision', 'POST', { cardLink: link(id), collection: 'articles', preparePublish: true, reviewOnly: true, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true }));
  assert.equal((await ok(f.request('/doc?collection=articles&id=toolset'))).href, '/toolset');
  assert.equal((await ok(f.request('/doc?collection=articles&id=toolset%2Fcn'))).href, '/toolset/cn');
});

test('a mention of the Chinese version links to /<url>/cn', async () => {
  const f = await setup([[ZH, '我的工具箱', { Serial: 7, URL: 'toolset', Language: 'simplified chinese' }]]);
  f.cardSources.set(EN, `# My toolset\n\nRead it in <hepta-mention type="card" id="${ZH}">Chinese</hepta-mention>.`);
  f.properties.set(EN, { Status: 'review', Serial: 7, URL: 'toolset' });
  const plan = await ok(preview(f, EN));
  assert.match(plan.next, /href="\/toolset\/cn"/);
});

test('a URL that collides with a fixed site route is refused and names the route', async () => {
  for (const fixed of ['now', 'tags', 'articles', 'projects', 'dashboard', 'contact', 'privacy', 'about']) {
    assert.throws(() => routeSlug(fixed), new RegExp(`与网站固定地址 /${fixed} 冲突`));
  }
  const f = await setup([[EN, 'Now page copy', { URL: 'now' }]]);
  const refused = await preview(f, EN); assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /URL「now」与网站固定地址 \/now 冲突/);
});

test('a card without URL keeps the old slug; a URL is never taken from the title', async () => {
  const f = await setup([[EN, 'My toolset', {}]]);
  assert.equal((await ok(preview(f, EN))).filePath, `src/content/articles/hepta-${EN}.mdx`);
  f.properties.get(EN).URL = 'Not A Slug';
  const bad = await preview(f, EN); assert.equal(bad.status, 400);
  assert.match((await bad.json()).error, /只能用小写字母/);
});

test('the same Serial updates the existing page in place instead of creating a second one', async () => {
  const f = await setup([[EN, 'My toolset v2', { Serial: 9 }]]);
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: 'My toolset', description: '旧版', date: '2026-01-02', serial: 9, heptabaseCardLink: link(OLD) }, bodyZh: '旧正文' }), 'src/content/articles/my-toolset.mdx');
  const plan = await ok(preview(f, EN));
  assert.equal(plan.filePath, 'src/content/articles/my-toolset.mdx');
  assert.equal(parseMdx(plan.next).frontmatter.heptabaseCardLink, link(EN));
});

test('a URL already used by another article is refused; a linked article is not silently moved', async () => {
  const f = await setup([[EN, 'My toolset', { URL: 'toolset' }]]);
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: '别的文章', description: '占用', date: '2026-01-02', heptabaseCardLink: link(OLD) }, bodyZh: '占用' }), 'src/content/articles/toolset.mdx');
  const taken = await preview(f, EN); assert.equal(taken.status, 409);
  assert.match((await taken.json()).error, /已被「别的文章」使用/);
  const g = await setup([[EN, 'My toolset', { URL: 'toolset' }]]);
  g.remote(serializeMdx({ frontmatter: { slot: 'article', title: 'My toolset', description: '旧地址', date: '2026-01-02', heptabaseCardLink: link(EN) }, bodyZh: '正文' }), 'src/content/articles/my-toolset.mdx');
  const moved = await preview(g, EN, { id: 'my-toolset' }); assert.equal(moved.status, 409);
  assert.match((await moved.json()).error, /已发布在 \/articles\/my-toolset/);
});
