/**
 * Runtime-independent content helpers shared by local and hosted Studio code.
 * This module deliberately has no filesystem, process, or Git dependency.
 */
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

export const COLLECTIONS = new Set(['articles', 'projects', 'pages']);
export const PAGE_CAP = 4;
export const PAGE_ORDER_PATH = 'src/data/page-order.ts';
const DEFAULT_PAGE_RANK = new Map([['about', 0], ['now', 1], ['contact', 2], ['privacy', 3]]);
const PAGE_ORDER_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function defaultPageOrder(pages) {
  return [...pages].sort((a, b) => {
    const rank = (page) => (DEFAULT_PAGE_RANK.has(page.pageId) ? DEFAULT_PAGE_RANK.get(page.pageId) : 100);
    const byRank = rank(a) - rank(b);
    if (byRank !== 0) return byRank;
    return String(a.title || '').localeCompare(String(b.title || ''), 'zh') || String(a.id).localeCompare(String(b.id));
  }).map((page) => page.id);
}

export function pageOrderSource(pageIds) {
  if (!Array.isArray(pageIds) || pageIds.length > PAGE_CAP || new Set(pageIds).size !== pageIds.length || pageIds.some((id) => !PAGE_ORDER_ID.test(id))) {
    throw new Error('导航顺序不合法。');
  }
  const lines = pageIds.map((id) => `  '${id}',`).join('\n');
  return `/** 导航上站点页的顺序。每次审核可以调整，最多 ${PAGE_CAP} 页。 */\nexport const pageOrder = [\n${lines}${lines ? '\n' : ''}] as const;\n`;
}

export function parsePageOrderSource(raw) {
  const text = String(raw ?? '');
  const prefix = `/** 导航上站点页的顺序。每次审核可以调整，最多 ${PAGE_CAP} 页。 */\nexport const pageOrder = [\n`;
  const suffix = '] as const;\n';
  if (!text.startsWith(prefix) || !text.endsWith(suffix)) throw new Error('导航顺序文件无法读取。');
  const body = text.slice(prefix.length, -suffix.length);
  const ids = body ? body.split('\n').filter(Boolean).map((line) => {
    const match = /^ {2}'([a-z0-9]+(?:-[a-z0-9]+)*)',$/.exec(line);
    if (!match) throw new Error('导航顺序文件无法读取。');
    return match[1];
  }) : [];
  if (pageOrderSource(ids) !== text) throw new Error('导航顺序文件无法读取。');
  return ids;
}
export const CORE_PAGE_IDS = new Set(['about', 'now', 'contact', 'privacy']);
export const CORE_PAGE_BY_TITLE = new Map([
  ['关于', 'about'],
  ['Now', 'now'],
  ['now', 'now'],
  ['联系', 'contact'],
  ['隐私', 'privacy'],
]);

export function pageIdFromPath(filePath) {
  const match = /^src\/content\/pages\/([a-z0-9]+(?:-[a-z0-9]+)*)\.mdx$/.exec(filePath || '');
  if (!match || match[1] === 'blogs') return null;
  return match[1];
}

export function corePageIdFromPath(filePath) {
  const id = pageIdFromPath(filePath);
  return id && CORE_PAGE_IDS.has(id) ? id : null;
}

export function pageHref(id) {
  if (id === 'about') return '/';
  if (CORE_PAGE_IDS.has(id)) return `/${id}`;
  return `/pages/${id}`;
}

// At most PAGE_CAP site pages. A title that already owns /, /now, /contact, or /privacy
// keeps that address; another card with the same title gets its own URL.
export function pageReviewNote(id, { displaced = false, canonicalTitle = '', choiceRequired = false } = {}) {
  const href = pageHref(id);
  const rest = '项目、博客和 Reference 随卡片增加，没有上限。';
  const place = displaced
    ? `「${canonicalTitle}」这个地址已经连着另一张卡片，这张新页面会单独出现在 ${href}，不会替换或丢掉原来的页面。`
    : `确认发布后，这张页面出现在 ${href}。`;
  if (choiceRequired) return `站点页面最多显示 ${PAGE_CAP} 页。现在超过 ${PAGE_CAP} 张，请在审核清单里选择留下哪几页。未勾选的不会悄悄去掉。${rest}${place}`;
  return `站点页面最多显示 ${PAGE_CAP} 页。现在不超过 ${PAGE_CAP} 张，全部发布，不需要挑选。${rest}${place}`;
}
export const LANG_SPLIT = '<div data-lang-split></div>';
export const CANONICAL_KEYS = [
  'slot', 'title', 'description', 'date', 'created', 'updated',
  'tags', 'draft', 'heptabaseCardLink', 'heptabaseStatus', 'heptabaseType', 'url', 'language', 'translationOf', 'listed', 'status', 'order', 'stack', 'platforms', 'repo',
  'homepage', 'downloads', 'screenshots', 'demo', 'featured',
];

