import assert from 'node:assert/strict';
import { test } from 'node:test';
import { serializeMdx } from '../core.mjs';
import { blogViewHref } from './blog-href.mjs';
import { sampleBlogResponse } from './sample-blog.mjs';
import { fixture } from './test-fixtures.mjs';

test('localhost opens the Chinese sample blog, production keeps the live site', () => {
  assert.equal(blogViewHref('localhost'), '/sample-blog/');
  assert.equal(blogViewHref('127.0.0.1'), '/sample-blog/');
  assert.equal(blogViewHref('::1'), '/sample-blog/');
  assert.equal(blogViewHref('en.localhost'), '/sample-blog/');
  assert.equal(blogViewHref('ethanchang.io'), 'https://ethanchang.io');
  assert.equal(blogViewHref('cn.ethanchang.io'), 'https://ethanchang.io');
});

test('the sample blog lists published titles and hides unlisted references', async () => {
  const previous = process.env.STUDIO_PAGE_CAP_FIXTURE;
  delete process.env.STUDIO_PAGE_CAP_FIXTURE;
  const index = await sampleBlogResponse('http://localhost/sample-blog/');
  const html = await index.text();
  assert.equal(index.status, 200);
  assert.match(html, /lang="zh-CN"/);
  assert.match(html, /知识管理，先从连接开始/);
  assert.match(html, /让标签跟着想法生长/);
  assert.match(html, /href="\/sample-blog\/pages\/notes"/);
  assert.match(html, /href="\/sample-blog\/pages\/shelf"/);
  assert.doesNotMatch(html, /仅由旧笔记引用的资料/);
  const article = await sampleBlogResponse('http://localhost/sample-blog/articles/example');
  assert.match(await article.text(), /从一个问题开始/);
  assert.equal((await sampleBlogResponse('http://localhost/sample-blog/missing')).status, 404);
  if (previous === undefined) delete process.env.STUDIO_PAGE_CAP_FIXTURE;
  else process.env.STUDIO_PAGE_CAP_FIXTURE = previous;
});

test('the English sample opens translated articles, projects and pages', async () => {
  const previous = process.env.STUDIO_PAGE_CAP_FIXTURE;
  delete process.env.STUDIO_PAGE_CAP_FIXTURE;
  const index = await sampleBlogResponse('http://en.localhost/sample-blog/');
  const html = await index.text();
  assert.equal(index.status, 200);
  assert.match(html, /lang="en"/);
  assert.match(html, /Start with connections/);
  assert.match(html, /href="\/sample-blog\/projects\/sample-trace"/);
  assert.match(html, /href="\/sample-blog\/pages\/notes"/);
  assert.doesNotMatch(html, /In Chinese/);
  assert.doesNotMatch(html, /These articles are only in Chinese so far/);
  assert.match(await (await sampleBlogResponse('http://en.localhost/sample-blog/articles/example')).text(), /Knowledge work is linking/);
  assert.match(await (await sampleBlogResponse('http://en.localhost/sample-blog/projects/sample-trace')).text(), /A project you can read in English/);
  const notesHtml = await (await sampleBlogResponse('http://en.localhost/sample-blog/pages/notes')).text();
  assert.match(notesHtml, /A page of notes in English/);
  assert.match(notesHtml, /Properties/);
  assert.match(notesHtml, /Published/);
  const chineseOnly = await sampleBlogResponse('http://en.localhost/sample-blog/articles/growing-tags');
  assert.equal(chineseOnly.status, 302);
  assert.match(chineseOnly.headers.get('location'), /\/sample-blog\/articles\/growing-tags$/);
  if (previous === undefined) delete process.env.STUDIO_PAGE_CAP_FIXTURE;
  else process.env.STUDIO_PAGE_CAP_FIXTURE = previous;
});

test('sample blog renders card mentions as links instead of their labels', async () => {
  const local = await fixture();
  const mentioned = '158824e6-cf72-4754-9a76-152c03dde273';
  local.remote(serializeMdx({
    frontmatter: {
      slot: 'article', title: 'Heptabase', description: '', date: '2026-09-21', draft: false, listed: false,
      heptabaseType: 'reference', heptabaseCardLink: `heptabase://card/${mentioned}`,
    },
    bodyZh: '这张卡片说明 Heptabase。',
  }), 'src/content/articles/heptabase-ref.mdx');
  local.remote(serializeMdx({
    frontmatter: {
      slot: 'article', title: 'My Toolset', description: '', date: '2026-09-21', draft: false,
      heptabaseCardLink: 'heptabase://card/dc796c8b-fc7c-4d7e-b8fa-26099d548703',
    },
    bodyZh: `1. <hepta-mention id="${mentioned}" type="card">Heptabase</hepta-mention>\n\n<a href="/bitwarden" data-doc-of="articles/bitwarden" data-doc-mention>Bitwarden</a>`,
  }), 'src/content/articles/toolset-mentions.mdx');
  const html = await (await sampleBlogResponse('http://localhost/sample-blog/articles/toolset-mentions', local)).text();
  assert.match(html, /<a href="\/sample-blog\/articles\/heptabase-ref" data-doc-mention>Heptabase<\/a>/);
  assert.match(html, /<a href="\/bitwarden" data-doc-mention>Bitwarden<\/a>/);
  assert.doesNotMatch(html, /1\. Heptabase/);
  assert.doesNotMatch(html, /<hepta-mention/);
});

test('the production dashboard handler does not serve the sample blog', async () => {
  const local = await fixture();
  const response = await local.handler(new Request('https://ethanchang.io/sample-blog/'), local.env);
  assert.equal(response.status, 404);
});
