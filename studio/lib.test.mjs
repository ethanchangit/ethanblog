import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'os';
import path from 'node:path';
import { describe, it } from 'node:test';
import { promisify } from 'node:util';
import {
  addDocRefToRaw,
  createDoc,
  gitCommit,
  gitStatus,
  isSafeId,
  listDocRefs,
  listDocs,
  parseMdx,
  readDoc,
  removeDocRefFromRaw,
  resolveDocPath,
  saveDoc,
  serializeMdx,
  setBlogsRef,
  slugify,
} from './lib.mjs';
import {
  atQueryAtCaret,
  classifyBlock,
  clearBlockFormat,
  detectMarkdownShortcut,
  docRefMarkup,
  formatBlock,
  hasBlockFormat,
  isFormattedEmpty,
  joinBlocks,
  matchPages,
  mergeBlockMarkdown,
  renderBlockHtml,
  splitBlocks,
} from './blocks.mjs';

const execFileAsync = promisify(execFile);

const BLOGS = `---
title: "博客"
titleEn: "Blogs"
description: "手工引用。"
---

import { DocList, DocRef } from '@/components/media';

<DocList>
  <DocRef of="articles/pkm-method" />
</DocList>
`;

async function makeRepo() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'studio-'));
  await mkdir(path.join(root, 'src/content/articles'), { recursive: true });
  await mkdir(path.join(root, 'src/content/projects'), { recursive: true });
  await mkdir(path.join(root, 'src/content/pages'), { recursive: true });
  await writeFile(path.join(root, 'src/content/pages/blogs.mdx'), BLOGS);
  return root;
}

