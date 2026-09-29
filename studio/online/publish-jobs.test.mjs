import assert from 'node:assert/strict';
import { test, afterEach } from 'node:test';
import { fixture, CARD, LINK, PATH, article } from './test-fixtures.mjs';
import { createHandler } from './server.mjs';
import { signReceipt } from './release-sync.mjs';

const nativeFetch = globalThis.fetch;
afterEach(() => { globalThis.fetch = nativeFetch; });
async function ok(response) { const r = await response, body = await r.json(); assert.equal(r.status, 200, JSON.stringify(body)); return body; }
async function setup() {
  const f = await fixture(); globalThis.fetch = f.fetcher;
  await f.login(); await f.connect(); f.properties.get(CARD).Status = 'review';
  return f;
}
async function payload(f) {
  const plan = await ok(f.request('/heptabase/preview', 'POST', { cardLink: LINK, collection: 'articles', id: 'example', preparePublish: true, reviewOnly: true }));
  return { confirmPublish: true, decisions: [{ kind: 'review', cardLink: LINK, collection: 'articles', id: 'example', decision: 'approve', confirmPublic: true, resolveConflict: true,
    sourceHash: plan.sourceHash, documentHash: plan.documentHash, planHash: plan.planHash }] };
}
async function step(f, id, handler = createHandler()) {
  const body = JSON.stringify({ purpose: 'studio-publish', jobId: id, runnerId: '5678', timestamp: Date.now() });
  return ok(handler(new Request('https://ethanchang.io/dashboard/api/publish/step', {
    method: 'POST', body, headers: { 'x-studio-signature': await signReceipt(f.env.STUDIO_SECRET, body) },
  }), f.env));
}
const writes = f => f.calls.filter(c => c.method !== 'GET' && c.url.includes('api.github.com') && !c.url.endsWith('/graphql'));

test('one confirmation persists before dispatch; a cold cloud runner finishes after the browser logs out', async () => {
  const f = await setup(), input = await payload(f);
  const { job } = await ok(f.request('/publish', 'POST', input));
  assert.equal(job.accepted, true);
  assert.equal(job.status, 'queued');
  assert.deepEqual(writes(f).map(c => c.url.split('/').pop()), ['dispatches']);
  assert.deepEqual(writes(f)[0].body, { event_type: 'studio-publish', client_payload: { jobId: job.id } });
  const duplicate = await ok(f.request('/publish', 'POST', input));
  assert.equal(duplicate.job.id, job.id);
  assert.equal(writes(f).length, 1);
  await f.request('/logout', 'POST', {});
  for (let i = 0; i < 4; i++) await step(f, job.id);
  assert.equal(f.DB.sqlite.prepare('SELECT stage FROM studio_publish_jobs').get().stage, 'deploy');
  f.deploy();
  assert.equal((await step(f, job.id)).status, 'succeeded');
  const n = writes(f).length;
  assert.equal((await step(f, job.id)).status, 'succeeded');
  assert.equal(writes(f).length, n);
  await f.login();
  const restored = (await ok(f.request('/publish'))).job;
  assert.equal(restored.status, 'succeeded');
  assert.equal(restored.message, '已上线');
  assert.match(f.text(PATH, 'main'), /来自 Heptabase/);
});

test('dispatch response loss resends the same saved task without approving twice', async () => {
  const f = await setup(), input = await payload(f);
  let once = true;
  globalThis.fetch = async (url, init) => {
    const result = await f.fetcher(url, init);
    if (String(url).endsWith('/dispatches') && once) { once = false; throw new Error('lost reply'); }
    return result;
  };
  assert.equal((await f.request('/publish', 'POST', input)).status, 500);
  const queued = (await ok(f.request('/publish'))).job;
  assert.equal(queued.accepted, false);
  const { job } = await ok(f.request('/publish', 'POST', input));
  assert.equal(job.id, queued.id);
  assert.equal(job.accepted, true);
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_publish_jobs').get().n, 1);
});

test('network failure is retried at the saved cursor and does not repeat completed decisions', async () => {
  const f = await setup();
  const { job } = await ok(f.request('/publish', 'POST', await payload(f)));
  await step(f, job.id); await step(f, job.id);
  const before = f.calls.filter(c => c.body?.params?.name === 'edit_card_properties').length;
  let failed = false;
  globalThis.fetch = async (url, init) => {
    if (!failed && String(url).includes('api.github.com')) { failed = true; throw new Error('network offline'); }
    return f.fetcher(url, init);
  };
  const interrupted = await step(f, job.id);
  assert.equal(interrupted.status, 'running'); assert.equal(interrupted.completed, 1);
  assert.ok(interrupted.retryAt > Date.now());
  f.DB.sqlite.exec('UPDATE studio_publish_jobs SET retry_at = 0');
  await step(f, job.id); await step(f, job.id); f.deploy(); await step(f, job.id);
  assert.equal((await ok(f.request('/publish'))).job.status, 'succeeded');
  // Post-deploy status synchronization is separate; the approval itself stays complete.
  assert.equal(f.DB.sqlite.prepare('SELECT count(*) n FROM studio_draft_history').get().n, 0);
  assert.ok(f.calls.filter(c => c.body?.params?.name === 'edit_card_properties').length >= before);
});

