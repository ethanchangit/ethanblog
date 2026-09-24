import assert from 'node:assert/strict';
import { test } from 'node:test';
import { directPublishFeedback, directPublishPlan } from './direct-publish.mjs';

const card = (id, extra = {}) => ({ card: { id }, plan: { sourceHash: 'a' }, decision: '', ...extra });

test('direct publish approves waiting updates and deletions without a second confirm, and explains an empty queue', () => {
  assert.deepEqual(directPublishPlan({ pulled: false, items: [card('a')] }).message, '请先拉取最新更新。当前没有可发布的内容。');
  assert.equal(directPublishPlan({ pulled: true, items: [], git: {} }).ok, false);
  const article = card('a');
  const edited = card('b', { decision: 'approve', flushed: true });
  const rejected = card('c', { decision: 'reject' });
  const removal = card('d', { removal: true });
  const skipped = card('e', { removal: true, decision: 'skip' });
  const plan = directPublishPlan({ pulled: true, items: [article, edited, rejected, removal, skipped], git: {} });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.approve.map(item => item.card.id), ['a']);
  assert.deepEqual(plan.remove.map(item => item.card.id), ['d']);
  assert.equal(plan.commit, true);
  assert.equal(plan.publish, true);
  assert.equal(plan.confirm, undefined);
  const again = directPublishPlan({ pulled: true, items: [edited], git: { draftCount: 0, pullRequest: { number: 1 } } });
  assert.equal(again.commit, false);
  assert.equal(again.publish, true);
  const waiting = directPublishPlan({ pulled: true, items: [card('f', { decision: 'approve' })], git: {} });
  assert.equal(waiting.ok, true);
  assert.equal(waiting.commit, true);
  assert.deepEqual(waiting.staged.map(item => item.card.id), ['f']);
});

test('a blocked direct publish tells the release bar why instead of staying silent', () => {
  const notPulled = directPublishPlan({ pulled: false, items: [card('a')] });
  assert.deepEqual(directPublishFeedback(notPulled), { error: true, message: '请先拉取最新更新。当前没有可发布的内容。' });
  const empty = directPublishPlan({ pulled: true, items: [], git: {} });
  assert.deepEqual(directPublishFeedback(empty), { error: true, message: '没有可发布的更新。' });
  const ready = directPublishPlan({ pulled: true, items: [card('a')], git: {} });
  assert.equal(ready.ok, true);
  assert.deepEqual(directPublishFeedback(ready), { error: false, message: '正在直接发布…' });
});
