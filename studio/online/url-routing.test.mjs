import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fixture, CARD } from './test-fixtures.mjs';
import { parseMdx, serializeMdx } from '../core.mjs';
import { assertArticleSlug, propertiesFromRead, routeSlug, translationLanguage } from './card-properties.mjs';
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
  f.properties.set(ZH, { Status: 'review', slug: 'toolset', Language: 'cn', 'blog i18n': [`card/${OLD}`], ...props });
  for (const [id, title, values] of translations) { f.cardSources.set(id, `# ${title}\n\n${title} body.`); f.i18n.set(id, values); }
  return f;
}
const input = (extra = {}) => ({ cardLink: link(ZH), collection: 'articles', preparePublish: true, reviewOnly: true, ...extra });
const preview = (f, extra) => f.request('/heptabase/preview', 'POST', input(extra));
const approve = (f, plan) => f.request('/heptabase/decision', 'POST', { ...input(), sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true });

test('URL is the slug as written; translation languages become their own site', () => {
  assert.equal(routeSlug(' /toolset/ '), 'toolset');
  assert.equal(routeSlug(''), null);
  assert.equal(routeSlug('My Toolset'), 'My Toolset');
  assert.equal(routeSlug('2024'), '2024');
  assert.equal(routeSlug('now'), 'now');
  assert.throws(() => assertArticleSlug('My Toolset'), /小写字母/);
  assert.throws(() => assertArticleSlug('2024'), /不能只有数字/);
  for (const fixed of ['now', 'tags', 'articles', 'projects', 'dashboard', 'contact', 'privacy', 'about', 'en', 'cn']) {
    assert.throws(() => assertArticleSlug(fixed), new RegExp(`与网站固定地址 /${fixed} 冲突`));
  }
  assert.equal(translationLanguage('en'), 'en');
  assert.equal(translationLanguage('English'), 'en');
  assert.equal(translationLanguage('Japanese'), 'ja');
  assert.throws(() => translationLanguage('simplified chinese'), /中文写在 #blog/);
  assert.throws(() => translationLanguage(null), /Language/);
});

test('the same slug pairs a #blog card with its #i18n language versions', async () => {
  const f = await setup({}, [[EN, 'My toolset', { Language: 'en', slug: 'toolset' }], [JA, '私のツール', { Language: 'ja', slug: 'toolset' }]]);
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

test('pairing ignores the relation and never fills English from the Chinese body', async () => {
  let f = await setup({}, [[EN, 'My toolset', { Language: 'en', slug: 'tools' }]]);
  let plan = await ok(preview(f));
  assert.equal(plan.changes.some(change => change.id === EN), false);
  f = await setup({}, [[EN, 'My toolset', { Language: 'en', slug: 'toolset' }]]);
  f.cardSources.set(OLD, '# Stray\n\nnot tagged');
  f.i18n.set(OLD, { Language: 'en', slug: 'other' });
  plan = await ok(preview(f));
  assert.equal(plan.changes.some(change => change.id === OLD), false);
  assert.equal(plan.changes.some(change => change.id === EN), true);
  const en = plan.changes.find(change => change.id === EN);
  assert.match(en.afterContent, /My toolset body/);
  assert.doesNotMatch(en.afterContent, /中文原文/);
  f = await setup({}, [[EN, 'My toolset', { Language: 'en', slug: 'toolset' }], [JA, 'Toolset again', { Language: 'en', slug: 'toolset' }]]);
  const res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /两张 en 译文/);
  f = await setup({}, [[EN, '工具箱', { Language: 'cn', slug: 'toolset' }]]);
  plan = await ok(preview(f));
  assert.equal(plan.changes.some(change => change.translation), false);
  assert.equal(plan.changes.some(change => /中文原文/.test(change.afterContent) && change.language === 'en'), false);
});

test('without a slug there is no English page to pair', async () => {
  const f = await setup({ slug: undefined }, [[EN, 'My toolset', { Language: 'en', slug: 'toolset' }]]);
  delete f.properties.get(ZH).slug;
  const plan = await ok(preview(f));
  assert.equal(plan.filePath, `src/content/articles/hepta-${ZH}.mdx`);
  assert.equal(plan.changes.some(c => c.translation), false);
});

test('each language is published only when that language is approved', async () => {
  const decide = async (languages, decision) => {
    const f = await setup({}, [[EN, 'My toolset', { Language: 'en', slug: 'toolset' }]]);
    const plan = await ok(preview(f));
    const res = await f.request('/heptabase/decision', 'POST', { ...input(), sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision, confirmPublic: true, languages });
    assert.equal(res.status, 200, await res.clone().text());
    return f;
  };
  let f = await decide({ zh: 'approve', en: 'reject' }, 'approve');
  assert.equal(f.DB.sqlite.prepare("SELECT raw FROM studio_drafts WHERE path = 'src/content/articles/toolset/en.mdx'").get(), undefined);
  assert.match(f.DB.sqlite.prepare("SELECT raw FROM studio_drafts WHERE path = 'src/content/articles/toolset.mdx'").get().raw, /中文原文/);
  f = await decide({ zh: 'reject', en: 'approve' }, 'reject');
  const english = parseMdx(f.DB.sqlite.prepare("SELECT raw FROM studio_drafts WHERE path = 'src/content/articles/toolset/en.mdx'").get().raw);
  assert.match(english.bodyZh, /My toolset body/);
  assert.doesNotMatch(english.bodyZh, /中文原文/);
  assert.equal(english.frontmatter.title, 'My toolset');
  assert.equal(f.DB.sqlite.prepare("SELECT raw FROM studio_drafts WHERE path = 'src/content/articles/toolset.mdx'").get(), undefined);
});

test('a URL taken by another article or a fixed route is refused; a linked article is not moved', async () => {
  let f = await setup();
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: '别的文章', description: '占用', date: '2026-01-02', heptabaseCardLink: link(OLD) }, bodyZh: '占用' }), 'src/content/articles/toolset.mdx');
  let res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /地址 \/toolset 已被「别的文章」使用/);
  f = await setup({ slug: 'now' });
  res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /slug「now」与网站固定地址 \/now 冲突/);
  f = await setup();
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: '我的工具箱', description: '旧地址', date: '2026-01-02', heptabaseCardLink: link(ZH) }, bodyZh: '正文' }), 'src/content/articles/my-toolset.mdx');
  res = await preview(f, { id: 'my-toolset' }); assert.equal(res.status, 409); assert.match((await res.json()).error, /已发布在 \/my-toolset/);
});

