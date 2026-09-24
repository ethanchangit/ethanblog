import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IO_CONCURRENCY, mapLimited, previewBodyKey } from './pool.mjs';

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

test('mapLimited keeps order and caps in-flight work', async () => {
  assert.equal(IO_CONCURRENCY, 3);
  let active = 0, max = 0;
  const out = await mapLimited([30, 10, 20, 5, 15, 25], IO_CONCURRENCY, async (ms, index) => {
    active += 1;
    max = Math.max(max, active);
    await wait(ms);
    active -= 1;
    return index;
  });
  assert.deepEqual(out, [0, 1, 2, 3, 4, 5]);
  assert.equal(max, IO_CONCURRENCY);
  assert.deepEqual(await mapLimited([], IO_CONCURRENCY, async () => 1), []);
});

test('mapLimited stops starting work after the first rejection', async () => {
  let started = 0;
  await assert.rejects(() => mapLimited([1, 2, 3, 4, 5, 6], 2, async (n) => {
    started += 1;
    await wait(25);
    if (n === 1) throw new Error('stop');
    return n;
  }), /stop/);
  assert.equal(started, 2);
});

test('preview body key ignores review decisions and changes with the prose', () => {
  const card = {
    id: 'a', title: '标题', beforeContent: '旧', afterContent: '新',
    beforeProperties: { date: '2024-01-01', tags: ['A'] },
    afterProperties: { date: '2024-02-01', tags: ['B'] },
  };
  const preview = previewBodyKey(card, 'preview', false);
  assert.equal(preview, previewBodyKey({ ...card }, 'preview', false));
  assert.notEqual(preview, previewBodyKey(card, 'diff', false));
  assert.notEqual(preview, previewBodyKey(card, 'preview', true));
  assert.notEqual(preview, previewBodyKey({ ...card, afterContent: '另一版' }, 'preview', false));
  assert.notEqual(preview, previewBodyKey({ ...card, afterProperties: { ...card.afterProperties, tags: ['C'] } }, 'preview', false));
});
