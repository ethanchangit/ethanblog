import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paragraphs, paragraphDiff, renderedProse, tagDiff, onlyTagsChanged } from './review-content.mjs';

test('tag differences separate additions and removals without treating reorder or duplicates as edits', () => {
  assert.deepEqual(tagDiff(['Mission', 'AI Native'], ['Productivity', 'Mission']), { added: ['Productivity'], removed: ['AI Native'], unchanged: ['Mission'] });
  assert.deepEqual(tagDiff(['Mission', 'AI Native', 'Mission'], ['AI Native', 'Mission', 'AI Native']), { added: [], removed: [], unchanged: ['AI Native', 'Mission'] });
  assert.deepEqual(tagDiff(['Mission'], []), { added: [], removed: ['Mission'], unchanged: [] });
  assert.deepEqual(tagDiff(undefined, ['Mission']), { added: ['Mission'], removed: [], unchanged: [] });
  assert.deepEqual(tagDiff(['AI'], ['ai']), { added: ['ai'], removed: ['AI'], unchanged: [] });
});

test('tag-only labels ignore workflow status but not content, dates or other publication properties', () => {
  const card = { previouslyPublished: true, beforeContent: '正文。', afterContent: '正文。\n', beforeProperties: { title: '标题', date: '2024-01-01', tags: ['Mission'], heptabaseStatus: 'published' }, afterProperties: { title: '标题', date: '2024-01-01', tags: ['AI Native'], heptabaseStatus: 'review', listed: true, draft: false, featured: false } };
  assert.equal(onlyTagsChanged(card), true);
  assert.equal(onlyTagsChanged({ ...card, afterProperties: { ...card.afterProperties, tags: [] } }), true);
  for (const [key, value] of Object.entries({ title: '新标题', description: '新摘要', date: '2024-02-01', updated: '2024-02-01', listed: false, featured: true, customField: '变化' })) {
    assert.equal(onlyTagsChanged({ ...card, afterProperties: { ...card.afterProperties, [key]: value } }), false, key);
  }
  assert.equal(onlyTagsChanged({ ...card, afterContent: '新正文。' }), false);
  assert.equal(onlyTagsChanged({ ...card, previouslyPublished: false }), false);
  assert.equal(onlyTagsChanged({ ...card, afterProperties: { ...card.afterProperties, tags: ['Mission', 'Mission'] } }), false);
  assert.equal(onlyTagsChanged(undefined), false);
});

