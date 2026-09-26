import { boundedText, fail, withLock } from './auth.mjs';
import { blogCards, cardTimestamps, mcpClient } from './heptabase.mjs';
import { blogSchema, dateFromCard, publicationDate, readProperties, writeProperties } from './card-properties.mjs';
import { IO_CONCURRENCY, mapLimited } from './pool.mjs';

const WRITEBACK_BATCH = 4;

export async function prepareWriteback(env, releaseId, cards) {
  if (!cards.length) return;
  const client = await mcpClient(env);
  const { tagId } = await blogCards(client);
  const schema = await blogSchema(client, tagId);
  await mapLimited([...new Set(cards)], IO_CONCURRENCY, async id => {
    const properties = await readProperties(client, id, schema);
    // Referenced cards need not join #blog or become new list entries.
    if (!properties.member) return;
    await env.DB.prepare('INSERT OR IGNORE INTO studio_release_cards (release_id, card_id, expected_status, expected_date, published_date) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(releaseId, id, properties.status, properties.date, publicationDate(new Date(), env.STUDIO_TIMEZONE)).run();
  });
}

/** Dialog remarks are stored on the decision until a deploy actually finishes. Retries write that same text. */
async function flushPendingRemarks(env) {
  const rows = (await env.DB.prepare("SELECT card_id, payload FROM studio_review_decisions WHERE status = 'complete'").all()).results || [];
  const due = [];
  for (const row of rows) {
    let plan;
    try { plan = JSON.parse(row.payload); } catch { continue; }
    if (!plan?.remarkPending || typeof plan.pendingRemark !== 'string') continue;
    due.push({ id: row.card_id, remark: plan.pendingRemark, plan });
  }
  if (!due.length) return { written: 0 };
  const client = await mcpClient(env);
  const { tagId } = await blogCards(client);
  const schema = await blogSchema(client, tagId);
  let written = 0;
  for (const item of due.slice(0, WRITEBACK_BATCH)) {
    const current = await readProperties(client, item.id, schema);
    if ((current.remark || '') !== item.remark) {
      await writeProperties(client, item.id, schema, { remark: item.remark });
      written += 1;
    }
    item.plan.remarkPending = false;
    item.plan.remarkWritten = item.remark;
    await env.DB.prepare('UPDATE studio_review_decisions SET payload = ?2 WHERE card_id = ?1').bind(item.id, JSON.stringify(item.plan)).run();
  }
  return { written, pending: Math.max(0, due.length - WRITEBACK_BATCH) };
}

export async function completeWriteback(env, releaseId) {
  return withLock(env, 'heptabase-writeback', async () => {
  const rows = (await env.DB.prepare('SELECT * FROM studio_release_cards WHERE release_id = ?1 AND completed = 0').bind(releaseId).all()).results;
  if (!rows.length) {
    const remarks = await flushPendingRemarks(env);
    return { pending: 0, errors: [], remarks };
  }
  try {
    const client = await mcpClient(env);
    const { tagId } = await blogCards(client);
    const schema = await blogSchema(client, tagId);
    for (const row of rows.slice(0, WRITEBACK_BATCH)) {
      try {
        const current = await readProperties(client, row.card_id, schema);
        if (!current.member) throw fail('卡片已移出 #blog，未改写属性。');
        if (current.status !== row.expected_status && current.status !== 'published') throw fail('发布过程中 Status 又被修改，未覆盖你的新标记。');
        const stamps = (await cardTimestamps(client, [row.card_id])).get(row.card_id);
        const copied = dateFromCard({ publishDate: current.date, created: stamps.created, timezone: env.STUDIO_TIMEZONE || 'Africa/Dar_es_Salaam' });
        const date = copied.date || row.published_date || publicationDate(new Date(), env.STUDIO_TIMEZONE || 'Africa/Dar_es_Salaam');
        // Persist the day taken from the card before the external write, including timeout retries.
        await env.DB.prepare('UPDATE studio_release_cards SET published_date = ?1 WHERE release_id = ?2 AND card_id = ?3').bind(date, releaseId, row.card_id).run();
        const desired = { status: 'published', ...(!current.date && copied.invented ? { date } : {}) };
        await writeProperties(client, row.card_id, schema, desired);
        await env.DB.prepare('UPDATE studio_release_cards SET completed = 1, error = NULL WHERE release_id = ?1 AND card_id = ?2').bind(releaseId, row.card_id).run();
      } catch (error) {
        await env.DB.prepare('UPDATE studio_release_cards SET error = ?1 WHERE release_id = ?2 AND card_id = ?3').bind(error.message, releaseId, row.card_id).run();
      }
    }
  } catch (error) {
    return { pending: rows.length, errors: [error.message] };
  }
  const pending = (await env.DB.prepare('SELECT error FROM studio_release_cards WHERE release_id = ?1 AND completed = 0').bind(releaseId).all()).results;
  const remarks = await flushPendingRemarks(env);
  return { pending: pending.length, errors: pending.map((r) => r.error).filter(Boolean), remarks };
  });
}

async function key(secret) {
  if (!secret) throw fail('发布回执密钥尚未配置。', 503);
  return crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}
export async function signReceipt(secret, body) {
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), new TextEncoder().encode(body)))].map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function verifyReceipt(env, request) {
  const body = await boundedText(request, 1024);
  if (body.length > 1024) throw fail('发布回执过大。', 413);
  const signature = request.headers.get('x-studio-signature') || '';
  if (!/^[0-9a-f]{64}$/.test(signature)) throw fail('发布回执无效。', 403);
  const bytes = Uint8Array.from(signature.match(/../g), x => parseInt(x, 16));
  if (!await crypto.subtle.verify('HMAC', await key(env.STUDIO_SECRET), bytes, new TextEncoder().encode(body))) throw fail('发布回执无效。', 403);
  const payload = JSON.parse(body);
  if (!/^[0-9a-f]{40}$/.test(payload.commitSha) || !Number.isFinite(payload.timestamp) || Math.abs(Date.now() - payload.timestamp) > 300000) throw fail('发布回执已过期。', 403);
  return payload;
}