test('a project and a page publish the related English translation beside the source', async () => {
  const f = await fixture();
  globalThis.fetch = f.fetcher;
  await f.login();
  await f.connect();
  f.properties.get(CARD).Status = 'writing';
  const project = 'c31ada66-3333-4759-8b1f-830c8374fcae', projectEn = 'c41ada66-4444-4759-8b1f-830c8374fcae';
  f.properties.set(project, { Status: 'review', 'Blog Type': 'Project', slug: 'trace', 'blog i18n': [`card/${OLD}`] });
  f.cardSources.set(project, '# 痕迹\n\n中文项目。');
  f.remote(serializeMdx({ frontmatter: { slot: 'project', title: '痕迹', description: '中文', heptabaseCardLink: link(project) }, bodyZh: '中文项目。' }), 'src/content/projects/sample-trace.mdx');
  f.cardSources.set(projectEn, '# Trace\n\nEnglish project.');
  f.i18n.set(projectEn, { Language: 'en', slug: 'trace' });
  const preview = (card, collection) => f.request('/heptabase/preview', 'POST', { cardLink: link(card), collection, preparePublish: true, reviewOnly: true });
  let plan = await ok(preview(project, 'projects'));
  let en = plan.changes.find(change => change.id === projectEn);
  assert.deepEqual([en.path, en.translation, en.language, en.afterProperties.title, en.afterProperties.slot, en.afterProperties.translationOf], ['src/content/projects/sample-trace/en.mdx', true, 'en', 'Trace', 'project', link(project)]);
  assert.equal(en.afterProperties.date, plan.changes.find(change => change.id === project).afterProperties.date);
  await ok(f.request('/heptabase/decision', 'POST', { cardLink: link(project), collection: 'projects', preparePublish: true, reviewOnly: true, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true }));
  assert.equal((await ok(f.request('/doc?collection=projects&id=sample-trace%2Fen'))).href, '/sample-trace');

  const page = 'f11ada66-1111-4759-9b1f-830c8374fcae', pageEn = 'e21ada66-2222-4759-8b1f-830c8374fcae';
  f.properties.set(page, { Status: 'review', 'Blog Type': 'Page', slug: 'notes', 'Publish Date': { start: '2024-04-02T00:00:00.000Z' }, 'blog i18n': [`card/${OLD}`] });
  f.cardSources.set(page, '# 笔记\n\n中文页面。');
  f.remote(serializeMdx({ frontmatter: { slot: 'page', title: '笔记', description: '笔记', date: '2024-04-02', heptabaseCardLink: link(page) }, bodyZh: '中文页面。' }), 'src/content/pages/notes.mdx');
  f.cardSources.set(pageEn, '# Notes\n\nEnglish page.');
  f.i18n.set(pageEn, { Language: 'en', slug: 'notes' });
  plan = await ok(preview(page, 'pages'));
  en = plan.changes.find(change => change.id === pageEn);
  assert.deepEqual([en.path, en.translation, en.language, en.afterProperties.title, en.afterProperties.slot], ['src/content/pages/notes/en.mdx', true, 'en', 'Notes', 'page']);
  assert.equal(en.afterProperties.translationOf, link(page));
  assert.equal(Boolean(en.afterProperties.tags), false);
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

test('the blocked status is Blocked in any case; the old block option is not accepted', () => {
  const schema = { tagId: 't', status: { name: 'Status' }, date: { name: 'Publish Date' }, tags: { name: 'Tag' }, type: { name: 'Blog Type', options: ['Article', 'Project', 'Page', 'Reference'].map(name => ({ name })) }, summary: { name: 'Summary' }, remark: null, url: null, i18n: null };
  const card = status => `card "x" [1] 2 lines\n--- Databases ---\n- tag "blog" [t]\n  - "Status": "${status}"\n1\t# x`;
  assert.equal(propertiesFromRead(card('Blocked'), schema).status, 'blocked');
  assert.equal(propertiesFromRead(card('blocked'), schema).status, 'blocked');
  assert.throws(() => propertiesFromRead(card('block'), schema), /Status 选项尚未对应/);
});
