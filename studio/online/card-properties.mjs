import { fail } from './auth.mjs';

export async function blogSchema(client, tagId) {
  const db = await client.call('read_database', { tagId });
  const fields = Object.entries(db.configuration?.schema || {}).map(([id, field]) => ({ id, ...field }));
  const field = (names, type) => {
    const matches = fields.filter((f) => names.includes(f.name.trim().toLowerCase()) && f.type === type);
    if (matches.length !== 1) throw fail(`blog 表格需要一个 ${names[0]} 字段（${type}）。`);
    return matches[0];
  };
  const schema = {
    tagId,
    status: field(['status'], 'select'),
    date: field(['publish date', 'published date'], 'date'),
    tags: field(['tag', 'tags'], 'multiSelect'),
    type: field(['blog type'], 'select'),
  };
  for (const name of ['new', 'writing', 'block', 'review', 'published']) if (schema.status.options.filter((o) => o.name.trim().toLowerCase() === name).length !== 1) throw fail(`Status 需要一个 ${name} 选项。`);
  for (const name of ['blog', 'project']) if (schema.type.options.filter((o) => o.name.trim().toLowerCase() === name).length !== 1) throw fail(`Blog Type 需要一个 ${name} 选项。`);
  return schema;
}

export function collectionForBlogType(type) {
  if (type === 'blog') return 'articles';
  if (type === 'project') return 'projects';
  throw fail('请在 Heptabase 为这张卡片选择 Blog Type（Blog 或 Project）。');
}

export function propertiesFromRead(content, schema) {
  const lines = content.split('\n'); const values = {}; let matching = false, member = false;
  for (const line of lines) {
    if (/^\d+\t/.test(line)) break;
    if (line.startsWith('- tag ')) { matching = line.endsWith(`[${schema.tagId}]`); member ||= matching; }
    const match = /^  - ("(?:[^"\\]|\\.)*"): (.+)$/.exec(line);
    if (matching && match) {
      try { values[JSON.parse(match[1])] = JSON.parse(match[2]); }
      catch { throw fail('Heptabase 属性格式无法识别，未继续同步。', 502); }
    }
  }
  const status = String(values[schema.status.name] ?? 'new').trim().toLowerCase();
  if (!['new', 'writing', 'block', 'review', 'published'].includes(status)) throw fail('Heptabase Status 选项尚未对应。');
  const dateValue = values[schema.date.name];
  const date = (typeof dateValue === 'string' ? dateValue : dateValue?.start)?.slice(0, 10) || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('发布日期无法识别。');
  const tags = values[schema.tags.name] ?? [];
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) throw fail('Heptabase Tag 应是多选标签。');
  const typeValue = values[schema.type.name];
  const type = typeValue == null || typeValue === '' ? null : String(typeValue).trim().toLowerCase();
  if (type && !['blog', 'project'].includes(type)) throw fail('Blog Type 选项尚未对应。');
  return { member, status, date, tags: [...new Set(tags)].sort(), type };
}

export async function readProperties(client, cardId, schema) {
  return propertiesFromRead((await client.call('read_object', { objectId: cardId, objectType: 'card', offset: 0, limit: 1 })).content, schema);
}

export function validatePropertyTags(tags, schema) {
  const missing = tags.filter((tag) => !schema.tags.options.some((o) => o.name === tag));
  if (missing.length) throw fail(`请先在 Heptabase 的 Tag 字段添加这些选项：${missing.join('、')}。当前 MCP 只能选已有选项，不能创建选项；没有删掉任何标签。`);
}

export async function writeProperties(client, id, schema, desired) {
  validatePropertyTags(desired.tags || [], schema);
  const edits = [];
  if (desired.status !== undefined) {
    const option = schema.status.options.find(o => o.name.trim().toLowerCase() === desired.status);
    if (!option) throw fail('目标 Status 选项不存在。');
    edits.push({ cardId: id, propertyId: schema.status.id, type: 'select', value: option.name });
  }
  if (desired.date !== undefined) edits.push({ cardId: id, propertyId: schema.date.id, type: 'date', value: desired.date ? { start: `${desired.date}T00:00:00.000Z` } : null });
  if (desired.tags !== undefined) edits.push({ cardId: id, propertyId: schema.tags.id, type: 'multiSelect', value: desired.tags });
  if (desired.type !== undefined) {
    const option = schema.type.options.find((o) => o.name.trim().toLowerCase() === desired.type);
    if (!option) throw fail('目标 Blog Type 选项不存在。');
    edits.push({ cardId: id, propertyId: schema.type.id, type: 'select', value: option.name });
  }
  if (!edits.length) return;
  const result = await client.call('edit_card_properties', { tagId: schema.tagId, edits });
  if (!result.results || result.results.length !== edits.length || result.results.some((r) => r.status !== 'success')) throw fail('Heptabase 属性没有全部写入，请重新比较后补齐。', 502);
  const actual = await readProperties(client, id, schema);
  for (const key of ['status', 'date', 'tags', 'type']) {
    if (desired[key] === undefined) continue;
    const expected = key === 'tags' ? [...desired.tags].sort() : desired[key];
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected)) throw fail('Heptabase 属性核验不一致，请重新比较。', 409);
  }
}

export function publicationDate(now = new Date(), timezone = 'Africa/Dar_es_Salaam') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
