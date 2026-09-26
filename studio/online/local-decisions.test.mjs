import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyLocalDecision, decisionBatch, pageChoicePayload } from './local-decisions.mjs';

const plan = { sourceHash: 's', documentHash: 'd', planHash: 'p', changes: [{ id: 'a', mainArticle: true }] };
const item = (extra = {}) => ({ card: { id: 'a' }, input: { cardLink: 'heptabase://card/a', collection: 'articles', id: 'example' }, plan: { ...plan, changes: plan.changes.map(change => ({ ...change })) }, decision: '', ...extra });

test('approve and reject are recorded locally and do not need a server', () => {
  const approved = item();
  const result = applyLocalDecision(approved, 'approve');
  assert.equal(result.next, 'approve');
  assert.equal(approved.decision, 'approve');
  const rejected = item();
  const noted = applyLocalDecision(rejected, 'reject', { remark: '先不发' });
  assert.equal(rejected.decision, 'reject');
  assert.equal(rejected.pendingRemark, '先不发');
  assert.deepEqual(noted, { next: 'reject' });
  const cleared = item();
  applyLocalDecision(cleared, 'reject', { remark: '' });
  assert.equal(cleared.pendingRemark, '');
  const batch = decisionBatch([approved, rejected, cleared]);
  assert.equal(batch.decisions.length, 3);
  assert.equal(batch.decisions[0].decision, 'approve');
  assert.equal(batch.decisions[0].confirmPublic, true);
  assert.equal(batch.decisions[1].remark, '先不发');
  assert.equal(batch.decisions[2].remark, '');
  assert.equal(batch.pageChoice, undefined);
});

test('a second click with the same verdict does not grow the batch, and a change clears flushed', () => {
  const card = item({ decision: 'approve', flushed: true });
  assert.equal(applyLocalDecision(card, 'approve'), null);
  assert.equal(decisionBatch([card]).decisions.length, 0);
  applyLocalDecision(card, 'reject', { remark: '改判' });
  assert.equal(card.flushed, false);
  assert.equal(decisionBatch([card]).decisions[0].decision, 'reject');
});

test('unmarked references are flagged for the publish flush, and removals stay out until then', () => {
  const card = item();
  card.plan.changes.push({ id: 'ref', mainArticle: false, referenceTagged: false });
  applyLocalDecision(card, 'approve');
  assert.equal(decisionBatch([card]).decisions[0].markReferences, true);
  const removal = item({ removal: true, plan: { ...plan, approved: false } });
  applyLocalDecision(removal, 'approve');
  assert.equal(removal.decision, 'remove');
  assert.equal(decisionBatch([removal]).decisions[0].kind, 'removal');
  assert.equal(decisionBatch([removal]).decisions[0].confirmDelete, true);
  applyLocalDecision(removal, 'reject');
  assert.equal(removal.decision, 'skip');
  assert.equal(decisionBatch([removal]).decisions.length, 0);
});

test('page choice is a local payload, not a request', () => {
  const pageSet = { choiceRequired: true, cards: [{ id: 'p1' }, { id: 'p2' }] };
  const payload = pageChoicePayload(pageSet, new Set(['p2', 'p1']), ['p2']);
  assert.deepEqual(payload.keep, ['p2', 'p1']);
  assert.deepEqual(payload.order, ['p2', 'p1']);
  assert.deepEqual(payload.hidden, []);
  const hidden = pageChoicePayload({ choiceRequired: false, cards: [{ id: 'a' }, { id: 'b' }] }, new Set(), ['b', 'a'], new Set(['a', 'missing']));
  assert.deepEqual(hidden.keep, ['a', 'b']);
  assert.deepEqual(hidden.order, ['b', 'a']);
  assert.deepEqual(hidden.hidden, ['a']);
  const batch = decisionBatch([], { pageChoice: payload });
  assert.deepEqual(batch.pageChoice.order, ['p2', 'p1']);
  assert.deepEqual(batch.pageChoice.hidden, []);
  assert.throws(() => pageChoicePayload({ choiceRequired: true, cards: [1, 2, 3, 4, 5].map(id => ({ id: String(id) })) }, new Set(['1', '2', '3', '4', '5']), []), /最多留下 4 页/);
});
