import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest } from './hosts.ts';
import { articleAliasRedirects, articleHref, findByDocIdentity, legacyContentRedirect, projectHref, sitePageHref, urlArticleHref } from './routes.ts';

test('单篇文章、项目和站点页的公开地址是根路径', () => {
  assert.equal(articleHref('pkm-method'), '/pkm-method');
  assert.equal(articleHref('series-demo/1'), '/series-demo/1');
  assert.equal(urlArticleHref('toolset'), '/toolset');
  assert.equal(projectHref('aletheia'), '/aletheia');
  assert.equal(sitePageHref('about'), '/about');
  assert.equal(sitePageHref('blogs'), '/blogs');
  assert.equal(sitePageHref('notes/en'), '/notes');
});

test('旧 slug 转到卡片现在的地址，当前地址和固定地址不再转一次', () => {
  assert.deepEqual(articleAliasRedirects('pkm-practice', { url: 'pkm-practice', aliases: ['pkm-method', 'pkm-practice', 'now'] }), ['pkm-method']);
  assert.deepEqual(articleAliasRedirects('tools', { url: 'tools', aliases: ['my-toolset', 'toolset'] }), ['my-toolset', 'toolset']);
  assert.deepEqual(articleAliasRedirects('toolset', { aliases: ['toolset'] }), []);
  const entries = [
    { id: 'pkm-practice', url: 'pkm-practice', aliases: ['pkm-method'] },
    { id: 'other', url: 'other', aliases: [] },
  ];
  const read = (entry) => entry;
  assert.equal(findByDocIdentity(entries, 'pkm-practice', read).id, 'pkm-practice');
  assert.equal(findByDocIdentity(entries, 'pkm-method', read).id, 'pkm-practice');
  assert.equal(findByDocIdentity(entries, 'missing', read), undefined);
});

test('旧单篇地址转到新路径，列表和分页不动', () => {
  assert.equal(legacyContentRedirect('/articles/pkm-method'), '/pkm-method');
  assert.equal(legacyContentRedirect('/articles/series-demo/1'), '/series-demo/1');
  assert.equal(legacyContentRedirect('/projects/aletheia/'), '/aletheia');
  assert.equal(legacyContentRedirect('/pages/about'), '/about');
  assert.equal(legacyContentRedirect('/pages/notes'), '/notes');
  assert.equal(legacyContentRedirect('/articles'), null);
  assert.equal(legacyContentRedirect('/projects'), null);
  assert.equal(legacyContentRedirect('/articles/2'), null);
  assert.equal(legacyContentRedirect('/pkm-method'), null);
});

test('旧地址和旧域都回到同一篇英文页面', () => {
  assert.deepEqual(routeRequest(new URL('http://localhost:4321/articles/pkm-method')), {
    type: 'redirect',
    location: 'http://localhost:4321/pkm-method',
    status: 301,
  });
  assert.deepEqual(routeRequest(new URL('http://en.localhost:4321/pkm-method')), {
    type: 'redirect',
    location: 'http://localhost:4321/pkm-method',
    status: 301,
  });
  assert.deepEqual(routeRequest(new URL('https://cn.ethanchang.io/now')), {
    type: 'redirect',
    location: 'https://ethanchang.io/now',
    status: 301,
  });
  assert.deepEqual(routeRequest(new URL('http://localhost:4321/en/articles')), {
    type: 'redirect',
    location: 'http://localhost:4321/articles',
    status: 301,
  });
  assert.deepEqual(routeRequest(new URL('http://localhost:4321/pkm-method')), { type: 'pass' });
  assert.deepEqual(routeRequest(new URL('http://localhost:4321/articles/2')), { type: 'pass' });
});