// A translation from #blogi18n is stored next to its source as <id>/<language>.
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)*(?:\/[a-z]{2,3})?$/;
const DOCREF_RE = /<DocRef\s+of=["']([^"']+)["']\s*\/>/g;
const OF_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)*(?:\/[a-z]{2,3})?$/;

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
  if (collection === 'pages') return id === 'blogs' || ID_RE.test(id);
  return ID_RE.test(id);
}

export function isSafeDocRef(of) {
  if (typeof of !== 'string') return false;
  const match = /^(articles|projects|pages)\/(.+)$/.exec(of.trim());
  if (!match || match[2] === 'blogs') return false;
  return Boolean(OF_RE.test(match[2]) && isSafeId(match[1], match[2]));
}

export function publicHref(collection, id) {
  if (collection === 'pages' && id === 'blogs') return '/blogs';
  if (collection === 'pages') return pageHref(id);
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
    raw: text,
  };
}

function omitEmpty(value, key) {
  if (key === 'description' && value === '') return false;
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
    if (key === 'titleEn' || key === 'descriptionEn') continue;
    if (key in out || CANONICAL_KEYS.includes(key) || omitEmpty(value, key)) continue;
    out[key] = value;
  }
  return out;
}

export function serializeMdx({ frontmatter, imports, bodyZh }) {
  const yaml = stringifyYaml(pickFrontmatter(frontmatter), {
    lineWidth: 0,
    defaultStringType: 'QUOTE_DOUBLE',
    defaultKeyType: 'PLAIN',
  }).trimEnd();
  const importBlock = imports?.trim() ? `${imports.trim()}\n\n` : '';
  const zh = (bodyZh ?? '').trim();
  const body = `${importBlock}${zh ? `${zh}\n` : ''}`;
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
  return serializeMdx(parsed);
}

export function removeDocRefFromRaw(raw, of) {
  const parsed = parseMdx(raw);
  const strip = (section) => section
    .replace(new RegExp(`\\n?\\s*<DocRef\\s+of=["']${of}["']\\s*\\/>\\s*`, 'g'), '\n')
    .replace(/<DocList(?:\s+pane="series")?>\s*<\/DocList>/g, '')
    .trim();
  parsed.bodyZh = strip(parsed.bodyZh);
  return serializeMdx(parsed);
}

export function createArticleRaw({ title, date = todayIso() }) {
  return serializeMdx({
    frontmatter: { slot: 'article', title, description: '草稿摘要，发布前改成可检验的陈述句。', date, draft: true },
    imports: '', bodyZh: '在这里用 Markdown 写正文。',
  });
}

export function createProjectRaw({ title }) {
  return serializeMdx({
    frontmatter: { slot: 'project', title, description: '草稿摘要，发布前改成可检验的陈述句。', draft: true, status: 'wip' },
    imports: '', bodyZh: '在这里用 Markdown 写项目说明。',
  });
}

export function createChildRaw({ title, date = todayIso(), order, slot = 'article' }) {
  return serializeMdx({
    frontmatter: { slot, title, description: '草稿摘要，发布前改成可检验的陈述句。', date, order, draft: true },
    imports: '', bodyZh: '在这里用 Markdown 写这一页。',
  });
}

export function validateContentFile(filePath, raw) {
  const parsed = parseMdx(raw);
  if (filePath === 'src/data/tag-groups.ts') return parsed;
  const fm = parsed.frontmatter;
  if (!fm || typeof fm !== 'object') throw new Error(`frontmatter 无法解析：${filePath}`);
  if (filePath === 'src/content/pages/blogs.mdx') return parsed;
  if (!/^heptabase:\/\/card\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(fm.heptabaseCardLink || '')) {
    throw new Error(`请先填写有效的 Heptabase card link：${filePath}`);
  }
  if (pageIdFromPath(filePath)) {
    if (fm.slot !== 'page') throw new Error(`slot 必须是 page：${filePath}`);
    if (!String(fm.title ?? '').trim()) throw new Error(`缺少 title：${filePath}`);
    if (fm.description != null && typeof fm.description !== 'string') throw new Error(`description 无法读取：${filePath}`);
    return parsed;
  }
  if (!['article', 'project'].includes(fm.slot)) throw new Error(`slot 必须是 article 或 project：${filePath}`);
  if (!String(fm.title ?? '').trim()) throw new Error(`缺少 title：${filePath}`);
  if (fm.description != null && typeof fm.description !== 'string') throw new Error(`description 无法读取：${filePath}`);
  if (fm.slot === 'article' && !fm.date) throw new Error(`文章缺少 date：${filePath}`);
  for (const ref of listDocRefs(raw)) {
    if (!isSafeDocRef(ref)) throw new Error(`引用路径不合法：${ref}`);
  }
  return parsed;
}
