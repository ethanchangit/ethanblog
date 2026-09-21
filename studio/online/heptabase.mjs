import { boundedText, fail, fetchNoRedirect, hash, randomToken, withLock } from './auth.mjs';

const ORIGIN = 'https://api.heptabase.com';
const MCP = `${ORIGIN}/mcp`;
const encoder = new TextEncoder();
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (text) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const b64url = (bytes) => b64(bytes).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');

async function encryptionKey(env) {
  if (!env.STUDIO_SECRET || unb64(env.STUDIO_SECRET).length !== 32) throw fail('请先配置后台连接密钥。', 503);
  return crypto.subtle.importKey('raw', unb64(env.STUDIO_SECRET), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

async function put(env, id, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const bytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await encryptionKey(env), encoder.encode(JSON.stringify(data)));
  const value = `${b64(iv)}.${b64(new Uint8Array(bytes))}`;
  await env.DB.prepare('INSERT INTO studio_connections (id, value) VALUES (?1, ?2) ON CONFLICT(id) DO UPDATE SET value = excluded.value').bind(id, value).run();
}

async function get(env, id) {
  const row = await env.DB.prepare('SELECT value FROM studio_connections WHERE id = ?1').bind(id).first();
  if (!row) return null;
  const [iv, data] = row.value.split('.');
  return JSON.parse(new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await encryptionKey(env), unb64(data))));
}

async function providerJson(path, init = {}) {
  const response = await fetchNoRedirect(`${ORIGIN}${path}`, { ...init, signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw fail(`Heptabase 连接失败（${response.status}），请重新连接。`, 502);
  return providerData(await boundedText(response));
}

function providerData(text) {
  try { return JSON.parse(text); }
  catch { throw fail('Heptabase 返回了无法读取的数据，请稍后重新拉取。', 502); }
}

export async function connectionStatus(env) {
  const row = await env.DB.prepare("SELECT id FROM studio_connections WHERE id = 'heptabase'").first();
  return { connected: Boolean(row) };
}

export async function connect(request, env, identity) {
  const callback = new URL('/dashboard/api/heptabase/callback', request.url).href;
  let client = await get(env, 'heptabase-client');
  if (!client || client.callback !== callback) {
    const registration = await providerJson('/v1/oauth/register', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client_name: 'Ethan Blog Studio', redirect_uris: [callback], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' }),
    });
    client = { clientId: registration.client_id, callback };
    await put(env, 'heptabase-client', client);
  }
  const state = randomToken(), verifier = randomToken();
  await put(env, `oauth:${await hash(state)}`, { verifier, client, sessionId: identity.sessionId, expires: Date.now() + 600000 });
  const url = new URL('/auth', ORIGIN);
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(verifier))));
  url.search = new URLSearchParams({ client_id: client.clientId, redirect_uri: callback, response_type: 'code', scope: 'offline_access space:read space:write', resource: MCP, state, code_challenge: challenge, code_challenge_method: 'S256' }).toString();
  return { url: url.href };
}

export async function callback(request, env, identity) {
  const url = new URL(request.url);
  const state = url.searchParams.get('state') || '';
  if (!/^[a-f0-9]{64}$/.test(state)) throw fail('连接验证已失效，请重新连接。');
  const key = `oauth:${await hash(state)}`;
  const pending = await get(env, key);
  if (!pending || pending.expires < Date.now() || pending.sessionId !== identity.sessionId) throw fail('连接验证已失效，请重新连接。');
  await env.DB.prepare('DELETE FROM studio_connections WHERE id = ?1').bind(key).run();
  if (url.searchParams.has('error') || !url.searchParams.get('code')) throw fail('Heptabase 未授予连接权限。');
  const tokens = await providerJson('/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', client_id: pending.client.clientId, code: url.searchParams.get('code'), redirect_uri: pending.client.callback, code_verifier: pending.verifier, resource: MCP }) });
  await put(env, 'heptabase', { ...tokens, clientId: pending.client.clientId, expires: Date.now() + Number(tokens.expires_in || 3600) * 1000 });
  return Response.redirect(new URL('/dashboard', request.url).href, 303);
}

