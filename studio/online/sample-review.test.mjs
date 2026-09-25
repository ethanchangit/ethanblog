import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CARD, fixture } from './test-fixtures.mjs';
import { seedSampleReview } from './sample-review.mjs';

test('the local sample covers new, edited, deleted and site pages, and is not the production handler', async () => {
  const previous = process.env.STUDIO_PAGE_CAP_FIXTURE;
  delete process.env.STUDIO_PAGE_CAP_FIXTURE;
  const local = await fixture();
  seedSampleReview(local);
  assert.equal(local.properties.get(CARD).Status, 'review');
  assert.equal(local.properties.get('122560bd-b99f-4fb9-9fa5-742090feacb1').Status, 'review');
  assert.equal(local.missingCards.has('7ece4d64-b906-4e1a-a836-bfb57b19d24d'), true);
  assert.equal(local.properties.get('f11ada66-1111-4759-9b1f-830c8374fcae')['Blog Type'], 'Page');
  assert.equal(local.properties.get('f11ada66-1111-4759-9b1f-830c8374fcae').Status, 'published');
  assert.equal(local.properties.get('f21ada66-2222-4759-9b1f-830c8374fcae').Status, 'published');
  assert.equal(local.env.STUDIO_LOCAL_PREVIEW, undefined);
  if (previous === undefined) delete process.env.STUDIO_PAGE_CAP_FIXTURE;
  else process.env.STUDIO_PAGE_CAP_FIXTURE = previous;
});
