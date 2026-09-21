/**
 * Studio helpers for src/data/tag-groups.ts — the site tag taxonomy.
 * Does not rewrite article frontmatter.
 */
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

export const TAG_GROUPS_REL = 'src/data/tag-groups.ts';
export const RESERVED_SLUGS = new Set(['all', 'other']);
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function tagGroupsFile(root) {
  return path.join(root, TAG_GROUPS_REL);
}

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
    if (ch === '\\') {
      out += src[i + 1] ?? '';
      i += 2;
      continue;
    }
    if (ch === q) return { value: out, next: i + 1 };
    out += ch;
    i += 1;
  }
  throw new Error('不合法：字符串未闭合');
}

function skipString(src, i) {
  const parsed = parseQuoted(src, i);
  return parsed ? parsed.next : i + 1;
}

export function findMatching(src, openIndex, openCh = '[', closeCh = ']') {
  let depth = 0;
  for (let i = openIndex; i < src.length; i += 1) {
    const ch = src[i];
    if (ch === '"' || ch === "'") {
      i = skipString(src, i) - 1;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      i = nl === -1 ? src.length : nl;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 1;
      continue;
    }
    if (ch === openCh) depth += 1;
    else if (ch === closeCh) {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  throw new Error('不合法：找不到闭合的 tagGroups 数组');
}

function parseStringList(inner) {
  const out = [];
  let i = 0;
  while (i < inner.length) {
    i = skipWs(inner, i);
    if (i >= inner.length) break;
    if (inner[i] === ',') {
      i += 1;
      continue;
    }
    const parsed = parseQuoted(inner, i);
    if (!parsed) {
      i += 1;
      continue;
    }
    const value = parsed.value.trim();
    if (value) out.push(value);
    i = parsed.next;
  }
  return out;
}

function pickProp(objSrc, key) {
  const re = new RegExp(`(?:^|[,{\\s])${key}\\s*:`);
  const match = re.exec(objSrc);
  if (!match) return '';
  let i = skipWs(objSrc, match.index + match[0].length);
  const parsed = parseQuoted(objSrc, i);
  return parsed ? parsed.value : '';
}

function pickTags(objSrc) {
  const match = /(?:^|[,{\s])tags\s*:/.exec(objSrc);
  if (!match) return [];
  const open = objSrc.indexOf('[', match.index + match[0].length - 1);
  if (open === -1) return [];
  const close = findMatching(objSrc, open, '[', ']');
  return parseStringList(objSrc.slice(open + 1, close));
}

function parseGroupObject(objSrc) {
  return {
    slug: pickProp(objSrc, 'slug').trim(),
    title: pickProp(objSrc, 'title').trim(),
    tags: pickTags(objSrc),
  };
}

export function parseTagGroupsSource(source) {
  const marker = 'export const tagGroups';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('不合法：找不到 tagGroups 导出');
  const eq = source.indexOf('=', start);
  const open = source.indexOf('[', eq);
  if (eq === -1 || open === -1) throw new Error('不合法：找不到 tagGroups 数组');
  const close = findMatching(source, open, '[', ']');
  const body = source.slice(open + 1, close);
  const groups = [];
  let i = 0;
  while (i < body.length) {
    i = skipWs(body, i);
    if (i >= body.length) break;
    if (body[i] === ',') {
      i += 1;
      continue;
    }
    if (body[i] === '{') {
      const end = findMatching(body, i, '{', '}');
      groups.push(parseGroupObject(body.slice(i, end + 1)));
      i = end + 1;
      continue;
    }
    i += 1;
  }
  return groups;
}

export function serializeTagGroups(groups) {
  if (!groups.length) return '[\n]';
  const blocks = groups.map((group) => {
    const tags = group.tags.map((tag) => JSON.stringify(tag)).join(', ');
    return `  {\n    slug: ${JSON.stringify(group.slug)},\n    title: ${JSON.stringify(group.title)},\n    tags: [${tags}],\n  }`;
  });
  return `[\n${blocks.join(',\n')},\n]`;
}

export function applyTagGroupsSource(source, groups) {
  const marker = 'export const tagGroups';
  const start = source.indexOf(marker);
  if (start === -1) throw new Error('不合法：找不到 tagGroups 导出');
  const eq = source.indexOf('=', start);
  const open = source.indexOf('[', eq);
  if (eq === -1 || open === -1) throw new Error('不合法：找不到 tagGroups 数组');
  const close = findMatching(source, open, '[', ']');
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
    if (!slug || !title) throw new Error('请填写分组的 slug 和名称');
    if (!SLUG_RE.test(slug) || slug.length > 48) throw new Error(`不合法的分组 slug：${slug}`);
    if (RESERVED_SLUGS.has(slug)) throw new Error(`不合法的分组 slug：${slug}（all / other 是保留名）`);
    if (slugs.has(slug)) throw new Error(`不合法的分组 slug：${slug} 重复了`);
    slugs.add(slug);
    if (title.length > 80) throw new Error('分组名太长');
    const tags = [];
    const list = Array.isArray(raw.tags) ? raw.tags : [];
    for (const item of list) {
      const tag = String(item ?? '').trim();
      if (!tag) continue;
      if (tag.length > 80) throw new Error(`标签太长：${tag}`);
      if (tagsSeen.has(tag)) throw new Error(`标签重复：${tag}`);
      tagsSeen.add(tag);
      tags.push(tag);
    }
    groups.push({ slug, title, tags });
  }
  return groups;
}

function tagsFromMdx(raw) {
  const split = /^---\n([\s\S]*?)\n---/.exec(String(raw ?? ''));
  if (!split) return [];
  let data;
  try {
    data = parseYaml(split[1]);
  } catch {
    return [];
  }
  if (!data || !Array.isArray(data.tags)) return [];
  return data.tags.map((tag) => String(tag ?? '').trim()).filter(Boolean);
}

async function walkMdx(dir) {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walkMdx(full)));
    else if (entry.isFile() && entry.name.endsWith('.mdx')) out.push(full);
  }
  return out;
}

export async function collectUsedTags(root) {
  const files = [
    ...(await walkMdx(path.join(root, 'src/content/articles'))),
    ...(await walkMdx(path.join(root, 'src/content/projects'))),
  ];
  const counts = new Map();
  for (const file of files) {
    const tags = tagsFromMdx(await readFile(file, 'utf8'));
    const seen = new Set();
    for (const tag of tags) {
      if (seen.has(tag)) continue;
      seen.add(tag);
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

function taxonomyPayload(groups, usedCounts) {
  const assigned = new Set();
  for (const group of groups) {
    for (const tag of group.tags) assigned.add(tag);
  }
  const used = Object.fromEntries(usedCounts);
  const ungrouped = [...usedCounts.keys()]
    .filter((tag) => !assigned.has(tag))
    .sort((a, b) => a.localeCompare(b, 'zh-CN'));
  return { groups, ungrouped, used };
}

export async function readTagTaxonomy(root) {
  const source = await readFile(tagGroupsFile(root), 'utf8');
  const groups = parseTagGroupsSource(source);
  const usedCounts = await collectUsedTags(root);
  return taxonomyPayload(groups, usedCounts);
}

export async function saveTagGroups(root, input) {
  const groups = normalizeTagGroups(input);
  const file = tagGroupsFile(root);
  const source = await readFile(file, 'utf8');
  const next = applyTagGroupsSource(source, groups);
  await writeFile(file, next.endsWith('\n') ? next : `${next}\n`);
  const usedCounts = await collectUsedTags(root);
  return taxonomyPayload(groups, usedCounts);
}