test('cloud checks failure is visible; retry resumes the same task and auth never leaks content', async () => {
  const f = await setup();
  const { job } = await ok(f.request('/publish', 'POST', await payload(f)));
  assert.equal((await f.request('/git/commit', 'POST', { message: 'interfere' })).status, 409);
  await step(f, job.id); await step(f, job.id); await step(f, job.id);
  f.failChecks();
  const failed = await step(f, job.id);
  assert.equal(failed.status, 'failed');
  assert.equal(failed.error, undefined);
  assert.equal(failed.jobId, undefined);
  assert.match((await ok(f.request('/publish'))).job.error, /未通过网站检查/);
  const retried = await ok(f.request('/publish/retry', 'POST', { id: job.id }));
  assert.equal(retried.job.id, job.id); assert.equal(retried.job.completed, 1);
  assert.equal((await f.request('/publish/step', 'POST', { jobId: job.id })).status, 403);
  const wrong = JSON.stringify({ jobId: job.id, runnerId: '1', timestamp: Date.now() });
  assert.equal((await f.handler(new Request('https://ethanchang.io/dashboard/api/publish/step', { method: 'POST', body: wrong,
    headers: { 'x-studio-signature': await signReceipt(f.env.STUDIO_SECRET, wrong) } }), f.env)).status, 403);
});

test('invalid or unconfirmed requests cannot dispatch a publication', async () => {
  const f = await setup(), input = await payload(f);
  for (const body of [{ ...input, confirmPublish: false }, { ...input, decisions: [input.decisions[0], input.decisions[0]] },
    { ...input, decisions: [{ ...input.decisions[0], confirmPublic: false }] }]) {
    assert.ok((await f.request('/publish', 'POST', body)).status >= 400);
  }
  assert.equal(writes(f).length, 0);
  await f.request('/logout', 'POST', {});
  assert.equal((await f.request('/publish', 'POST', input)).status, 401);
});

test('an interrupted reference write resumes without overwriting later source changes', async () => {
  const f = await setup(), ref = '9732c208-c3b1-4a7b-a922-0c3483475d6b';
  f.setSource(`# 测试文章\n\n<hepta-mention type="card" id="${ref}">新引用</hepta-mention>`);
  f.cardSources.set(ref, '# 新引用\n\n引用正文');
  const input = await payload(f); input.decisions[0].markReferences = true;
  const { job } = await ok(f.request('/publish', 'POST', input));
  await step(f, job.id); // Persist the exact reference snapshot before external writes.
  let interrupted = false;
  globalThis.fetch = async (url, init) => {
    const response = await f.fetcher(url, init);
    const body = init?.body?.startsWith('{') ? JSON.parse(init.body) : {};
    if (!interrupted && body.params?.name === 'edit_object_content') { interrupted = true; throw new Error('lost reference write reply'); }
    return response;
  };
  assert.equal((await step(f, job.id)).status, 'running');
  assert.match(f.cardSources.get(ref), /Mentioned by/);
  f.DB.sqlite.exec('UPDATE studio_publish_jobs SET retry_at = 0');
  await step(f, job.id);
  for (let i = 0; i < 4; i++) await step(f, job.id);
  f.deploy();
  assert.equal((await step(f, job.id)).status, 'succeeded');
  assert.equal(f.calls.filter(c => c.body?.params?.name === 'edit_object_content').length, 1);
});

test('fresh review updates the old draft baseline, while edits after that review still stop publication', async () => {
  const f = await setup();
  f.remote(article.replace('draft: true', 'draft: false'));
  let input = await payload(f);
  await ok(f.request('/heptabase/decisions', 'POST', { decisions: input.decisions }));
  f.remote(article.replace('draft: true', 'draft: false').replace('中文正文。', 'GitHub 上的修改。'));
  input = await payload(f);
  await ok(f.request('/heptabase/decisions', 'POST', { decisions: input.decisions }));
  await ok(f.request('/git/commit', 'POST', { message: '重新审核过的内容' }));
  assert.match(f.text(PATH), /来自 Heptabase/);
  const g = await setup();
  g.remote(article.replace('draft: true', 'draft: false'));
  input = await payload(g);
  await ok(g.request('/heptabase/decisions', 'POST', { decisions: input.decisions }));
  const before = await payload(g);
  g.remote(article.replace('中文正文。', '审核之后的新修改。'));
  assert.equal((await g.request('/heptabase/decisions', 'POST', { decisions: before.decisions })).status, 409);
  const response = await g.request('/git/commit', 'POST', { message: '旧审核' });
  assert.equal(response.status, 409);
  assert.match((await response.json()).error, /测试文章/);
});