test('paragraph alignment isolates separated edits and preserves the unchanged middle', () => {
  const diff = paragraphDiff('第一段旧文。\n\n第二段不变。\n\n第三段旧文。', '第一段改写。\n\n第二段不变。\n\n第三段改写。\n\n新增结尾。');
  assert.deepEqual(diff.filter(d => d.after).map(d => d.kind), ['modified', 'unchanged', 'modified', 'added']);
  const unchanged = diff.find(d => d.kind === 'unchanged');
  assert.equal(unchanged.from, 2); assert.equal(unchanged.to, 2);
  assert.equal(paragraphDiff('软换行\n在同一段', '软换行 在同一段')[0].kind, 'unchanged');
});
test('paragraphs preserve code fences, lists, tables and repeated paragraphs', () => {
  const source = '```js\nconst x = 1;\n\nconst y = 2;\n```\n\n- one\n- two\n\n| A | B |\n|---|---|\n| 1 | 2 |';
  assert.deepEqual(paragraphs(source).map(p => p.type), ['code', 'list', 'table']);
  assert.equal(paragraphDiff(source, source).length, 3);
  assert.deepEqual(paragraphDiff('重复\n\n重复\n\n尾声', '重复\n\n尾声').map(p => p.kind), ['unchanged', 'modified', 'removed']);
  assert.deepEqual(paragraphDiff('甲\n\n乙\n\n丙', '乙\n\n甲\n\n丙').map(p => p.kind), ['modified', 'modified', 'unchanged']);
  assert.throws(() => paragraphs('x'.repeat(300001)), /正文过长/);
});
test('full review preserves both complete document orders, including shifted and repeated blocks', () => {
  const samples = [
    ['', '首次发布'], ['撤下全文', ''],
    ['甲\n\n乙\n\n丙', '乙\n\n甲\n\n丙'],
    ['甲\n\n乙\n\n丙\n\n丁', '丁\n\n乙\n\n新增\n\n甲'],
    ['重复\n\n重复\n\n旧文\n\n结尾', '新文\n\n重复\n\n结尾\n\n重复'],
    ['旧段落', '新段落一\n\n新段落二'],
    ['旧段落一\n\n旧段落二', '合并后'],
  ];
  // Every before block reconstructs the original, and every after block
  // reconstructs the next version. Comparison is by position, not by moves.
  for (const [before, after] of samples) {
    const diff = paragraphDiff(before, after);
    assert.equal(diff.some(d => d.kind === 'moved'), false);
    assert.deepEqual(diff.filter(d => d.before).map(d => d.before), paragraphs(before).map(p => p.text));
    assert.deepEqual(diff.filter(d => d.after).map(d => d.after), paragraphs(after).map(p => p.text));
  }
  const shifted = paragraphDiff(['1', '2', '3', '4', '5', '6'].join('\n\n'), ['1', '2', '5', '3', '4', '6'].join('\n\n'));
  assert.deepEqual(shifted.map(d => d.kind), ['unchanged', 'unchanged', 'modified', 'modified', 'modified', 'unchanged']);
  assert.deepEqual(shifted.filter(d => d.kind === 'modified').map(d => [d.before, d.after]), [['3', '5'], ['4', '3'], ['5', '4']]);
});
test('review blocks resolve links from their own full document and keep unsafe targets inert', async () => {
  const source = '[资料][ref]', before = `${source}\n\n[ref]: https://example.com/old`, after = `${source}\n\n[ref]: https://example.com/new`;
  assert.match(await renderedProse(source, undefined, before), /href="https:\/\/example.com\/old"/);
  assert.match(await renderedProse(source, undefined, after), /href="https:\/\/example.com\/new"/);
  assert.ok(!(await renderedProse(source, undefined, `${source}\n\n[ref]: javascript:alert(1)`)).includes('href="javascript:'));
});
test('a table that changes place is a rewrite at each shifted position', () => {
  const table = '| 阶段 | 做法 |\n| --- | --- |\n| 写作 | 从问题开始 |';
  const before = ['第一段', '原来的第二段', table, '结尾'], after = ['第一段', '改写的第二段', '结尾', table, '新段落'];
  const diff = paragraphDiff(before.join('\n\n'), after.join('\n\n'));
  assert.deepEqual(diff.filter(c => c.before).map(c => c.before), before);
  assert.deepEqual(diff.filter(c => c.after).map(c => c.after), after);
  assert.deepEqual(diff.map(c => c.kind), ['unchanged', 'modified', 'modified', 'modified', 'added']);
  assert.equal(diff.some(c => c.kind === 'moved'), false);
  assert.equal(diff[2].before, table);
  assert.equal(diff[3].after, table);
});
test('preview renders prose and references, but never executes card HTML or loads trackers', async () => {
  const mdx = '## 标题\n\n**粗体**和 [链接](https://example.com)。\n\n<DocList pane="embed">\n<DocRef of="articles/ref" />\n</DocList>\n\n<a href="/articles/ref" data-doc-mention>引用</a>';
  const html = await renderedProse(mdx, path => `<nav>${path}</nav>`);
  assert.match(html, /<h2>标题<\/h2>/); assert.match(html, /<strong>粗体<\/strong>/); assert.match(html, /<nav>articles\/ref<\/nav>/);
  assert.match(html, /href="\/articles\/ref"/);
  const malicious = await renderedProse('<script>alert(1)</script>\n\n[x](javascript:alert%281%29)\n\n![private](https://tracker.example/pixel)');
  assert.ok(!malicious.includes('<script>')); assert.ok(!malicious.includes('href="javascript:')); assert.ok(!malicious.includes('<img'));
  const literal = await renderedProse('```mdx\n<DocList>\n<DocRef of="articles/ref" />\n</DocList>\n```');
  assert.match(literal, /(?:&lt;|&#x3C;)DocRef/); assert.ok(!literal.includes('DASHBOARDREF'));
});
