import { fail } from './auth.mjs';

export async function blogSchema(client, tagId) {
  const db = await client.call('read_database', { tagId });
  const fields = Object.entries(db.configuration?.schema || {}).map(([id, field]) => ({ id, ...field }));
  const field = (names, type) => {
    const matches = fields.filter((f) => names.includes(f.name.trim().toLowerCase()) && f.type === type);
    if (matches.length !== 1) throw fail(`blog 表格需要一个 ${names[0]} 字段（${type}）。`);
    return matches[0];
  };
  // Newer columns are looked up by name in the live schema. A database without them keeps working; only writing a remark needs one.
  const optional = (names, types) => {
    const accepted = Array.isArray(types) ? types : [types];
    const matches = fields.filter((f) => names.includes(f.name.trim().toLowerCase()) && accepted.includes(f.type));
    if (matches.length > 1) throw fail(`blog 表格有多个 ${names[0]} 字段。`);
    return matches[0] || null;
  };
  const schema = {
    tagId,
    status: field(['status'], 'select'),
    date: field(['publish date', 'published date'], 'date'),
    tags: field(['tag', 'tags'], 'multiSelect'),
    type: field(['blog type'], 'select'),
    summary: field(['summary'], 'text'),
    remark: optional(['remark'], 'text'),
    // Ethan renamed URL to slug. The live column is a select; older copies were text. The id is read from the database.
    url: optional(['slug', 'url'], ['text', 'select']),
    language: optional(['language'], 'select'),
  };
  for (const name of ['new', 'writing', 'blocked', 'review', 'published']) if (schema.status.options.filter((o) => o.name.trim().toLowerCase() === name).length !== 1) throw fail(`Status 需要一个 ${name} 选项。`);
  for (const name of ['article', 'project', 'page', 'reference']) if (schema.type.options.filter((o) => o.name.trim().toLowerCase() === name).length !== 1) throw fail(`Blog Type 需要一个 ${name} 选项。`);
  return schema;
}

export function collectionForBlogType(type) {
  if (type === 'article' || type === 'reference') return 'articles';
  if (type === 'project') return 'projects';
  if (type === 'page') return 'pages';
  throw fail('请在 Heptabase 为这张卡片选择 Blog Type（Article、Project、Page 或 Reference）。');
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
  if (!['new', 'writing', 'blocked', 'review', 'published'].includes(status)) throw fail('Heptabase Status 选项尚未对应。');
  const dateValue = values[schema.date.name];
  const date = (typeof dateValue === 'string' ? dateValue : dateValue?.start)?.slice(0, 10) || null;
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw fail('发布日期无法识别。');
  const tags = values[schema.tags.name] ?? [];
  if (!Array.isArray(tags) || tags.some((t) => typeof t !== 'string')) throw fail('Heptabase Tag 应是多选标签。');
  const typeValue = values[schema.type.name];
  const type = typeValue == null || typeValue === '' ? null : String(typeValue).trim().toLowerCase();
  const typeNames = schema.type.options.map((option) => option.name.trim().toLowerCase());
  if (type && (!typeNames.includes(type) || !['article', 'project', 'page', 'reference'].includes(type))) throw fail('Blog Type 选项尚未对应。');
  const summaryValue = values[schema.summary.name];
  if (summaryValue != null && typeof summaryValue !== 'string') throw fail('Summary 应是一段文字。');
  const summary = typeof summaryValue === 'string' ? summaryValue.trim() : '';
  const remarkValue = schema.remark ? values[schema.remark.name] : null;
  if (remarkValue != null && typeof remarkValue !== 'string') throw fail('Remark 应是一段文字。');
  const urlValue = schema.url ? values[schema.url.name] : null;
  if (urlValue != null && typeof urlValue !== 'string') throw fail('URL 应是一段文字。');
  return { member, status, date, tags: [...new Set(tags)].sort(), type, summary,
    remark: typeof remarkValue === 'string' ? remarkValue : '',
    url: routeSlug(urlValue),
    language: sourceLanguage(schema.language ? values[schema.language.name] : null) };
}

/** Schema of the #i18n database. Property ids come from that live database. */
export async function i18nSchema(client, tagId) {
  const db = await client.call('read_database', { tagId });
  const fields = Object.entries(db.configuration?.schema || {}).map(([id, field]) => ({ id, ...field }));
  const find = (name, type) => fields.filter((f) => f.name.trim().toLowerCase() === name && f.type === type);
  const language = find('language', 'select');
  const url = fields.filter((f) => ['slug', 'url'].includes(f.name.trim().toLowerCase()) && (f.type === 'text' || f.type === 'select'));
  if (language.length !== 1) throw fail('#i18n 表格需要一个 Language 字段（select）。');
  if (url.length > 1) throw fail('#i18n 表格有多个 slug 字段。');
  return { tagId, language: language[0], url: url[0] || null, databaseId: db.id || null };
}

/** Properties of a translation card, read from its #i18n row. */
export function translationFromRead(content, schema) {
  const values = {}; let matching = false, member = false;
  for (const line of content.split('\n')) {
    if (/^\d+\t/.test(line)) break;
    if (line.startsWith('- tag ')) { matching = line.endsWith(`[${schema.tagId}]`); member ||= matching; }
    const match = /^  - ("(?:[^"\\]|\\.)*"): (.+)$/.exec(line);
    if (matching && match) {
      try { values[JSON.parse(match[1])] = JSON.parse(match[2]); }
      catch { throw fail('Heptabase 属性格式无法识别，未继续同步。', 502); }
    }
  }
  const urlValue = schema.url ? values[schema.url.name] : null;
  if (urlValue != null && typeof urlValue !== 'string') throw fail('译文的 URL 应是一段文字。');
  return { i18n: true, member, language: versionLanguage(values[schema.language.name]), url: routeSlug(urlValue) };
}

