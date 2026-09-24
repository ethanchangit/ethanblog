import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditAddress } from './audit-address.mjs';

test('the audit address is only /slug, with no host or collection prefix', () => {
  assert.equal(auditAddress({ path: 'src/content/articles/some-slug.mdx', afterProperties: {} }), '/some-slug');
  assert.equal(auditAddress({ path: 'src/content/articles/old-file.mdx', afterProperties: { url: 'toolset' } }), '/toolset');
  assert.equal(auditAddress({ path: 'src/content/projects/demo.mdx', beforeProperties: {} }), '/demo');
  assert.equal(auditAddress({ path: 'src/content/pages/about.mdx' }), '/about');
  assert.equal(auditAddress({ path: 'src/content/articles/hub/1.mdx' }), '/hub/1');
  assert.equal(auditAddress({
    path: 'src/content/articles/toolset/en.mdx', translation: true, language: 'en', afterProperties: { url: 'toolset' },
  }), '/toolset');
  const shown = auditAddress({ path: 'src/content/articles/example.mdx' });
  assert.equal(shown, '/example');
  assert.doesNotMatch(shown, /ethanchang|^articles|\/articles\//);
  assert.equal(auditAddress({}), '');
});
