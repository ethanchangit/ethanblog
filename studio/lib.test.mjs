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