describe('studio lib', () => {
  it('slugify falls back for CJK titles', () => {
    assert.equal(slugify('Hello World'), 'hello-world');
    assert.match(slugify('我的文章', new Date('2026-08-22T12:00:00Z')), /^draft-2026-08-22$/);
  });

  it('rejects path escape ids', () => {
    assert.equal(isSafeId('articles', '../secret'), false);
    assert.equal(isSafeId('articles', '/etc/passwd'), false);
    assert.equal(isSafeId('articles', 'deep-dive/1'), true);
    assert.equal(isSafeId('articles', 'deep-dive/1/2'), true);
    assert.throws(() => resolveDocPath('/tmp/repo', 'articles', '../x'));
  });

  it('roundtrips bilingual MDX', () => {
    const raw = serializeMdx({
      frontmatter: { slot: 'article', title: '测试', date: '2026-08-22', draft: true },
      imports: '',
      bodyZh: '中文**段**。',
      bodyEn: 'English paragraph.',
    });
    const parsed = parseMdx(raw);
    assert.equal(parsed.frontmatter.slot, 'article');
    assert.equal(parsed.frontmatter.draft, true);
    assert.equal(parsed.bodyZh, '中文**段**。');
    assert.equal(parsed.bodyEn, 'English paragraph.');
    assert.match(raw, /<div data-lang-split><\/div>/);
  });

  it('creates article, project, and child pages on an ordinary article', async () => {
    const root = await makeRepo();
    try {
      const article = await createDoc(root, { kind: 'article', title: 'Hello Studio', slug: 'hello-studio' });
      assert.equal(article.id, 'hello-studio');
      const raw = await readFile(path.join(root, 'src/content/articles/hello-studio.mdx'), 'utf8');
      assert.match(raw, /slot: ["']?article/);
      assert.match(raw, /draft: true/);
      assert.match(raw, /在这里用 Markdown 写中文正文/);

      const project = await createDoc(root, { kind: 'project', title: 'Trace Two', slug: 'trace-two' });
      assert.equal(project.collection, 'projects');
      const projectRaw = await readFile(path.join(root, 'src/content/projects/trace-two.mdx'), 'utf8');
      assert.match(projectRaw, /slot: ["']?project/);

      const parent = await createDoc(root, { kind: 'article', title: 'Deep Dive', slug: 'deep-dive' });
      const child = await createDoc(root, {
        kind: 'child',
        title: '第一页',
        parentCollection: 'articles',
        parentId: parent.id,
      });
      assert.equal(child.id, 'deep-dive/1');
      const hub = await readFile(path.join(root, 'src/content/articles/deep-dive.mdx'), 'utf8');
      assert.match(hub, /DocRef of="articles\/deep-dive\/1"/);
      assert.match(hub, /pane="series"/);

      const nested = await createDoc(root, {
        kind: 'child',
        title: '更里一层',
        parentCollection: 'articles',
        parentId: child.id,
      });
      assert.equal(nested.id, 'deep-dive/1/1');
      const childRaw = await readFile(path.join(root, 'src/content/articles/deep-dive/1.mdx'), 'utf8');
      assert.match(childRaw, /DocRef of="articles\/deep-dive\/1\/1"/);
      const listed = await listDocs(root);
      assert.ok(listed.articles.some((item) => item.id === 'deep-dive/1/1'));
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('adds and removes /blogs DocRef links', async () => {
    const root = await makeRepo();
    try {
      await createDoc(root, { kind: 'article', title: 'Linked', slug: 'linked' });
      const refs = await setBlogsRef(root, 'articles/linked', true);
      assert.deepEqual(refs, ['articles/pkm-method', 'articles/linked']);
      const blogs = await readFile(path.join(root, 'src/content/pages/blogs.mdx'), 'utf8');
      assert.match(blogs, /<DocRef of="articles\/linked" \/>/);
      const removed = await setBlogsRef(root, 'articles/linked', false);
      assert.deepEqual(removed, ['articles/pkm-method']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('inserts DocRef into an existing article body', async () => {
    const raw = serializeMdx({
      frontmatter: { slot: 'article', title: 'Hub', date: '2026-08-22' },
      imports: '',
      bodyZh: '总览。',
      bodyEn: 'Hub.',
    });
    const next = addDocRefToRaw(raw, 'articles/pkm-method');
    assert.match(next, /import \{ DocList, DocRef \} from '@\/components\/media';/);
    assert.deepEqual(listDocRefs(next), ['articles/pkm-method']);
    assert.equal((next.match(/<DocRef /g) || []).length, 2);
    const stripped = removeDocRefFromRaw(next, 'articles/pkm-method');
    assert.equal(listDocRefs(stripped).length, 0);
  });

  it('saves form edits back to disk', async () => {
    const root = await makeRepo();
    try {
      await createDoc(root, { kind: 'article', title: 'Edit me', slug: 'edit-me' });
      await saveDoc(root, {
        collection: 'articles',
        id: 'edit-me',
        frontmatter: {
          slot: 'article',
          title: '改过的标题',
          description: '可检验的陈述句。',
          date: '2026-08-22',
          draft: true,
        },
        bodyZh: '## 一节\n\n正文。',
        bodyEn: '## A section\n\nBody.',
      });
      const doc = await readDoc(root, 'articles', 'edit-me');
      assert.equal(doc.frontmatter.title, '改过的标题');
      assert.equal(doc.bodyZh, '## 一节\n\n正文。');
      assert.equal(doc.bodyEn, '## A section\n\nBody.');
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('commits only src/content in a temp git repo', async () => {
    const root = await makeRepo();
    try {
      await execFileAsync('git', ['init'], { cwd: root });
      await execFileAsync('git', ['config', 'user.email', 'studio@test'], { cwd: root });
      await execFileAsync('git', ['config', 'user.name', 'Studio Test'], { cwd: root });
      await createDoc(root, { kind: 'article', title: 'Git Me', slug: 'git-me' });
      const status = await gitStatus(root);
      assert.equal(status.dirty, true);
      const committed = await gitCommit(root, 'add git-me draft');
      assert.equal(committed.dirty, false);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe('studio block editor helpers', () => {
  it('splits on blank lines, not on wrapped lines inside a paragraph', () => {
    const body = [
      '> 引用。',
      '',
      '## 标题',
      '',
      '第一句。',
      '同一段的硬换行仍算一段。',
      '',
      '- 甲',
      '- 乙',
    ].join('\n');
    const blocks = splitBlocks(body);
    assert.deepEqual(blocks, [
      '> 引用。',
      '## 标题',
      '第一句。\n同一段的硬换行仍算一段。',
      '- 甲\n- 乙',
    ]);
    assert.equal(joinBlocks(blocks), body);
  });

  it('keeps fenced code, MDX imports, and lang-split as opaque blocks', () => {
    const body = [
      'import { DocList } from \'@/components/media\';',
      '',
      '```js',
      'const x = 1;',
      '```',
      '',
      '<div data-lang-split></div>',
      '',
      '<DocList pane="series">',
      '  <DocRef of="articles/hello" />',
      '</DocList>',
    ].join('\n');
    const blocks = splitBlocks(body);
    assert.equal(blocks.length, 4);
    assert.equal(joinBlocks(blocks), body);
    const jsx = renderBlockHtml(blocks[3]);
    assert.equal(jsx.includes('<DocList'), false);
    assert.match(jsx, /&lt;DocList/);
  });

  it('renders headings and quotes, and escapes scripts', () => {
    assert.match(renderBlockHtml('## 现在'), /<h2>现在<\/h2>/);
    assert.match(renderBlockHtml('> 引用 **加重**'), /<blockquote>/);
    assert.match(renderBlockHtml('> 引用 **加重**'), /<strong>加重<\/strong>/);
    const dirty = renderBlockHtml('<script>alert(1)</script>');
    assert.equal(dirty.includes('<script>'), false);
    assert.match(dirty, /&lt;script&gt;/);
    assert.equal(renderBlockHtml('[x](javascript:alert(1))').includes('javascript:'), false);
  });

  it('reads @query at the caret and ignores emails', () => {
    assert.deepEqual(atQueryAtCaret('见 @pk', 5), { start: 2, query: 'pk' });
    assert.equal(atQueryAtCaret('mail@host', 9), null);
    assert.deepEqual(atQueryAtCaret('@', 1), { start: 0, query: '' });
  });

  it('builds DocList/DocRef markup and matches pages by title or path', () => {
    assert.equal(
      docRefMarkup('articles/a-blog-of-a-blog', 'series'),
      '<DocList pane="series">\n  <DocRef of="articles/a-blog-of-a-blog" />\n</DocList>',
    );
    const pages = [
      { collection: 'articles', id: 'a-blog-of-a-blog', title: '一篇关于博客的博客', titleEn: 'A Blog of a Blog' },
      { collection: 'projects', id: 'trace', title: 'Trace' },
    ];
    assert.equal(matchPages(pages, '博客').length, 1);
    assert.equal(matchPages(pages, 'projects/trace')[0].id, 'trace');
    assert.equal(matchPages(pages, '').length, 2);
  });

  it('turns markdown shortcuts into block kinds and empty format backspaces to a paragraph', () => {
    assert.deepEqual(detectMarkdownShortcut('## '), { type: 'h', level: 2, text: '' });
    assert.deepEqual(detectMarkdownShortcut('> 引用'), { type: 'quote', text: '引用' });
    assert.deepEqual(detectMarkdownShortcut('- 列表'), { type: 'ul', text: '列表' });
    assert.equal(classifyBlock('## 标题').type, 'h');
    assert.equal(classifyBlock('## 标题').level, 2);
    assert.equal(formatBlock('h', '标题', { level: 2 }), '## 标题');
    assert.equal(isFormattedEmpty('##'), true);
    assert.equal(isFormattedEmpty('## 标题'), false);
    assert.equal(clearBlockFormat('##'), '');
    assert.equal(clearBlockFormat('> 引用'), '引用');
    assert.match(renderBlockHtml('##'), /<h2>/);
    assert.equal(hasBlockFormat('> 引用'), true);
    assert.equal(hasBlockFormat('普通段落'), false);
    assert.equal(clearBlockFormat('## 标题'), '标题');
    assert.equal(mergeBlockMarkdown('hello', 'world'), 'helloworld');
    assert.equal(mergeBlockMarkdown('## 甲', '乙'), '## 甲乙');
    assert.equal(mergeBlockMarkdown('> 甲', '乙'), '> 甲乙');
  });
});
