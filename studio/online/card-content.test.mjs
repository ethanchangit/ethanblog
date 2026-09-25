import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { fromHeptabase, references } from './card-content.mjs';
import { mentionPagesFromContent, rewriteMentionTree } from '../../plugins/remark-heptabase-mentions.mjs';

const heptabase = '158824e6-cf72-4754-9a76-152c03dde273';
const targets = new Map([
  [heptabase, { collection: 'articles', id: 'heptabase', title: 'Heptabase' }],
]);

test('a list mention stays a link when the card id is not the second attribute', () => {
  const source = `# My Toolset\n\n1. <hepta-mention id="${heptabase}" type="card" >Heptabase</hepta-mention>`;
  const body = fromHeptabase(source, targets).body;
  assert.match(body, /1\. <a href="\/heptabase" data-doc-of="articles\/heptabase" data-doc-mention>Heptabase<\/a>/);
  assert.doesNotMatch(body, /^1\. Heptabase$/m);
  assert.equal(references(source)[0].id, heptabase);
  assert.equal(references(source)[0].title, 'Heptabase');
});

test('a mention with no site page keeps the readable title and drops the raw tag', () => {
  const source = `# 标题\n\n<hepta-mention type="card" id="${heptabase}">Heptabase</hepta-mention>\n\n<hepta-mention type="whiteboard" id="6a35251a-3e5c-440b-a3b8-52b6eb609e54">Skills</hepta-mention>`;
  const body = fromHeptabase(source, new Map()).body;
  assert.match(body, /Heptabase/);
  assert.match(body, /Skills/);
  assert.doesNotMatch(body, /hepta-mention|heptabase:\/\//);
  assert.doesNotMatch(body, /data-doc-mention/);
  assert.equal(references(source).length, 1);
  const unlabeled = fromHeptabase('# 标题\n\n<hepta-mention type="card">Heptabase</hepta-mention>', targets).body;
  assert.match(unlabeled, /Heptabase/);
  assert.doesNotMatch(unlabeled, /hepta-mention/);
});

test('My Toolset list mentions link to the published pages', () => {
  const tools = [
    ['158824e6-cf72-4754-9a76-152c03dde273', 'heptabase', 'Heptabase'],
    ['2eb0328a-0988-4a27-bd5a-7d2b4a08dc8b', 'readwise-reader', 'Readwise Reader'],
    ['254dc968-69a2-4cfe-b11a-9f5f60f54ee6', 'bitwarden', 'Bitwarden'],
  ];
  const pages = new Map(tools.map(([id, slug, title]) => [id, { collection: 'articles', id: slug, title }]));
  const source = `# My Toolset\n\n1. <hepta-mention type="card" id="${tools[0][0]}">${tools[0][2]}</hepta-mention>\n2. [Readwise Reader](heptabase://card/${tools[1][0]})\n3. <hepta-mention id="${tools[2][0]}" type="card">${tools[2][2]}</hepta-mention>`;
  const body = fromHeptabase(source, pages).body;
  assert.match(body, /1\. <a href="\/heptabase" data-doc-of="articles\/heptabase" data-doc-mention>Heptabase<\/a>/);
  assert.match(body, /2\. <a href="\/readwise-reader" data-doc-of="articles\/readwise-reader" data-doc-mention>Readwise Reader<\/a>/);
  assert.match(body, /3\. <a href="\/bitwarden" data-doc-of="articles\/bitwarden" data-doc-mention>Bitwarden<\/a>/);
  assert.doesNotMatch(body, /hepta-mention/);
  assert.doesNotMatch(body, /^[123]\. (?:Heptabase|Readwise Reader|Bitwarden)$/m);
});

test('the build pipeline rewrites the same mention syntax in any article', () => {
  const pages = mentionPagesFromContent();
  assert.equal(pages.get(heptabase)?.href, '/heptabase');
  const tree = unified().use(remarkParse).parse('1. <hepta-mention type="card" id="158824e6-cf72-4754-9a76-152c03dde273">Heptabase</hepta-mention>\n\n<hepta-mention type="whiteboard" id="6a35251a-3e5c-440b-a3b8-52b6eb609e54">Skills</hepta-mention>');
  rewriteMentionTree(tree, pages);
  const html = JSON.stringify(tree);
  assert.match(html, /href=\\"\/heptabase\\"/);
  assert.match(html, /data-doc-mention/);
  assert.match(html, /Skills/);
  assert.doesNotMatch(html, /hepta-mention/);
});

test('a mention inside code stays literal', () => {
  const source = `# 标题\n\n\`<hepta-mention id="${heptabase}" type="card">Heptabase</hepta-mention>\``;
  const body = fromHeptabase(source, targets).body;
  assert.match(body, /<hepta-mention id="/);
  assert.doesNotMatch(body, /data-doc-mention/);
});
