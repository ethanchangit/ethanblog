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
  f.properties.set(ZH, { Status: 'review', slug: 'toolset', 'blog i18n': translations.map(([id]) => `card/${id}`), ...props });
  for (const [id, title, values] of translations) { f.cardSources.set(id, `# ${title}\n\n${title} body.`); f.i18n.set(id, values); }
  return f;
}
const input = (extra = {}) => ({ cardLink: link(ZH), collection: 'articles', preparePublish: true, reviewOnly: true, ...extra });
const preview = (f, extra) => f.request('/heptabase/preview', 'POST', input(extra));
const approve = (f, plan) => f.request('/heptabase/decision', 'POST', { ...input(), sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true });

test('URL is the slug as written; translation language codes stay on the card', () => {
  assert.equal(routeSlug(' /toolset/ '), 'toolset');
  assert.equal(routeSlug(''), null);
  // Reading a slug never rejects it. A Page named now must not abort the whole pull.
  // Article slugs are checked when that card is routed.
  assert.equal(routeSlug('My Toolset'), 'My Toolset');
  assert.equal(routeSlug('2024'), '2024');
  assert.throws(() => assertArticleSlug('My Toolset'));
  assert.throws(() => assertArticleSlug('2024'));
  for (const fixed of ['now', 'tags', 'articles', 'projects', 'dashboard', 'contact', 'privacy', 'about', 'en', 'cn']) {
    assert.equal(routeSlug(fixed), fixed);
    assert.throws(() => assertArticleSlug(fixed), new RegExp(`与网站固定地址 /${fixed} 冲突`));
  }
  assert.equal(translationLanguage('en'), 'en');
  assert.equal(translationLanguage('English'), 'en');
  assert.equal(translationLanguage('Japanese'), 'ja');
  assert.throws(() => translationLanguage('simplified chinese'), /中文写在 #blog/);
  assert.throws(() => translationLanguage(null), /Language/);
});

test('a linked English card does not replace the #blog page', async () => {
  const f = await setup({}, [[EN, 'My toolset', { Language: 'en', slug: 'toolset' }]]);
  f.cardSources.set(ZH, '# 我的工具箱\n\n- Notes are a tool for thinking.\n  笔记是思考的工具。\n\n中文原文。');
  const plan = await ok(preview(f));
  assert.equal(plan.filePath, 'src/content/articles/toolset.mdx');
  assert.equal(plan.changes.length, 1);
  const page = plan.changes[0];
  assert.equal(page.id, ZH);
  assert.equal(page.afterProperties.url, 'toolset');
  assert.equal(page.afterProperties.language, undefined);
  assert.equal(page.afterProperties.title, '我的工具箱');
  assert.match(page.afterContent, /- Notes are a tool for thinking\.\n {2}笔记是思考的工具。/);
  assert.match(page.afterContent, /中文原文/);
  assert.doesNotMatch(page.afterContent, /My toolset body/);
  await ok(approve(f, plan));
  assert.equal(f.properties.get(ZH).Status, 'published');
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_drafts').get().n, 1);
  assert.equal((await ok(f.request('/doc?collection=articles&id=toolset'))).href, '/toolset');
  await ok(f.request('/git/commit', 'POST', { message: '按卡片原文发布' }));
  assert.deepEqual(f.changedFiles().map(c => c.filename), ['src/content/articles/toolset.mdx']);
  const published = parseMdx(f.text('src/content/articles/toolset.mdx'));
  assert.equal(published.frontmatter.language, undefined);
  assert.equal(published.frontmatter.title, '我的工具箱');
  assert.match(published.bodyZh, /笔记是思考的工具/);
});

test('a non-English translation is not published beside the page', async () => {
  const f = await setup({}, [[EN, 'My toolset', { Language: 'en' }], [JA, '私のツール', { Language: 'ja' }]]);
  const plan = await ok(preview(f));
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].id, ZH);
  assert.equal(plan.changes[0].afterProperties.title, '我的工具箱');
  assert.match(plan.changes[0].afterContent, /中文原文/);
  assert.equal(plan.changes.some((change) => change.id === EN || change.id === JA), false);
});

test('a translation must be in #blogi18n, carry the same URL, and be the only one for its language', async () => {
  let f = await setup({}, [[EN, 'My toolset', { Language: 'en', slug: 'tools' }]]);
  let res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /URL「tools」和中文原文的 URL「toolset」不一致/);
  f = await setup({ 'blog i18n': [`card/${OLD}`] }); f.cardSources.set(OLD, '# Stray\n\nnot tagged');
  res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /不在 #blogi18n 里/);
  f = await setup({}, [[EN, 'My toolset', { Language: 'en' }], [JA, 'Toolset again', { Language: 'en' }]]);
  res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /两张 en 译文/);
  f = await setup({}, [[EN, '工具箱', { Language: 'simplified chinese' }]]);
  res = await preview(f); assert.equal(res.status, 400); assert.match((await res.json()).error, /中文写在 #blog/);
});

