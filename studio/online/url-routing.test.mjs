import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fixture, CARD } from './test-fixtures.mjs';
import { parseMdx, serializeMdx } from '../core.mjs';
import { routeSlug, translationLanguage } from './card-properties.mjs';
import { removalScope } from './removals.mjs';
const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
async function ok(r) { const res = await r, body = await res.json(); assert.equal(res.status, 200, JSON.stringify(body)); return body; }
const ZH = '11111111-1111-4111-8111-111111111111', EN = '22222222-2222-4222-8222-222222222222', JA = '44444444-4444-4444-8444-444444444444', OLD = '33333333-3333-4333-8333-333333333333';
const link = id => `heptabase://card/${id}`;
async function setup(props = {}, translations = []) {
  const f = await fixture(); globalThis.fetch = f.fetcher; await f.login(); await f.connect();
  f.properties.get(CARD).Status = 'writing';
  f.cardSources.set(ZH, '# 我的工具箱\n\n中文原文。');
  f.properties.set(ZH, { Status: 'review', URL: 'toolset', 'blog i18n': translations.map(([id]) => `card/${id}`), ...props });
  for (const [id, title, values] of translations) { f.cardSources.set(id, `# ${title}\n\n${title} body.`); f.i18n.set(id, values); }
  return f;
}
const input = (extra = {}) => ({ cardLink: link(ZH), collection: 'articles', preparePublish: true, reviewOnly: true, ...extra });
const preview = (f, extra) => f.request('/heptabase/preview', 'POST', input(extra));
const approve = (f, plan) => f.request('/heptabase/decision', 'POST', { ...input(), sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true });

test('URL is the slug as written; translation languages become their own site', () => {
  assert.equal(routeSlug(' /toolset/ '), 'toolset');
  assert.equal(routeSlug(''), null);
  assert.throws(() => routeSlug('My Toolset'));
  assert.throws(() => routeSlug('2024'));
  for (const fixed of ['now', 'tags', 'articles', 'projects', 'dashboard', 'contact', 'privacy', 'about', 'en', 'cn']) {
    assert.throws(() => routeSlug(fixed), new RegExp(`与网站固定地址 /${fixed} 冲突`));
  }
  assert.equal(translationLanguage('en'), 'en');
  assert.equal(translationLanguage('English'), 'en');
  assert.equal(translationLanguage('Japanese'), 'ja');
  assert.throws(() => translationLanguage('simplified chinese'), /中文写在 #blog/);
  assert.throws(() => translationLanguage(null), /Language/);
});

test('a #blog card and its related #blogi18n translation share one path on two sites', async () => {
  const f = await setup({}, [[EN, 'My toolset', { Language: 'en', URL: 'toolset' }], [JA, '私のツール', { Language: 'ja' }]]);
  const plan = await ok(preview(f));
  assert.equal(plan.filePath, 'src/content/articles/toolset.mdx');
  const byId = new Map(plan.changes.map(c => [c.id, c]));
  assert.equal(byId.get(ZH).afterProperties.url, 'toolset');
  assert.equal(byId.get(ZH).afterProperties.language, undefined);
  const en = byId.get(EN), ja = byId.get(JA);
  assert.deepEqual([en.path, en.translation, en.language, en.mainArticle], ['src/content/articles/toolset/en.mdx', true, 'en', false]);
  assert.equal(ja.path, 'src/content/articles/toolset/ja.mdx');
  assert.deepEqual([en.afterProperties.title, en.afterProperties.translationOf, en.afterProperties.url, en.afterProperties.listed], ['My toolset', link(ZH), 'toolset', false]);
  assert.equal(en.afterProperties.date, byId.get(ZH).afterProperties.date);
  await ok(approve(f, plan));
  assert.equal(f.properties.get(ZH).Status, 'published');
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 3);
  assert.equal((await ok(f.request('/doc?collection=articles&id=toolset'))).href, '/toolset');
  assert.equal((await ok(f.request('/doc?collection=articles&id=toolset%2Fen'))).href, '/toolset');
  await ok(f.request('/git/commit', 'POST', { message: '中文和译文一起发布' }));
  assert.deepEqual(f.changedFiles().map(c => c.filename).sort(), ['src/content/articles/toolset.mdx', 'src/content/articles/toolset/en.mdx', 'src/content/articles/toolset/ja.mdx']);
  assert.notEqual(parseMdx(f.text('src/content/articles/toolset/en.mdx')).frontmatter.draft, true);
});

test('a translation must be in #blogi18n, carry the same URL, and be the only one for its language', async () => {
  let f = await setup({}, [[EN, 'My toolset', { Language: 'en', URL: 'tools' }]]);
  let res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /URL「tools」和中文原文的 URL「toolset」不一致/);
  f = await setup({ 'blog i18n': [`card/${OLD}`] }); f.cardSources.set(OLD, '# Stray\n\nnot tagged');
  res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /不在 #blogi18n 里/);
  f = await setup({}, [[EN, 'My toolset', { Language: 'en' }], [JA, 'Toolset again', { Language: 'en' }]]);
  res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /两张 en 译文/);
  f = await setup({}, [[EN, '工具箱', { Language: 'simplified chinese' }]]);
  res = await preview(f); assert.equal(res.status, 400); assert.match((await res.json()).error, /中文写在 #blog/);
});

test('without URL the card keeps its slug and the translation sits beside it', async () => {
  const f = await setup({ URL: undefined }, [[EN, 'My toolset', { Language: 'en' }]]);
  delete f.properties.get(ZH).URL;
  const plan = await ok(preview(f));
  assert.equal(plan.filePath, `src/content/articles/hepta-${ZH}.mdx`);
  assert.ok(plan.changes.some(c => c.path === `src/content/articles/hepta-${ZH}/en.mdx`));
});

test('a URL taken by another article or a fixed route is refused; a linked article is not moved', async () => {
  let f = await setup();
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: '别的文章', description: '占用', date: '2026-01-02', heptabaseCardLink: link(OLD) }, bodyZh: '占用' }), 'src/content/articles/toolset.mdx');
  let res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /地址 \/toolset 已被「别的文章」使用/);
  f = await setup({ URL: 'now' });
  res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /URL「now」与网站固定地址 \/now 冲突/);
  f = await setup();
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: '我的工具箱', description: '旧地址', date: '2026-01-02', heptabaseCardLink: link(ZH) }, bodyZh: '正文' }), 'src/content/articles/my-toolset.mdx');
  res = await preview(f, { id: 'my-toolset' }); assert.equal(res.status, 409); assert.match((await res.json()).error, /已发布在 \/articles\/my-toolset/);
});

test('withdrawing an article takes its translations with it', () => {
  const doc = (fm, body = '正文') => serializeMdx({ frontmatter: { slot: 'article', title: 't', description: '', date: '2026-01-02', ...fm }, bodyZh: body });
  const files = new Map([
    ['src/content/articles/toolset.mdx', doc({ heptabaseCardLink: link(ZH), url: 'toolset' })],
    ['src/content/articles/toolset/en.mdx', doc({ heptabaseCardLink: link(EN), translationOf: link(ZH), url: 'toolset', language: 'en', listed: false })],
    ['src/content/articles/other.mdx', doc({ heptabaseCardLink: link(OLD) })],
  ]);
  assert.deepEqual(removalScope(files, 'src/content/articles/toolset.mdx').paths, ['src/content/articles/toolset.mdx', 'src/content/articles/toolset/en.mdx']);
});
