import assert from 'node:assert/strict';
import test from 'node:test';
import { externalMention, mentionCatalogPath, mentionMeta, mentionParagraphs, mentionSummary, normalizeMentionHref } from './mention-preview.ts';

test('摘要里的链接只留文字，空摘要不写占位', () => {
  assert.equal(mentionSummary('见 [意图](https://example.com/very/long) 即可'), '见 意图 即可');
  assert.equal(mentionSummary('   '), '');
  assert.equal(mentionSummary(''), '');
});

test('摘要和正文开头分开保留', () => {
  const body = '第一段说明方法。\n\n第二段继续写下去。';
  assert.equal(mentionSummary('短摘要'), '短摘要');
  assert.deepEqual(mentionParagraphs(body), ['第一段说明方法。', '第二段继续写下去。']);
});

test('正文开头去掉组件和代码，留下连续的几段', () => {
  const body = [
    'import Widget from "./Widget.svelte";',
    '',
    '<Widget client:visible />',
    '',
    '```',
    'code only',
    '```',
    '',
    '开头这一段要留下。',
    '',
    '## 小标题',
    '',
    '- 第一条',
    '',
    '后面还有一段。',
  ].join('\n');
  assert.deepEqual(mentionParagraphs(body), ['开头这一段要留下。', '第一条', '后面还有一段。']);
});

test('正文只带到够填卡片的长度', () => {
  const body = Array.from({ length: 12 }, (_, index) => `段落${index}。${'字'.repeat(90)}`).join('\n\n');
  const paragraphs = mentionParagraphs(body);
  assert.ok(paragraphs.length > 1);
  assert.ok(paragraphs.length <= 8);
  assert.equal(paragraphs.some((paragraph) => paragraph.startsWith('段落11')), false);
});

test('外链预览只有可见文字和完整地址', () => {
  assert.deepEqual(
    externalMention('https://nownownow.com/about', 'nownownow.com', 'http://localhost:4321/now'),
    { title: 'nownownow.com', url: 'https://nownownow.com/about' },
  );
  assert.deepEqual(
    externalMention('https://example.com/path?q=1#part', '  示例  ', 'http://localhost:4321/lab'),
    { title: '示例', url: 'https://example.com/path?q=1#part' },
  );
  assert.equal(externalMention('https://example.com', '示例', 'http://localhost:4321/lab')?.url, 'https://example.com/');
  assert.equal(externalMention('mailto:me@example.com', '信', 'http://localhost:4321/now'), null);
  assert.equal(externalMention('https://cn.ethanchang.io/now', 'Now', 'http://localhost:4321/'), null);
  assert.equal(externalMention('https://evil.test/a', '   ', 'http://localhost:4321/now'), null);
  assert.equal(externalMention('#part', '章节', 'http://localhost:4321/now'), null);
  const card = externalMention('https://nownownow.com/about', 'nownownow.com', 'http://localhost:4321/now');
  assert.equal(JSON.stringify(card).includes('未填写'), false);
});

test('外站链接不是站内 mention 路径', () => {
  assert.equal(normalizeMentionHref('https://example.com/articles/a'), null);
  assert.equal(normalizeMentionHref('mailto:me@example.com'), null);
  assert.equal(normalizeMentionHref('/articles/pkm-method#part'), '/articles/pkm-method');
  assert.equal(normalizeMentionHref('/en/articles/pkm-method'), '/articles/pkm-method');
  assert.equal(normalizeMentionHref('https://cn.ethanchang.io/projects/aletheia'), '/projects/aletheia');
});

test('旧地址也能对上现在的目录键', () => {
  assert.equal(mentionCatalogPath('/pkm-method'), '/pkm-method');
  assert.equal(mentionCatalogPath('/articles/pkm-method#part'), '/pkm-method');
  assert.equal(mentionCatalogPath('/projects/aletheia'), '/aletheia');
  assert.equal(mentionCatalogPath('https://example.com/pkm-method'), null);
  assert.equal(mentionCatalogPath('/missing-doc'), '/missing-doc');
});

test('类型和日期组成一行元信息', () => {
  const meta = mentionMeta('reference', new Date('2026-09-21T12:00:00Z'), 'zh-CN');
  assert.match(meta, /^资料 · 2026 年 9 月 21 日$/);
  assert.equal(mentionMeta('project', undefined, 'en'), 'Project');
});
