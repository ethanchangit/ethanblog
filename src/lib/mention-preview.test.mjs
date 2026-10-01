import assert from 'node:assert/strict';
import test from 'node:test';
import { externalMention, mentionBodyHtml, mentionCatalogPath, mentionMeta, mentionSummary, normalizeMentionHref } from './mention-preview.ts';

test('摘要里的链接只留文字，空摘要不写占位', () => {
  assert.equal(mentionSummary('见 [意图](https://example.com/very/long) 即可'), '见 意图 即可');
  assert.equal(mentionSummary('   '), '');
  assert.equal(mentionSummary(''), '');
});

test('摘要和正文开头分开保留', async () => {
  const body = '第一段说明方法。\n\n第二段继续写下去。';
  assert.equal(mentionSummary('短摘要'), '短摘要');
  assert.equal(await mentionBodyHtml(body), '<p>第一段说明方法。</p>\n<p>第二段继续写下去。</p>');
});

test('正文开头去掉组件和代码，保留原来的段落、标题和列表', async () => {
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
  assert.equal(await mentionBodyHtml(body), '<p>开头这一段要留下。</p>\n<h2>小标题</h2>\n<ul>\n<li>第一条</li>\n</ul>\n<p>后面还有一段。</p>');
});

test('正文只带到够填卡片的长度，嵌套列表同样限制长度并保持完整结构', async () => {
  const body = Array.from({ length: 12 }, (_, index) => `段落${index}。${'字'.repeat(90)}`).join('\n\n');
  const html = await mentionBodyHtml(body);
  assert.ok((html.match(/<p>/g) ?? []).length > 1);
  assert.ok((html.match(/<p>/g) ?? []).length <= 8);
  assert.equal(html.includes('段落11'), false);
  const list = await mentionBodyHtml('- 开头\n\n' + Array.from({ length: 20 }, (_, index) => `  ${index + 1}. 条目${index}`).join('\n\n'));
  assert.equal((list.match(/<li>/g) ?? []).length, 8);
  assert.match(list, /<ul>[\s\S]*<ol>[\s\S]*<\/ol>\n<\/li>\n<\/ul>$/);
  assert.equal(list.includes('条目19'), false);
});

test('保留列表层级、起始编号、引用、粗体、斜体、删除线和行内代码', async () => {
  const html = await mentionBodyHtml('> **重要** *说明* ~~旧版~~ `代码`\n\n- 阅读\n\n  3. [收藏](https://example.com)\n\n  4. 同步\n\n- 完成');
  assert.match(html, /<blockquote>\n<p><strong>重要<\/strong> <em>说明<\/em> <del>旧版<\/del> <code>代码<\/code><\/p>/);
  assert.match(html, /<ul>\n<li>\n<p>阅读<\/p>\n<ol start="3">/);
  assert.match(html, /<a href="https:\/\/example.com">收藏<\/a>/);
  assert.match(html, /<li>\n<p>同步<\/p>\n<\/li>/);
});

test('生成的 mention 链接与引用式链接保留，图片、脚本和不安全链接不进入预览', async () => {
  const html = await mentionBodyHtml([
    '<a href="/readwise-reader" data-doc-mention>Readwise Reader</a> 和 [参考][ref]',
    '',
    '[ref]: /my-toolset',
    '',
    '<script>alert(1)</script><Widget client:load />',
    '',
    '![图片][photo] [危险](javascript:alert%281%29)',
    '',
    '[photo]: https://example.com/tracker.png',
    '',
    '<img src="https://example.com/tracker.png" onerror="alert(1)">',
  ].join('\n'));
  assert.match(html, /<a href="\/readwise-reader">Readwise Reader<\/a>/);
  assert.match(html, /<a href="\/my-toolset">参考<\/a>/);
  assert.match(html, /<a href="#">危险<\/a>/);
  assert.doesNotMatch(html, /<script|<img|Widget|javascript:|tracker\.png|onerror|alert\(1\)/);
});

test('外链预览只有可见文字和完整地址', () => {
  assert.deepEqual(
    externalMention('https://nownownow.com/about', 'nownownow.com', 'http://localhost:4321/now'),
    { title: 'nownownow.com', url: 'https://nownownow.com/about' },
  );
  assert.deepEqual(
    externalMention('https://example.com/path?q=1#part', '  示例  ', 'http://localhost:4321/pkm-method'),
    { title: '示例', url: 'https://example.com/path?q=1#part' },
  );
  assert.equal(externalMention('https://example.com', '示例', 'http://localhost:4321/pkm-method')?.url, 'https://example.com/');
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