/**
 * Same slug is the same page. A #i18n card is the English (or other) version only when
 * its language is not Chinese. The relation property is not consulted.
 */
export function sharesSlug(blog, translated) {
  if (!blog?.url || !translated?.member || !translated.url || !translated.language || translated.language === 'zh') return false;
  return translated.url === blog.url;
}

export async function readTranslation(client, cardId, schema) {
  return translationFromRead((await client.call('read_object', { objectId: cardId, objectType: 'card', offset: 0, limit: 1 })).content, schema);
}

const LANGUAGE_CODES = { english: 'en', japanese: 'ja', '日本語': 'ja', french: 'fr', 'français': 'fr', german: 'de', deutsch: 'de', spanish: 'es', 'español': 'es', korean: 'ko', '한국어': 'ko', italian: 'it', portuguese: 'pt', russian: 'ru' };

function languageCode(value) {
  const text = String(value).trim().toLowerCase();
  if (/chinese|中文|^zh$|^cn$/.test(text)) return 'zh';
  const code = LANGUAGE_CODES[text] || text;
  if (!/^[a-z]{2,3}$/.test(code)) throw fail(`无法识别语言「${value}」。请用 en、ja、fr 或 cn 这样的语言。`);
  return code;
}

/** Language of a #blog card. Empty means the Chinese source. */
export function sourceLanguage(value) {
  if (value == null || value === '') return 'zh';
  return languageCode(value);
}

/** Language of a #i18n card. Empty is unknown and does not pair. Chinese is `zh`, not an English page. */
export function versionLanguage(value) {
  if (value == null || value === '') return null;
  return languageCode(value);
}

/**
 * Language code of a non-Chinese translation. Chinese stays on the #blog card.
 */
export function translationLanguage(value) {
  if (value == null || value === '') throw fail('译文卡片需要填写 Language。');
  const code = languageCode(value);
  if (code === 'zh') throw fail('中文写在 #blog 原卡片里；#i18n 的中文卡片不是英文页。');
  return code;
}

/** Top-level paths the site already owns. Keep in sync with RESERVED_URLS in src/lib/routes.ts. */
export const RESERVED_URLS = ['en', 'cn', 'now', 'tags', 'articles', 'projects', 'dashboard', 'contact', 'privacy', 'about', 'blogs', 'search', 'lab', 'for-agents', 'pages', 'zh', 'api', 'studio', 'index', 'rss', 'sitemap', 'robots', 'llms', 'llms-full', 'openapi', '404'];

/**
 * The slug column as written, trimmed. It is only read here: whether it is allowed depends on
 * the card's type, so it is checked when that card is routed, never while pulling the list.
 */
export function routeSlug(value) {
  if (value == null) return null;
  const slug = String(value).trim().replace(/^\/+|\/+$/g, '');
  return slug || null;
}

/**
 * An article (or translation) slug becomes /<slug> on the site. It is never derived from the title
 * and may not take over a fixed route.
 */
export function assertArticleSlug(slug) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || /^\d+$/.test(slug)) throw fail(`slug「${slug}」只能用小写字母、数字和连字符，且不能只有数字。请在 Heptabase 改好后重新拉取。`);
  if (RESERVED_URLS.includes(slug)) throw fail(`slug「${slug}」与网站固定地址 /${slug} 冲突。文章不能占用固定地址，请在 Heptabase 换一个 slug 后重新拉取。`, 409);
  return slug;
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
  if (desired.remark !== undefined) {
    if (!schema.remark) throw fail('blog 表格没有 Remark 字段，无法写回拒绝说明。');
    edits.push({ cardId: id, propertyId: schema.remark.id, type: 'text', value: desired.remark || null });
  }
  if (desired.type !== undefined) {
    const option = schema.type.options.find((o) => o.name.trim().toLowerCase() === desired.type);
    if (!option) throw fail('目标 Blog Type 选项不存在。');
    edits.push({ cardId: id, propertyId: schema.type.id, type: 'select', value: option.name });
  }
  if (!edits.length) return;
  const result = await client.call('edit_card_properties', { tagId: schema.tagId, edits });
  if (!result.results || result.results.length !== edits.length || result.results.some((r) => r.status !== 'success')) throw fail('Heptabase 属性没有全部写入，请重新比较后补齐。', 502);
  const actual = await readProperties(client, id, schema);
  for (const key of ['status', 'date', 'tags', 'type', 'remark']) {
    if (desired[key] === undefined) continue;
    const expected = key === 'tags' ? [...desired.tags].sort() : key === 'remark' ? desired.remark || '' : desired[key];
    if (JSON.stringify(actual[key]) !== JSON.stringify(expected)) throw fail('Heptabase 属性核验不一致，请重新比较。', 409);
  }
}

export function publicationDate(now = new Date(), timezone = 'Africa/Dar_es_Salaam') {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// Publish Date wins. Otherwise use the card's created time. Today is only a last resort when the card stores neither.
export function dateFromCard({ publishDate, created, timezone = 'Africa/Dar_es_Salaam' } = {}) {
  if (publishDate) return { date: publishDate, invented: false };
  if (created) {
    const instant = new Date(created);
    if (Number.isNaN(instant.getTime())) throw fail('卡片的创建时间无法识别，未改用今天的日期。', 502);
    return { date: publicationDate(instant, timezone), invented: false };
  }
  return { date: null, invented: true };
}
