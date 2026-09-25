import assert from 'node:assert/strict';
import { test } from 'node:test';
import { releaseAssetUrl } from './verify-deployment.mjs';

const zh = 'https://cn.example';
const en = 'https://en.example';

test('Chinese pages are checked on the Chinese host, English pages on the English host', () => {
  assert.equal(releaseAssetUrl('/index.html', { zh, en }), 'https://cn.example/');
  assert.equal(releaseAssetUrl('/articles/toolset.html', { zh, en }), 'https://cn.example/articles/toolset');
  assert.equal(releaseAssetUrl('/en/index.html', { zh, en }), 'https://en.example/');
  assert.equal(releaseAssetUrl('/en/toolset/index.html', { zh, en }), 'https://en.example/toolset/');
  assert.equal(releaseAssetUrl('/_astro/_url_.abc.css', { zh, en }), 'https://en.example/_astro/_url_.abc.css');
  assert.equal(releaseAssetUrl('/__studio-release.json', { zh, en }), 'https://en.example/__studio-release.json');
});
