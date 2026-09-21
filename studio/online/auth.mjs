// Password login is independent of Heptabase's permission to read private cards.
const encoder = new TextEncoder();
const COOKIE = 'studio_session';
const WEEK = 7 * 24 * 60 * 60;
export const fail = (message, status = 400) => Object.assign(new Error(message), { status });
// Workers reject redirect: "error". Stop at the redirect instead of following it with credentials.
export async function fetchNoRedirect(url, init = {}) {
  const response = await fetch(url, { ...init, redirect: 'manual' });
  if (response.status >= 300 && response.status < 400) {
    await response.body?.cancel();
    throw fail('请求被重定向，已停止。', 502);
  }
  return response;
}
export const hex = (bytes) => [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('');
export const hash = async (text) => hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
export const randomToken = () => hex(crypto.getRandomValues(new Uint8Array(32)));

export async function boundedText(response, max = 2_000_000) {
  if (Number(response.headers.get('content-length')) > max) throw fail('内容过大，请分批处理。', 413);
  const reader = response.body?.getReader();
  if (!reader) return '';
  const chunks = []; let length = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > max) { await reader.cancel(); throw fail('内容过大，请分批处理。', 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function readJson(request) {
  if (!request.headers.get('content-type')?.startsWith('application/json')) throw fail('需要 JSON 请求。', 415);
  const text = await boundedText(request);
  try { return text ? JSON.parse(text) : {}; } catch { throw fail('请求不是合法 JSON。'); }
}

export function requireCsrf(request) {
  if (request.headers.get('origin') !== new URL(request.url).origin || request.headers.get('sec-fetch-site') === 'cross-site') {
    throw fail('拒绝跨来源写入。', 403);
  }
}

export async function passwordRecord(password, salt = randomToken()) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) throw fail('密码需要 10 至 256 个字符。');
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: encoder.encode(salt), iterations: 100000 }, key, 256);
  return `pbkdf2-sha256:100000:${salt}:${hex(bits)}`;
}

async function verifyPassword(password, record) {
  if (!/^pbkdf2-sha256:100000:[a-f0-9]{64}:[a-f0-9]{64}$/.test(record)) throw fail('后台密码尚未配置。', 503);
  if (typeof password !== 'string' || password.length < 10 || password.length > 256) return false;
  const candidate = await passwordRecord(password, record.split(':')[2]);
  // Fixed-size digest comparison, no early exit based on matching characters.
  let difference = 0;
  for (let i = 0; i < candidate.length; i++) difference |= candidate.charCodeAt(i) ^ record.charCodeAt(i);
  return difference === 0;
}

function sessionCookie(request, value, age) {
  return `${COOKIE}=${value}; Path=/dashboard; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(request.url).protocol === 'https:' ? '; Secure' : ''}`;
}

async function sessionId(request) {
  const value = request.headers.get('cookie')?.split(';').map((p) => p.trim()).find((p) => p.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? hash(value) : null;
}

export async function author(request, env) {
  if (!env.DB || !env.STUDIO_PASSWORD_HASH) throw fail('后台尚未完成密码与存储配置。', 503);
  const id = await sessionId(request);
  if (!id) throw fail('请先输入后台密码。', 401);
  const row = await env.DB.prepare('SELECT * FROM studio_sessions WHERE id = ?1 AND expires_at > ?2 AND password_version = ?3')
    .bind(id, Date.now(), await hash(env.STUDIO_PASSWORD_HASH)).first();
  if (!row) throw fail('登录已过期，请重新输入密码。', 401);
  return { id: 'owner', sessionId: id };
}

export async function login(request, env) {
  requireCsrf(request);
  if (!env.DB || !env.STUDIO_PASSWORD_HASH) throw fail('后台尚未完成密码与存储配置。', 503);
  const window = Math.floor(Date.now() / 300000);
  const key = await hash(`${request.headers.get('cf-connecting-ip') || 'local'}:${window}`);
  const attempt = await env.DB.prepare('INSERT INTO studio_login_attempts (id, attempts, expires_at) VALUES (?1, 1, ?2) ON CONFLICT(id) DO UPDATE SET attempts = attempts + 1 RETURNING attempts')
    .bind(key, Date.now() + 600000).first();
  if (attempt.attempts > 10) throw fail('尝试次数过多，请五分钟后再试。', 429);
  const { password } = await readJson(request);
  if (!await verifyPassword(password, env.STUDIO_PASSWORD_HASH)) throw fail('密码不正确。', 401);
  const token = randomToken();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM studio_sessions WHERE expires_at <= ?1').bind(Date.now()),
    env.DB.prepare('DELETE FROM studio_login_attempts WHERE expires_at <= ?1').bind(Date.now()),
    env.DB.prepare('INSERT INTO studio_sessions (id, expires_at, password_version) VALUES (?1, ?2, ?3)').bind(await hash(token), Date.now() + WEEK * 1000, await hash(env.STUDIO_PASSWORD_HASH)),
  ]);
  return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookie(request, token, WEEK) } });
}

export async function logout(request, env) {
  requireCsrf(request);
  const id = await sessionId(request);
  if (id && env.DB) await env.DB.prepare('DELETE FROM studio_sessions WHERE id = ?1').bind(id).run();
  return Response.json({ ok: true }, { headers: { 'set-cookie': sessionCookie(request, '', 0) } });
}

export async function withLock(env, id, fn) {
  const token = randomToken();
  const row = await env.DB.prepare('INSERT INTO studio_locks (id, token, expires_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET token = excluded.token, expires_at = excluded.expires_at WHERE studio_locks.expires_at < ?4 RETURNING token')
    .bind(id, token, Date.now() + 120000, Date.now()).first();
  if (row?.token !== token) throw fail('上一次操作仍在进行，请稍后再试。', 409);
  const lease = async () => {
    const renewed = await env.DB.prepare('UPDATE studio_locks SET expires_at = ?1 WHERE id = ?2 AND token = ?3 AND expires_at > ?4 RETURNING token')
      .bind(Date.now() + 120000, id, token, Date.now()).first();
    if (!renewed) throw fail('操作等待过久，已停止写入，请重新确认。', 409);
  };
  try { return await fn(lease); }
  finally { await env.DB.prepare('DELETE FROM studio_locks WHERE id = ?1 AND token = ?2').bind(id, token).run(); }
}
