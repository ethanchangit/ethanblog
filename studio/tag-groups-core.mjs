/** Runtime-independent tag taxonomy parser and serializer. */
export const RESERVED_SLUGS = new Set(['all', 'other']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function skipWs(src, i) {
  while (i < src.length && /\s/.test(src[i])) i += 1;
  return i;
}

function parseQuoted(src, start) {
  const q = src[start];
  if (q !== "'" && q !== '"') return null;
  let i = start + 1;
  let out = '';
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') { out += src[i + 1] ?? ''; i += 2; continue; }
    if (ch === q) return { value: out, next: i + 1 };
    out += ch;
    i += 1;
  }
  throw new Error('不合法：字符串未闭合');
}

function skipString(src, i) { const parsed = parseQuoted(src, i); return parsed ? parsed.next : i + 1; }

export function findMatching(src, openIndex, openCh = '[', closeCh = ']') {
  let depth = 0;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'") { i = skipString(src, i) - 1; continue; }
    if (ch === '/' && src[i + 1] === '/') { const nl = src.indexOf('\n', i); i = nl === -1 ? src.length : nl; continue; }
    if (ch === '/' && src[i + 1] === '*') { const end = src.indexOf('*/', i + 2); i = end === -1 ? src.length : end + 1; continue; }
    if (ch === openCh) depth += 1;
    else if (ch === closeCh && --depth === 0) return i;
  }
  throw new Error('不合法：找不到闭合的 tagGroups 数组');
}

function parseStringList(inner) {
  const out = [];
  let i = 0;
  while (i < inner.length) {
    i = skipWs(inner, i);
    if (i >= inner.length) break;
    if (inner[i] === ',') { i += 1; continue; }
    const parsed = parseQuoted(inner, i);
    if (!parsed) { i += 1; continue; }
    if (parsed.value.trim()) out.push(parsed.value.trim());
    i = parsed.next;
  }
  return out;
}

function pickProp(objSrc, key) {
  const match = new RegExp(`(?:^|[,{\\s])${key}\\s*:`).exec(objSrc);
  if (!match) return '';
  const parsed = parseQuoted(objSrc, skipWs(objSrc, match.index + match[0].length));
  return parsed ? parsed.value : '';
}

function pickTags(objSrc) {
  const match = /(?:^|[,{\s])tags\s*:/.exec(objSrc);
  if (!match) return [];
  const open = objSrc.indexOf('[', match.index + match[0].length - 1);
  if (open === -1) return [];
  const close = findMatching(objSrc, open);
  return parseStringList(objSrc.slice(open + 1, close));
}

export function parseTagGroupsSource(source) {
  const marker = 'export const tagGroups';
  const start = source.indexOf(marker);
  const eq = source.indexOf('=', start);
  const open = source.indexOf('[', eq);
  if (start === -1 || eq === -1 || open === -1) throw new Error('不合法：找不到 tagGroups 数组');
  const close = findMatching(source, open);
  const body = source.slice(open + 1, close);
  const groups = [];
  let i = 0;
  while (i < body.length) {
    i = skipWs(body, i);
    if (i >= body.length) break;
    if (body[i] === ',') { i += 1; continue; }
    if (body[i] === '{') {
      const end = findMatching(body, i, '{', '}');
      const src = body.slice(i, end + 1);
      groups.push({ slug: pickProp(src, 'slug').trim(), title: pickProp(src, 'title').trim(), titleEn: pickProp(src, 'titleEn').trim(), tags: pickTags(src) });
      i = end + 1;
    } else i += 1;
  }
  return groups;
}

export function serializeTagGroups(groups) {
  const blocks = groups.map((group) => `  {\n    slug: ${JSON.stringify(group.slug)},\n    title: ${JSON.stringify(group.title)},\n    titleEn: ${JSON.stringify(group.titleEn)},\n    tags: [${group.tags.map((tag) => JSON.stringify(tag)).join(', ')}],\n  }`);
  return `[` + (blocks.length ? `\n${blocks.join(',\n')},\n` : '\n') + `]`;
}

export function applyTagGroupsSource(source, groups) {
  const marker = 'export const tagGroups';
  const start = source.indexOf(marker);
  const eq = source.indexOf('=', start);
  const open = source.indexOf('[', eq);
  if (start === -1 || eq === -1 || open === -1) throw new Error('不合法：找不到 tagGroups 数组');
  const close = findMatching(source, open);
  return source.slice(0, open) + serializeTagGroups(groups) + source.slice(close + 1);
}

export function normalizeTagGroups(input) {
  if (!Array.isArray(input)) throw new Error('不合法的分组列表');
  const groups = [];
  const slugs = new Set();
  const tagsSeen = new Set();
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') throw new Error('不合法的分组');
    const slug = String(raw.slug ?? '').trim();
    const title = String(raw.title ?? '').trim();
    const titleEn = String(raw.titleEn ?? '').trim();
    if (!slug || !title || !titleEn) throw new Error('请填写分组的 slug、中文名和英文名');
    if (!SLUG_RE.test(slug) || slug.length > 48 || RESERVED_SLUGS.has(slug)) throw new Error(`不合法的分组 slug：${slug}`);
    if (slugs.has(slug)) throw new Error(`不合法的分组 slug：${slug} 重复了`);
    slugs.add(slug);
    if (title.length > 80 || titleEn.length > 80) throw new Error('分组名太长');
    const tags = [];
    for (const item of Array.isArray(raw.tags) ? raw.tags : []) {
      const tag = String(item ?? '').trim();
      if (!tag) continue;
      if (tag.length > 80) throw new Error(`标签太长：${tag}`);
      if (tagsSeen.has(tag)) throw new Error(`标签重复：${tag}`);
      tagsSeen.add(tag);
      tags.push(tag);
    }
    groups.push({ slug, title, titleEn, tags });
  }
  return groups;
}
