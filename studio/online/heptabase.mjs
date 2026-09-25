import { boundedText, fail, fetchNoRedirect, hash, randomToken, withLock } from './auth.mjs';

const ORIGIN = 'https://api.heptabase.com';
const MCP = `${ORIGIN}/mcp`;
const encoder = new TextEncoder();
const b64 = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
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

function toolText(result, data) {
  return [data?.failureReasonCode, data?.content, ...(Array.isArray(result?.content) ? result.content.map((part) => part?.text || '') : [])].filter(Boolean).join('\n');
}

export function toolResult(result) {
  let data = result.structuredContent;
  if (!data) {
    const text = (result.content || []).filter((p) => p.type === 'text').map((p) => p.text).join('\n');
    try { data = JSON.parse(text); } catch { data = { content: text }; }
  }
  const missing = /objectNotFound|object was not found|对象不存在/i.test(toolText(result, data));
  if (missing) throw Object.assign(fail('Heptabase 卡片已不存在。', 404), { heptabaseReason: 'objectNotFound' });
  if (result.isError || data.status === 'failed') throw Object.assign(fail('Heptabase 未能完成操作，请检查连接和卡片权限。', 502), { heptabaseReason: data.status === 'failed' ? data.failureReasonCode : undefined });
  return data;
}

const pullKey = (sessionId) => `pull:${sessionId}`;
export const readPullScan = (env, sessionId) => get(env, pullKey(sessionId));
export async function writePullScan(env, sessionId, data) { await put(env, pullKey(sessionId), data); }
export async function clearPullScan(env, sessionId) {
  await env.DB.prepare('DELETE FROM studio_connections WHERE id = ?1').bind(pullKey(sessionId)).run();
}

function storedProperties(text) {
  if (!text) return null;
  try { return JSON.parse(text); }
  catch { return null; }
}

// edited_at is the Heptabase updated time from the last successful pull of this card.
export async function readCardPulls(env) {
  const rows = (await env.DB.prepare('SELECT card_id, edited_at, properties, card_created, source IS NOT NULL AS has_source FROM studio_card_pulls').all()).results || [];
  return new Map(rows.map((row) => [row.card_id, {
    edited_at: row.edited_at,
    properties: storedProperties(row.properties),
    card_created: row.card_created || '',
    has_source: Boolean(row.has_source),
  }]));
}

export async function readCardPull(env, id) {
  const row = await env.DB.prepare('SELECT card_id, edited_at, properties, source, card_created FROM studio_card_pulls WHERE card_id = ?1').bind(id).first();
  if (!row) return null;
  return { edited_at: row.edited_at, properties: storedProperties(row.properties), source: row.source ?? null, card_created: row.card_created || '' };
}

// Property reads remember the edited time but drop a body that belongs to an older time.
export async function saveCardProperties(env, id, edited, created, properties) {
  if (!edited) return;
  await env.DB.prepare(`INSERT INTO studio_card_pulls (card_id, edited_at, properties, source, card_created, pulled_at)
    VALUES (?1, ?2, ?3, NULL, ?4, ?5)
    ON CONFLICT(card_id) DO UPDATE SET
      source = CASE WHEN studio_card_pulls.edited_at = excluded.edited_at THEN studio_card_pulls.source ELSE NULL END,
      edited_at = excluded.edited_at, properties = excluded.properties, card_created = excluded.card_created, pulled_at = excluded.pulled_at`)
    .bind(id, edited, JSON.stringify(properties), created || '', new Date().toISOString()).run();
}

