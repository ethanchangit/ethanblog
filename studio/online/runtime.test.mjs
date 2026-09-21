import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Miniflare } from 'miniflare';
import { passwordRecord } from './auth.mjs';

test('the bundled dashboard runs with Cloudflare WebCrypto, D1 and protected routes', async () => {
  const password = 'runtime-test-only-password';
  const mf = new Miniflare({
    modules: true, scriptPath: '.studio-build/server/index.js',
    compatibilityDate: '2026-01-01',
    d1Databases: { DB: 'studio-runtime-test' },
    bindings: { STUDIO_PASSWORD_HASH: await passwordRecord(password) },
  });
  try {
    const db = await mf.getD1Database('DB');
    const sql = await readFile(new URL('../../migrations/0004_studio.sql', import.meta.url), 'utf8');
    await db.exec(sql.replace(/^--.*$/gm, '').replaceAll('\n', ' '));
    const page = await mf.dispatchFetch('https://ethanchang.io/dashboard');
    assert.equal(page.status, 200); assert.match(await page.text(), /Ethan Blog Studio/);
    assert.equal((await mf.dispatchFetch('https://ethanchang.io/dashboard/api/session')).status, 401);
    const login = await mf.dispatchFetch('https://ethanchang.io/dashboard/api/login', { method: 'POST', headers: { origin: 'https://ethanchang.io', 'content-type': 'application/json' }, body: JSON.stringify({ password }) });
    assert.equal(login.status, 200, await login.text());
    const cookie = login.headers.get('set-cookie'); assert.match(cookie, /Secure/);
    assert.equal((await mf.dispatchFetch('https://ethanchang.io/dashboard/api/session', { headers: { cookie: cookie.split(';')[0] } })).status, 200);
    assert.equal((await mf.dispatchFetch('https://ethanchang.io/__studio/api/docs')).status, 404);
  } finally { await mf.dispose(); }
});
