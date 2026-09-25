import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseAssetUrl } from './verify-deployment.mjs';

const en = 'https://en.example';

test('built pages are checked on the English site', () => {
  assert.equal(releaseAssetUrl('/index.html', { en }), 'https://en.example/');
  assert.equal(releaseAssetUrl('/articles/toolset.html', { en }), 'https://en.example/articles/toolset');
  assert.equal(releaseAssetUrl('/en/index.html', { en }), 'https://en.example/');
  assert.equal(releaseAssetUrl('/en/toolset/index.html', { en }), 'https://en.example/toolset/');
  assert.equal(releaseAssetUrl('/zh/now/index.html', { en }), 'https://en.example/now/');
  assert.equal(releaseAssetUrl('/_astro/_url_.abc.css', { en }), 'https://en.example/_astro/_url_.abc.css');
  assert.equal(releaseAssetUrl('/__studio-release.json', { en }), 'https://en.example/__studio-release.json');
});
