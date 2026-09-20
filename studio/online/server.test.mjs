import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { createHandler } from './server.mjs';

const article = `---
slot: article
title: "真实文章"
description: "用于在线 Studio 集成测试。"
titleEn: "Real article"
descriptionEn: "An integration fixture."
date: 2026-09-20
tags: [测试]
draft: true
customField: "保留字段"
---

import X from '../components/X.astro';

# 中文正文

<CustomComponent value="keep" />

<div data-lang-split></div>

# English body
`;

const blogs = `---
slot: page
title: "博客"
---

<DocList>
  <DocRef of="articles/real-article" />
</DocList>
`;

const tags = `export const tagGroups = [{ slug: "writing", title: "写作", titleEn: "Writing", tags: ["测试"] }];\n`;

function encoded(value) {
  return Buffer.from(value, 'utf8').toString('base64');
}

class FakeD1 {
  constructor() {
    this.rows = [];
    this.releases = [];
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  matchingDrafts() {
    const [userId, repository, branch, fourth] = this.args;
    const isStateQuery = this.sql.includes('AND state = ?4');
    const state = isStateQuery ? fourth : undefined;
    const path = isStateQuery ? undefined : fourth;
    return this.db.rows.filter((row) => row.user_id === userId && row.repository === repository && row.branch === branch
      && (state === undefined || row.state === state) && (path === undefined || row.path === path));
  }

  async all() {
    if (this.sql.includes('FROM studio_drafts')) return { results: this.matchingDrafts() };
    if (this.sql.includes('FROM studio_releases')) return { results: this.db.releases };
    return { results: [] };
  }

  async first() {
    if (this.sql.includes('FROM studio_drafts')) {
      const rows = this.matchingDrafts();
      return rows[0] ?? null;
    }
    if (this.sql.includes('FROM studio_releases')) return this.db.releases[0] ?? null;
    return null;
  }

  async run() {
    if (this.sql.includes('INSERT INTO studio_drafts')) {
      const [userId, repository, branch, path, raw, baseCommitSha, baseRaw, version, savedAt] = this.args;
      const existing = this.db.rows.find((row) => row.user_id === userId && row.repository === repository && row.branch === branch && row.path === path);
      const row = {
        ...(existing ?? { user_id: userId, repository, branch, path }),
        raw, base_commit_sha: baseCommitSha, base_raw: baseRaw, version, state: 'draft', saved_at: savedAt, updated_at: savedAt,
      };
      if (existing) Object.assign(existing, row); else this.db.rows.push(row);
    }
    if (this.sql.includes('UPDATE studio_drafts')) {
      const [submittedSha, updatedAt, userId, repository, branch, path] = this.args;
      const row = this.db.rows.find((item) => item.user_id === userId && item.repository === repository && item.branch === branch && item.path === path);
      if (row) Object.assign(row, { state: 'submitted', submitted_commit_sha: submittedSha, updated_at: updatedAt });
    }
    return { success: true };
  }
}

function githubFixture() {
  let revision = 'c1';
  let currentArticle = article;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    const path = url.pathname;
    if (path.endsWith('/git/ref/heads/main')) return Response.json({ object: { sha: revision } });
    if (path.endsWith('/git/commits/c1') || path.endsWith('/git/commits/c2')) return Response.json({ tree: { sha: 'tree-sha' } });
    if (path.includes('/git/trees/')) {
      return Response.json({ tree: [
        { path: 'src/content/articles/real-article.mdx', type: 'blob', sha: 'article-sha' },
        { path: 'src/content/pages/blogs.mdx', type: 'blob', sha: 'blogs-sha' },
        { path: 'src/data/tag-groups.ts', type: 'blob', sha: 'tags-sha' },
      ] });
    }
    if (path.endsWith('/git/blobs/article-sha')) return Response.json({ content: encoded(currentArticle) });
    if (path.endsWith('/git/blobs/blogs-sha')) return Response.json({ content: encoded(blogs) });
    if (path.endsWith('/git/blobs/tags-sha')) return Response.json({ content: encoded(tags) });
    return Response.json({ message: 'not found' }, { status: 404 });
  };
  return {
    setRemote(nextRevision, nextArticle) { revision = nextRevision; currentArticle = nextArticle; },
  };
}

function env(db) {
  return {
    DB: db,
    GITHUB_TOKEN: 'test-token-not-returned',
    STUDIO_ALLOWED_USER_EMAILS: 'owner@example.com',
  };
}

function request(path, init = {}, email = 'owner@example.com') {
  return new Request(`https://studio.example${path}`, {
    ...init,
    headers: {
      'oai-authenticated-user-id': 'owner-id',
      'oai-authenticated-user-email': email,
      ...(init.headers ?? {}),
    },
  });
}

afterEach(() => {
  delete globalThis.fetch;
});

test('rejects missing and non-author identities before GitHub access', async () => {
  const handler = createHandler({});
  const noIdentity = await handler(new Request('https://studio.example/__studio/api/docs'), env(new FakeD1()));
  assert.equal(noIdentity.status, 401);
  const nonAuthor = await handler(request('/__studio/api/docs', {}, 'other@example.com'), env(new FakeD1()));
  assert.equal(nonAuthor.status, 403);
});

test('reads GitHub content and persists versioned private drafts', async () => {
  const db = new FakeD1();
  githubFixture();
  const handler = createHandler({});
  const listed = await handler(request('/__studio/api/docs'), env(db));
  assert.equal(listed.status, 200);
  const listPayload = await listed.json();
  assert.equal(listPayload.articles[0].id, 'real-article');

  const saved = await handler(request('/__studio/api/doc', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://studio.example' },
    body: JSON.stringify({ collection: 'articles', id: 'real-article', sourceMode: true, raw: article.replace('真实文章', '私人草稿'), draftVersion: 0 }),
  }), env(db));
  assert.equal(saved.status, 200);
  const savedPayload = await saved.json();
  assert.equal(savedPayload.hasPrivateDraft, true);
  assert.equal(savedPayload.draftVersion, 1);

  const stale = await handler(request('/__studio/api/doc', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://studio.example' },
    body: JSON.stringify({ collection: 'articles', id: 'real-article', sourceMode: true, raw: article, draftVersion: 0 }),
  }), env(db));
  assert.equal(stale.status, 409);
});

test('does not overwrite a changed remote file and does not expose draft text', async () => {
  const db = new FakeD1();
  const fixture = githubFixture();
  const handler = createHandler({});
  await handler(request('/__studio/api/doc', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', origin: 'https://studio.example' },
    body: JSON.stringify({ collection: 'articles', id: 'real-article', sourceMode: true, raw: article.replace('真实文章', '私人草稿'), draftVersion: 0 }),
  }), env(db));
  fixture.setRemote('c2', article.replace('真实文章', '其他工具的修改'));
  const response = await handler(request('/__studio/api/git/commit', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'https://studio.example' },
    body: JSON.stringify({ message: '测试冲突' }),
  }), env(db));
  assert.equal(response.status, 409);
  const payload = await response.json();
  assert.equal(payload.conflicts[0].path, 'src/content/articles/real-article.mdx');
  assert.equal('draftRaw' in payload.conflicts[0], false);
  assert.equal('remoteRaw' in payload.conflicts[0], false);
});
