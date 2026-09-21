import { boundedText, fail, withLock } from './auth.mjs';
import { blogCards, mcpClient } from './heptabase.mjs';
import { blogSchema, publicationDate, readProperties, writeProperties } from './card-properties.mjs';

export async function prepareWriteback(env, releaseId, cards) {
  if (!cards.length) return;
  const client = await mcpClient(env);
  const { tagId } = await blogCards(client);
  const schema = await blogSchema(client, tagId);
  for (const id of new Set(cards)) {
    const properties = await readProperties(client, id, schema);
    // Referenced cards need not join #blog or become new list entries.
    if (!properties.member) continue;
    await env.DB.prepare('INSERT OR IGNORE INTO studio_release_cards (release_id, card_id, expected_status, expected_date, published_date) VALUES (?1, ?2, ?3, ?4, ?5)')
      .bind(releaseId, id, properties.status, properties.date, publicationDate(new Date(), env.STUDIO_TIMEZONE)).run();
  }
}

export async function completeWriteback(env, releaseId) {
  return withLock(env, 'heptabase-writeback', async () => {
  const rows = (await env.DB.prepare('SELECT * FROM studio_release_cards WHERE release_id = ?1 AND completed = 0').bind(releaseId).all()).results;
  if (!rows.length) return { pending: 0, errors: [] };
  try {
    const client = await mcpClient(env);
    const { tagId } = await blogCards(client);
    const schema = await blogSchema(client, tagId);
    for (const row of rows) {
      try {
        const current = await readProperties(client, row.card_id, schema);
        if (!current.member) throw fail('卡片已移出 #blog，未改写属性。');
        if (current.status !== row.expected_status && current.status !== 'published') throw fail('发布过程中 Status 又被修改，未覆盖你的新标记。');
        const date = row.published_date || publicationDate(new Date(), env.STUDIO_TIMEZONE || 'Africa/Dar_es_Salaam');
        // Persist the initial day before the external write, including timeout retries.
        await env.DB.prepare('UPDATE studio_release_cards SET published_date = ?1 WHERE release_id = ?2 AND card_id = ?3').bind(date, releaseId, row.card_id).run();
        const desired = { status: 'published', ...(!current.date ? { date } : {}) };
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
  return { pending: pending.length, errors: pending.map((r) => r.error).filter(Boolean) };
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
