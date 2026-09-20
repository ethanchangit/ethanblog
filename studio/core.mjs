/**
 * Runtime-independent content helpers shared by local and hosted Studio code.
 * This module deliberately has no filesystem, process, or Git dependency.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const COLLECTIONS = new Set(['articles', 'projects', 'pages']);
export const LANG_SPLIT = '<div data-lang-split></div>';
export const CANONICAL_KEYS = [
  'slot', 'title', 'titleEn', 'description', 'descriptionEn', 'date', 'updated',
  'tags', 'draft', 'listed', 'status', 'order', 'stack', 'platforms', 'repo',
  'homepage', 'downloads', 'screenshots', 'demo', 'featured',
];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)*$/;
const DOCREF_RE = /<DocRef\s+of=["']([^"']+)["']\s*\/>/g;
const OF_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)*$/;

export function todayIso(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function slugify(input, fallbackDate = new Date()) {
  const ascii = String(input ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return ascii || `draft-${todayIso(fallbackDate)}`;
}

export function isSafeId(collection, id) {
  if (!COLLECTIONS.has(collection)) return false;
  if (typeof id !== 'string' || id.length === 0 || id.length > 120) return false;
  if (collection === 'pages') return id === 'blogs';
  return ID_RE.test(id);
}

export function isSafeDocRef(of) {
  if (typeof of !== 'string') return false;
  const match = /^(articles|projects)\/(.+)$/.exec(of.trim());
  return Boolean(match && OF_RE.test(match[2]) && isSafeId(match[1], match[2]));
}

export function publicHref(collection, id) {
  if (collection === 'pages' && id === 'blogs') return '/blogs';
  if (collection === 'projects') return `/projects/${id}`;
  return `/articles/${id}`;
}

export function parseMdx(raw) {
  const text = String(raw ?? '');
  const split = /^---\n([\s\S]*?)\n---\n?/.exec(text);
  let frontmatter = {};
  let body = text;
  if (split) {
    frontmatter = parseYaml(split[1]) ?? {};
    if (!frontmatter || typeof frontmatter !== 'object' || Array.isArray(frontmatter)) frontmatter = {};
    body = text.slice(split[0].length);
  }
  const lines = body.split('\n');
  const importLines = [];
  let i = 0;
  while (i < lines.length && (lines[i].trim() === '' || /^\s*import\s/.test(lines[i]))) {
    if (/^\s*import\s/.test(lines[i])) importLines.push(lines[i].trim());
    i += 1;
  }
  const parts = lines.slice(i).join('\n').split(/<div\s+data-lang-split\b[^>]*>(?:\s*<\/div>)?/);
  return {
    frontmatter,
    imports: importLines.join('\n'),
    bodyZh: (parts[0] ?? '').trim(),
    bodyEn: (parts.slice(1).join(LANG_SPLIT) ?? '').trim(),
    raw: text,
  };
}

function omitEmpty(value, key) {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (key === 'draft' && value === false) return true;
  if (key === 'featured' && value === false) return true;
  return false;
}

export function pickFrontmatter(data) {
  const src = data && typeof data === 'object' ? data : {};
  const out = {};
  for (const key of CANONICAL_KEYS) {
    if (!omitEmpty(src[key], key)) out[key] = src[key];
  }
  for (const [key, value] of Object.entries(src)) {
    if (key in out || CANONICAL_KEYS.includes(key) || omitEmpty(value, key)) continue;
    out[key] = value;
  }
  return out;
}

export function serializeMdx({ frontmatter, imports, bodyZh, bodyEn }) {
  const yaml = stringifyYaml(pickFrontmatter(frontmatter), {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  }).trimEnd();
  const importBlock = imports?.trim() ? `${imports.trim()}\n\n` : '';
  const zh = (bodyZh ?? '').trim();
  const en = (bodyEn ?? '').trim();
  const body = en
    ? `${importBlock}${zh}\n\n${LANG_SPLIT}\n\n${en}\n`
    : `${importBlock}${zh ? `${zh}\n` : ''}`;
  return `---\n${yaml}\n---\n\n${body}`;
}

export function listDocRefs(raw) {
  const refs = [];
  const seen = new Set();
  for (const match of String(raw ?? '').matchAll(DOCREF_RE)) {
    if (!seen.has(match[1])) {
      seen.add(match[1]);
      refs.push(match[1]);
    }
  }
  return refs;
}

function insertRefInSection(section, of, pane) {
  if (new RegExp(`<DocRef\\s+of=["']${of}["']`).test(section)) return section;
  const refLine = `  <DocRef of="${of}" />`;
  const close = section.lastIndexOf('</DocList>');
  if (close !== -1) {
    const before = section.slice(0, close).trimEnd();
    return `${before}\n${refLine}\n${section.slice(close)}`;
  }
  const open = pane === 'series' ? '<DocList pane="series">' : '<DocList>';
  return `${section.trimEnd()}\n\n${open}\n${refLine}\n</DocList>`;
}

export function addDocRefToRaw(raw, of, { pane } = {}) {
  if (!isSafeDocRef(of)) throw new Error(`不合法的引用：${of}`);
  const parsed = parseMdx(raw);
  parsed.bodyZh = insertRefInSection(parsed.bodyZh, of, pane);
  if (parsed.bodyEn) parsed.bodyEn = insertRefInSection(parsed.bodyEn, of, pane);
  return serializeMdx(parsed);
}

export function removeDocRefFromRaw(raw, of) {
  const parsed = parseMdx(raw);
  const strip = (section) => section
    .replace(new RegExp(`\\n?\\s*<DocRef\\s+of=["']${of}["']\\s*\\/>\\s*`, 'g'), '\n')
    .replace(/<DocList(?:\s+pane="series")?>\s*<\/DocList>/g, '')
    .trim();
  parsed.bodyZh = strip(parsed.bodyZh);
  if (parsed.bodyEn) parsed.bodyEn = strip(parsed.bodyEn);
  return serializeMdx(parsed);
}

export function createArticleRaw({ title, date = todayIso() }) {
  return serializeMdx({
    frontmatter: { slot: 'article', title, description: '草稿摘要，发布前改成可检验的陈述句。', date, draft: true },
    imports: '', bodyZh: '在这里用 Markdown 写中文正文。', bodyEn: 'Write the English copy here.',
  });
}

export function createProjectRaw({ title }) {
  return serializeMdx({
    frontmatter: { slot: 'project', title, description: '草稿摘要，发布前改成可检验的陈述句。', draft: true, status: 'wip' },
    imports: '', bodyZh: '在这里用 Markdown 写项目说明。', bodyEn: 'Write the project notes here.',
  });
}

export function createChildRaw({ title, date = todayIso(), order, slot = 'article' }) {
  return serializeMdx({
    frontmatter: { slot, title, description: '草稿摘要，发布前改成可检验的陈述句。', date, order, draft: true },
    imports: '', bodyZh: '在这里用 Markdown 写这一页。', bodyEn: 'Write this page here.',
  });
}

export function validateContentFile(filePath, raw) {
  const parsed = parseMdx(raw);
  if (filePath === 'src/data/tag-groups.ts') return parsed;
  const fm = parsed.frontmatter;
  if (!fm || typeof fm !== 'object') throw new Error(`frontmatter 无法解析：${filePath}`);
  if (!['article', 'project'].includes(fm.slot)) throw new Error(`slot 必须是 article 或 project：${filePath}`);
  if (!String(fm.title ?? '').trim()) throw new Error(`缺少 title：${filePath}`);
  if (!String(fm.description ?? '').trim()) throw new Error(`缺少 description：${filePath}`);
  if (fm.slot === 'article' && !fm.date) throw new Error(`文章缺少 date：${filePath}`);
  if (!fm.draft) {
    if (!String(fm.titleEn ?? '').trim() || !String(fm.descriptionEn ?? '').trim()) {
      throw new Error(`定稿缺少英文标题或摘要：${filePath}`);
    }
    if (!parsed.bodyEn) throw new Error(`定稿缺少 lang split 后的英文正文：${filePath}`);
  }
  for (const ref of listDocRefs(raw)) {
    if (!isSafeDocRef(ref)) throw new Error(`引用路径不合法：${ref}`);
  }
  return parsed;
}