test('without URL the card keeps its slug and the linked translation is not a second page', async () => {
  const f = await setup({ slug: undefined }, [[EN, 'My toolset', { Language: 'en' }]]);
  delete f.properties.get(ZH).slug;
  const plan = await ok(preview(f));
  assert.equal(plan.filePath, `src/content/articles/hepta-${ZH}.mdx`);
  assert.equal(plan.changes.length, 1);
  assert.equal(plan.changes[0].afterProperties.title, '我的工具箱');
  assert.match(plan.changes[0].afterContent, /中文原文/);
  assert.equal(plan.changes[0].afterProperties.language, undefined);
});

test('a URL taken by another article or a fixed route is refused; a linked article is not moved', async () => {
  let f = await setup();
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: '别的文章', description: '占用', date: '2026-01-02', heptabaseCardLink: link(OLD) }, bodyZh: '占用' }), 'src/content/articles/toolset.mdx');
  let res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /地址 \/toolset 已被「别的文章」使用/);
  f = await setup({ slug: 'now' });
  res = await preview(f); assert.equal(res.status, 409); assert.match((await res.json()).error, /URL「now」与网站固定地址 \/now 冲突/);
  f = await setup();
  f.remote(serializeMdx({ frontmatter: { slot: 'article', title: '我的工具箱', description: '旧地址', date: '2026-01-02', heptabaseCardLink: link(ZH) }, bodyZh: '正文' }), 'src/content/articles/my-toolset.mdx');
  res = await preview(f, { id: 'my-toolset' }); assert.equal(res.status, 409); assert.match((await res.json()).error, /已发布在 \/my-toolset/);
});

test('a project and a page publish the #blog card as the only page', async () => {
  const f = await fixture();
  globalThis.fetch = f.fetcher;
  await f.login();
  await f.connect();
  f.properties.get(CARD).Status = 'writing';
  const project = 'c31ada66-3333-4759-8b1f-830c8374fcae', projectEn = 'c41ada66-4444-4759-8b1f-830c8374fcae';
  f.properties.set(project, { Status: 'review', 'Blog Type': 'Project', 'blog i18n': [`card/${projectEn}`] });
  f.cardSources.set(project, '# 痕迹\n\n中文项目。');
  f.remote(serializeMdx({ frontmatter: { slot: 'project', title: '痕迹', description: '中文', heptabaseCardLink: link(project) }, bodyZh: '中文项目。' }), 'src/content/projects/sample-trace.mdx');
  f.cardSources.set(projectEn, '# Trace\n\nEnglish project.');
  f.i18n.set(projectEn, { Language: 'en' });
  const preview = (card, collection) => f.request('/heptabase/preview', 'POST', { cardLink: link(card), collection, preparePublish: true, reviewOnly: true });
  let plan = await ok(preview(project, 'projects'));
  const projectPage = plan.changes.find(change => change.id === project);
  assert.equal(plan.changes.some(change => change.id === projectEn), false);
  assert.match(projectPage.afterContent, /中文项目/);
  assert.doesNotMatch(projectPage.afterContent, /English project/);
  assert.deepEqual([projectPage.path, projectPage.afterProperties.title, projectPage.afterProperties.slot, projectPage.afterProperties.language], ['src/content/projects/sample-trace.mdx', '痕迹', 'project', undefined]);
  await ok(f.request('/heptabase/decision', 'POST', { cardLink: link(project), collection: 'projects', preparePublish: true, reviewOnly: true, sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash, decision: 'approve', confirmPublic: true }));
  assert.equal((await ok(f.request('/doc?collection=projects&id=sample-trace'))).href, '/sample-trace');

  const page = 'f11ada66-1111-4759-9b1f-830c8374fcae', pageEn = 'e21ada66-2222-4759-8b1f-830c8374fcae';
  f.properties.set(page, { Status: 'review', 'Blog Type': 'Page', 'Publish Date': { start: '2024-04-02T00:00:00.000Z' }, 'blog i18n': [`card/${pageEn}`] });
  f.cardSources.set(page, '# 笔记\n\n中文页面。');
  f.remote(serializeMdx({ frontmatter: { slot: 'page', title: '笔记', description: '笔记', date: '2024-04-02', heptabaseCardLink: link(page) }, bodyZh: '中文页面。' }), 'src/content/pages/notes.mdx');
  f.cardSources.set(pageEn, '# Notes\n\nEnglish page.');
  f.i18n.set(pageEn, { Language: 'en' });
  plan = await ok(preview(page, 'pages'));
  const notes = plan.changes.find(change => change.id === page);
  assert.equal(plan.changes.some(change => change.id === pageEn), false);
  assert.match(notes.afterContent, /中文页面/);
  assert.doesNotMatch(notes.afterContent, /English page/);
  assert.deepEqual([notes.path, notes.afterProperties.title, notes.afterProperties.slot, notes.afterProperties.language], ['src/content/pages/notes.mdx', '笔记', 'page', undefined]);
  assert.equal(Boolean(notes.afterProperties.tags), false);
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
