import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fromHeptabase, references } from './card-content.mjs';

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

test('a mention with no readable card is not published as its label', () => {
  const source = `# 标题\n\n<hepta-mention type="card" id="${heptabase}">Heptabase</hepta-mention>`;
  assert.throws(() => fromHeptabase(source, new Map()), /尚未完整读取/);
  assert.throws(() => fromHeptabase('# 标题\n\n<hepta-mention type="card">Heptabase</hepta-mention>', targets), /纯文字/);
});

test('a mention inside code stays literal', () => {
  const source = `# 标题\n\n\`<hepta-mention id="${heptabase}" type="card">Heptabase</hepta-mention>\``;
  const body = fromHeptabase(source, targets).body;
  assert.match(body, /<hepta-mention id="/);
  assert.doesNotMatch(body, /data-doc-mention/);
});