async function accessToken(env) {
  let tokens = await get(env, 'heptabase');
  if (!tokens) throw fail('请先连接 Heptabase。', 409);
  if (tokens.expires > Date.now() + 60000) return tokens.access_token;
  return withLock(env, 'heptabase-refresh', async () => {
    tokens = await get(env, 'heptabase');
    if (tokens.expires > Date.now() + 60000) return tokens.access_token;
    if (!tokens.refresh_token) throw fail('Heptabase 连接已过期，请重新连接。', 409);
    const next = await providerJson('/token', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', client_id: tokens.clientId, refresh_token: tokens.refresh_token, resource: MCP }) });
    const updated = { ...tokens, ...next, expires: Date.now() + Number(next.expires_in || 3600) * 1000 };
    await put(env, 'heptabase', updated);
    return updated.access_token;
  });
}

export function toolResult(result) {
  let data = result.structuredContent;
  if (!data) {
    const text = (result.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    try { data = JSON.parse(text); } catch { data = { content: text }; }
  }
  if (result.isError || data.status === 'failed') throw Object.assign(fail('Heptabase 未能完成操作，请检查连接和卡片权限。', 502), { heptabaseReason: data.status === 'failed' ? data.failureReasonCode : undefined });
  return data;
}

async function rpcResponse(response, id) {
  if (!response.headers.get('content-type')?.includes('text/event-stream')) return providerData(await boundedText(response));
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw fail('卡片内容过大。', 413);
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) >= 0) {
        const event = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        const raw = event.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n');
        if (raw) { const payload = providerData(raw); if (payload.id === id) return payload; }
      }
    }
    throw fail('Heptabase 响应不完整，请重试。', 502);
  } finally { await reader.cancel(); reader.releaseLock(); }
}

export async function mcpClient(env) {
  const token = await accessToken(env);
  let session, version = '2025-03-26', nextId = 1;
  const rpc = async (method, params, notification = false) => {
    const id = notification ? undefined : nextId++;
    const response = await fetchNoRedirect(MCP, { method: 'POST', signal: AbortSignal.timeout(30000), headers: {
      authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream',
      'MCP-Protocol-Version': version, ...(session ? { 'Mcp-Session-Id': session } : {}),
    }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) });
    if (!response.ok) throw fail(`Heptabase 连接失败（${response.status}），请重新连接。`, 502);
    session = response.headers.get('mcp-session-id') || session;
    if (notification) { await response.body?.cancel(); return; }
    const data = await rpcResponse(response, id);
    if (data.error || data.id !== id) throw fail('Heptabase 未完成请求。', 502);
    return data.result;
  };
  const initialized = await rpc('initialize', { protocolVersion: version, capabilities: {}, clientInfo: { name: 'ethanblog-dashboard', version: '1.0.0' } });
  version = initialized.protocolVersion;
  await rpc('notifications/initialized', {}, true);
  return { call: async (name, args) => toolResult(await rpc('tools/call', { name, arguments: args })) };
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
export function cardId(link) {
  const match = new RegExp(`^heptabase://card/(${UUID})$`, 'i').exec(link || '');
  if (!match) throw fail('请填写 Heptabase 的 card link（heptabase://card/…）。');
  return match[1].toLowerCase();
}

function tagAttributes(source) {
  const attrs = {};
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) attrs[match[1]] = match[2];
  for (const match of source.matchAll(/([\w:-]+)\s*=\s*'([^']*)'/g)) if (attrs[match[1]] == null) attrs[match[1]] = match[2];
  return attrs;
}

function cardCountOf(text) {
  return /(?:cardCount|cards)\s*[:=]\s*"?(\d+)/i.exec(text || '')?.[1];
}