export async function saveCardContent(env, id, edited, created, properties, source) {
  if (!edited) return;
  await env.DB.prepare(`INSERT INTO studio_card_pulls (card_id, edited_at, properties, source, card_created, pulled_at)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6)
    ON CONFLICT(card_id) DO UPDATE SET
      edited_at = excluded.edited_at, properties = excluded.properties, source = excluded.source, card_created = excluded.card_created, pulled_at = excluded.pulled_at`)
    .bind(id, edited, JSON.stringify(properties), source, created || '', new Date().toISOString()).run();
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

// Heptabase list tools used to say "More cards are available."; newer replies use an
// output-budget footer with an explicit next offset. Prefer that offset when present.
export function listContinueOffset(content, collected) {
  const text = String(content || '');
  const budget = /(?:call list_(?:cards|tags) with )?offset\s+(\d+)\s+to continue/i.exec(text)
    || /output budget reached[\s\S]*?\boffset\s+(\d+)/i.exec(text);
  if (budget) return Number(budget[1]);
  if (/more (?:cards|tags) are available/i.test(text)) return collected;
  return null;
}

async function allTags(client) {
  const found = [], seenTags = new Set();
  for (let offset = 0; offset < 10000;) {
    const page = await client.call('list_tags', { offset, limit: 100 });
    const batch = parseTagEntries(page.content).filter((tag) => {
      if (seenTags.has(tag.id)) return false;
      seenTags.add(tag.id);
      return true;
    });
    found.push(...batch);
    const next = listContinueOffset(page.content, found.length);
    if (next == null || !batch.length) break;
    offset = next;
    if (offset >= 10000) throw fail('标签过多，请精简后再拉取。');
  }
  return found;
}

function tagNamed(tags, name) {
  const matches = tags.filter((tag) => tag.name === name);
  if (matches.length !== 1) throw fail(`请在 Heptabase 中保留一个名为 ${name} 的标签。`);
  return matches[0];
}

export async function tagByName(client, name) {
  return tagNamed(await allTags(client), name);
}

// CardList only: id, title, and edited time. No properties and no body.
async function cardsInTag(client, tag) {
  const cards = [], seen = new Set();
  for (let offset = 0; offset < 10000;) {
    const page = await client.call('list_cards', { tagIds: [tag.id], offset, limit: 100, include: ['timestamps'], sortBy: 'title', sortDirection: 'ascending' });
    const rows = parseCardList(page.content);
    for (const card of rows) {
      if (seen.has(card.id)) throw fail('读取卡片时列表发生变化，请重新拉取。', 409);
      seen.add(card.id);
      cards.push(card);
    }
    const next = listContinueOffset(page.content, cards.length);
    if (next == null) break;
    if (!rows.length) throw fail('Heptabase 返回了无法识别的卡片列表。', 502);
    if (next <= offset) throw fail('Heptabase 卡片列表分页未前进。', 502);
    offset = next;
    if (offset >= 10000) throw fail('卡片过多，请分批同步。');
  }
  const expected = Number(tag.cardCount);
  if (Number.isFinite(expected) && expected !== cards.length) {
    throw fail('Heptabase 卡片数量已变化，请重新拉取完整列表。', 409);
  }
  return { tagId: tag.id, cards };
}

async function taggedCardsOnce(client, name) {
  const tag = tagNamed(await allTags(client), name);
  return cardsInTag(client, tag);
}

// Count mismatches and mid-list churn are transient. Retry inside this pull so the
// dashboard button does not ask the user to click the same action again.
export async function taggedCards(client, name) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await taggedCardsOnce(client, name); }
    catch (error) {
      last = error;
      if (error.status !== 409) throw error;
    }
  }
  throw last;
}

export const blogCards = (client) => taggedCards(client, 'blog');
// English (and other) translations live in the tag database named i18n.
export const i18nCards = (client) => taggedCards(client, 'i18n');

// One tag walk, then CardList + edited time for #blog and #i18n. No card bodies.
export async function dashboardCardLists(client) {
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const tags = await allTags(client);
      const blog = await cardsInTag(client, tagNamed(tags, 'blog'));
      const i18n = await cardsInTag(client, tagNamed(tags, 'i18n'));
      return { blog, i18n };
    } catch (error) {
      last = error;
      if (error.status !== 409) throw error;
    }
  }
  throw last;
}

function stampField(metadata, names) {
  for (const name of names) {
    const match = new RegExp(`(?:^|[;\\s])${name}: ([^;\\s]+)`).exec(metadata || '');
    if (match) return match[1];
  }
  return '';
}

export function cardStamps(metadata) {
  return {
    created: stampField(metadata, ['created', 'createdTime']),
    // Heptabase CardList calls this editedTime. Older replies used updated.
    updated: stampField(metadata, ['editedTime', 'edited', 'updated']),
  };
}

export function parseCardList(content) {
  const rows = [...String(content || '').matchAll(new RegExp(`^(\\w+) "(.*)" \\[(${UUID})\\](.*)$`, 'gm'))];
  return rows.map(([, type, title, id, metadata]) => ({ id, type, title, ...cardStamps(metadata), cardLink: `heptabase://card/${id}` }));
}

export async function cardTimestamps(client, ids) {
  const wanted = [...new Set(ids)].filter(Boolean);
  const found = new Map();
  for (let index = 0; index < wanted.length; index += 100) {
    const batch = wanted.slice(index, index + 100);
    const page = await client.call('list_cards', { cardIds: batch, include: ['timestamps'], limit: 100 });
    for (const card of parseCardList(page.content)) found.set(card.id, { created: card.created, updated: card.updated });
    if (batch.some((id) => !found.has(id))) throw fail('Heptabase 没有返回卡片的创建时间，未改用今天的日期。', 502);
  }
  return found;
}

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
