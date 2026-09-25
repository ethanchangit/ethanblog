import assert from 'node:assert/strict';
import test from 'node:test';
import { routeRequest } from './hosts.ts';
import { articleHref, legacyContentRedirect, projectHref, sitePageHref, urlArticleHref } from './routes.ts';

test('单篇文章、项目和站点页的公开地址是根路径', () => {
  assert.equal(articleHref('pkm-method'), '/pkm-method');
  assert.equal(articleHref('series-demo/1'), '/series-demo/1');
  assert.equal(urlArticleHref('toolset'), '/toolset');
  assert.equal(projectHref('aletheia'), '/aletheia');
  assert.equal(sitePageHref('about'), '/about');
  assert.equal(sitePageHref('blogs'), '/blogs');
  assert.equal(sitePageHref('notes/en'), '/notes');
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

test('中英文站的旧地址都在同一域名上转到新路径', () => {
  const english = routeRequest(new URL('http://en.localhost:4321/articles/pkm-method'));
  assert.deepEqual(english, {
    type: 'redirect',
    location: 'http://en.localhost:4321/pkm-method',
    status: 301,
  });
  const chinese = routeRequest(new URL('http://localhost:4321/projects/aletheia'));
  assert.deepEqual(chinese, {
    type: 'redirect',
    location: 'http://localhost:4321/aletheia',
    status: 301,
  });
  const englishNew = routeRequest(new URL('http://en.localhost:4321/pkm-method'));
  assert.deepEqual(englishNew, { type: 'rewrite', path: '/en/pkm-method' });
  const page = routeRequest(new URL('http://localhost:4321/articles/2'));
  assert.deepEqual(page, { type: 'pass' });
});