// list_tags has no name filter. Its content is either a tag element or one compact line per tag.
export function parseTagEntries(content) {
  const text = String(content || '');
  const xml = [...text.matchAll(/<tag\b([^>]*?)\/?>/gi)].map((match) => {
    const attrs = tagAttributes(match[1]);
    return { id: attrs.id, name: attrs.name, cardCount: attrs.cardCount };
  }).filter((tag) => tag.id && tag.name);
  if (xml.length) return xml;
  return [...text.matchAll(new RegExp(`^(?:tag\\s+)?"([^"]*)"\\s+\\[(${UUID})\\](.*)$`, 'gim'))].map((match) => ({
    id: match[2], name: match[1], cardCount: cardCountOf(match[3]),
  })).filter((tag) => tag.name);
}

export async function taggedCards(client, name) {
  const found = [], seenTags = new Set();
  for (let offset = 0; offset < 10000;) {
    const page = await client.call('list_tags', { offset, limit: 100 });
    const batch = parseTagEntries(page.content).filter((tag) => {
      if (seenTags.has(tag.id)) return false;
      seenTags.add(tag.id);
      return true;
    });
    found.push(...batch);
    if (!/more tags are available/i.test(page.content || '') || !batch.length) break;
    offset += batch.length;
    if (offset >= 10000) throw fail('标签过多，请精简后再拉取。');
  }
  const matches = found.filter((tag) => tag.name === name);
  if (matches.length !== 1) throw fail(`请在 Heptabase 中保留一个名为 ${name} 的标签。`);
  const tagId = matches[0].id, cards = [], seen = new Set();
  for (let offset = 0; offset < 10000;) {
    const page = await client.call('list_cards', { tagIds: [tagId], offset, limit: 100, include: ['timestamps'], sortBy: 'title', sortDirection: 'ascending' });
    const rows = [...page.content.matchAll(new RegExp(`^(\\w+) "(.*)" \\[(${UUID})\\](.*)$`, 'gm'))];
    for (const [, type, title, id, metadata] of rows) {
      if (seen.has(id)) throw fail('读取卡片时列表发生变化，请重新拉取。', 409);
      seen.add(id); cards.push({ id, type, title, created: /created: ([^;\s]+)/.exec(metadata)?.[1] || '', cardLink: `heptabase://card/${id}` });
    }
    if (!page.content.includes('More cards are available.')) break;
    if (!rows.length) throw fail('Heptabase 返回了无法识别的卡片列表。', 502);
    offset += rows.length;
    if (offset >= 10000) throw fail('卡片过多，请分批同步。');
  }
  if (Number(matches[0].cardCount) !== cards.length) throw fail('Heptabase 卡片数量已变化，请重新拉取完整列表。', 409);
  return { tagId, cards };
}

export const blogCards = (client) => taggedCards(client, 'blog');

export async function readCard(client, id) {
  // Public read_object currently provides Hepta Markdown and line numbers, not
  // stable block IDs. These offsets are pagination only, never paragraph identity.
  const lines = []; let expected = 1, total;
  for (let offset = 0; offset < 20000;) {
    const page = await client.call('read_object', { objectId: id, objectType: 'card', offset, limit: 200 });
    total = page.totalLines ?? Number(/\] (\d+) lines/.exec(page.content)?.[1]);
    for (const match of page.content.matchAll(/^(\d+)\t(.*)$/gm)) {
      if (Number(match[1]) !== expected++) throw fail('Heptabase 卡片内容不完整，请重新拉取。', 502);
      lines.push(match[2]);
    }
    if (!page.hasMore && lines.length === total) return lines.join('\n');
    if (lines.length <= offset || !Number.isFinite(total)) throw fail('Heptabase 卡片内容不完整。', 502);
    offset = lines.length;
  }
  throw fail('卡片过长，请先拆分内容。');
}
