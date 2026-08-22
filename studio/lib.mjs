/**
 * Local writing studio — filesystem helpers.
 * Only used by the Vite dev middleware; never imported by the public site.
 */
import { execFile } from 'node:child_process';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const execFileAsync = promisify(execFile);

export const COLLECTIONS = new Set(['articles', 'projects', 'pages']);
export const MEDIA_IMPORT = "import { DocList, DocRef } from '@/components/media';";
export const LANG_SPLIT = '<div data-lang-split></div>';

const CANONICAL_KEYS = [
  'slot',
  'title',
  'titleEn',
  'description',
  'descriptionEn',
  'date',
  'updated',
  'tags',
  'draft',
  'listed',
  'status',
  'order',
  'stack',
  'platforms',
  'repo',
  'homepage',
  'downloads',
  'screenshots',
  'demo',
  'featured',
];

const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)?$/;
const DOCREF_RE = /<DocRef\s+of=["']([^"']+)["']\s*\/>/g;
const OF_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)?$/;

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
  if (ascii) return ascii;
  return `draft-${todayIso(fallbackDate)}`;
}

export function isSafeId(collection, id) {
  if (!COLLECTIONS.has(collection)) return false;
  if (typeof id !== 'string' || id.length === 0 || id.length > 120) return false;
  if (id.includes('..') || id.includes('\\') || path.isAbsolute(id)) return false;
  if (collection === 'pages') return id === 'blogs';
  return ID_RE.test(id);
}

export function isSafeDocRef(of) {
  if (typeof of !== 'string') return false;
  const match = /^(articles|projects)\/(.+)$/.exec(of.trim());
  if (!match) return false;
  return OF_RE.test(match[2]) && isSafeId(match[1], match[2]);
}

export function resolveDocPath(root, collection, id) {
  if (!isSafeId(collection, id)) {
    throw new Error(`不合法的文档 id：${collection}/${id}`);
  }
  const base = path.resolve(root, 'src/content', collection);
  const file = path.resolve(base, `${id}.mdx`);
  const rel = path.relative(base, file);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error('路径越界');
  }
  return file;
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
    if (frontmatter && typeof frontmatter !== 'object') frontmatter = {};
    body = text.slice(split[0].length);
  }
  const lines = body.split('\n');
  const importLines = [];
  let i = 0;
  while (i < lines.length && (lines[i].trim() === '' || /^\s*import\s/.test(lines[i]))) {
    if (/^\s*import\s/.test(lines[i])) importLines.push(lines[i].trim());
    i += 1;
  }
  const rest = lines.slice(i).join('\n');
  const parts = rest.split(/<div\s+data-lang-split\b[^>]*>(?:\s*<\/div>)?/);
  return {
    frontmatter,
    imports: importLines.join('\n'),
    bodyZh: (parts[0] ?? '').trim(),
    bodyEn: (parts.slice(1).join(LANG_SPLIT) ?? '').trim(),
    raw: text,
  };
}

function omitEmpty(value, key) {
  if (value === undefined || value === null) return true;
  if (value === '') return true;
  if (Array.isArray(value) && value.length === 0) return true;
  if (key === 'draft' && value === false) return true;
  if (key === 'featured' && value === false) return true;
  return false;
}

export function pickFrontmatter(data) {
  const src = data && typeof data === 'object' ? data : {};
  const out = {};
  for (const key of CANONICAL_KEYS) {
    if (omitEmpty(src[key], key)) continue;
    out[key] = src[key];
  }
  for (const [key, value] of Object.entries(src)) {
    if (key in out) continue;
    if (CANONICAL_KEYS.includes(key)) continue;
    if (omitEmpty(value, key)) continue;
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

async function walkMdx(dir, prefix = '') {
  let entries = [];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err && err.code === 'ENOENT') return [];
    throw err;
  }
  const out = [];
  for (const entry of entries) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walkMdx(full, rel)));
    } else if (entry.isFile() && entry.name.endsWith('.mdx')) {
      out.push({ id: rel.replace(/\.mdx$/, ''), file: full });
    }
  }
  return out;
}

function summarize(collection, id, parsed, file) {
  const data = parsed.frontmatter ?? {};
  return {
    collection,
    id,
    file,
    title: data.title ?? id,
    titleEn: data.titleEn ?? '',
    description: data.description ?? '',
    draft: Boolean(data.draft),
    listed: data.listed,
    date: data.date ? String(data.date).slice(0, 10) : '',
    slot: data.slot ?? (collection === 'projects' ? 'project' : collection === 'articles' ? 'article' : undefined),
    href: publicHref(collection, id),
    series: id.includes('/'),
  };
}

export async function listDocs(root) {
  const [articleFiles, projectFiles] = await Promise.all([
    walkMdx(path.join(root, 'src/content/articles')),
    walkMdx(path.join(root, 'src/content/projects')),
  ]);
  const articles = [];
  for (const item of articleFiles) {
    const raw = await readFile(item.file, 'utf8');
    articles.push(summarize('articles', item.id, parseMdx(raw), item.file));
  }
  const projects = [];
  for (const item of projectFiles) {
    const raw = await readFile(item.file, 'utf8');
    projects.push(summarize('projects', item.id, parseMdx(raw), item.file));
  }
  articles.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
  projects.sort((a, b) => a.id.localeCompare(b.id));

  let blogs = null;
  try {
    const blogsPath = resolveDocPath(root, 'pages', 'blogs');
    const raw = await readFile(blogsPath, 'utf8');
    blogs = summarize('pages', 'blogs', parseMdx(raw), blogsPath);
  } catch {
    blogs = null;
  }

  return {
    articles,
    projects,
    pages: blogs ? [blogs] : [],
    blogsRefs: blogs ? listDocRefs(await readFile(resolveDocPath(root, 'pages', 'blogs'), 'utf8')) : [],
  };
}

export async function readDoc(root, collection, id) {
  const file = resolveDocPath(root, collection, id);
  const raw = await readFile(file, 'utf8');
  const parsed = parseMdx(raw);
  return {
    collection,
    id,
    file,
    href: publicHref(collection, id),
    ...parsed,
  };
}

export async function saveDoc(root, payload) {
  const collection = payload.collection;
  const id = payload.id;
  const file = resolveDocPath(root, collection, id);
  const raw =
    typeof payload.raw === 'string' && payload.sourceMode
      ? payload.raw
      : serializeMdx({
          frontmatter: payload.frontmatter ?? {},
          imports: payload.imports ?? '',
          bodyZh: payload.bodyZh ?? '',
          bodyEn: payload.bodyEn ?? '',
        });
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, raw.endsWith('\n') ? raw : `${raw}\n`);
  return readDoc(root, collection, id);
}

function articleTemplate({ title, date }) {
  return serializeMdx({
    frontmatter: {
      slot: 'article',
      title,
      description: '草稿摘要，发布前改成可检验的陈述句。',
      date,
      draft: true,
    },
    imports: '',
    bodyZh: '在这里用 Markdown 写中文正文。',
    bodyEn: 'Write the English copy here.',
  });
}

function projectTemplate({ title }) {
  return serializeMdx({
    frontmatter: {
      slot: 'project',
      title,
      description: '草稿摘要，发布前改成可检验的陈述句。',
      draft: true,
      status: 'wip',
    },
    imports: '',
    bodyZh: '在这里用 Markdown 写项目说明。',
    bodyEn: 'Write the project notes here.',
  });
}

function seriesHubTemplate({ title, slug, date }) {
  const of = `articles/${slug}/1`;
  const list = `<DocList pane="series">\n  <DocRef of="${of}" />\n</DocList>`;
  return serializeMdx({
    frontmatter: {
      slot: 'article',
      title,
      description: '草稿摘要，发布前改成可检验的陈述句。',
      date,
      draft: true,
    },
    imports: MEDIA_IMPORT,
    bodyZh: `这是系列总览。子文写在 \`${slug}/<n>.mdx\`，默认不进 /articles。\n\n${list}`,
    bodyEn: `This is the series hub. Chapters live in \`${slug}/<n>.mdx\` and stay off /articles by default.\n\n${list}`,
  });
}

function seriesChapterTemplate({ title, date, order }) {
  return serializeMdx({
    frontmatter: {
      slot: 'article',
      title,
      description: '草稿摘要，发布前改成可检验的陈述句。',
      date,
      order,
      draft: true,
    },
    imports: '',
    bodyZh: '在这里写这一页。',
    bodyEn: 'Write this chapter here.',
  });
}

async function assertNewFile(file) {
  try {
    await readFile(file);
    throw new Error(`文件已存在：${file}`);
  } catch (err) {
    if (err && err.code === 'ENOENT') return;
    throw err;
  }
}

export async function createDoc(root, input) {
  const kind = input.kind;
  const title = String(input.title ?? '').trim();
  if (!title) throw new Error('请填写标题');
  const date = input.date || todayIso();

  if (kind === 'article' || kind === 'project') {
    const collection = kind === 'project' ? 'projects' : 'articles';
    const slug = String(input.slug ?? slugify(title)).trim();
    if (!isSafeId(collection, slug) || slug.includes('/')) {
      throw new Error('slug 只能用小写字母、数字和连字符');
    }
    const file = resolveDocPath(root, collection, slug);
    await assertNewFile(file);
    const raw = kind === 'project' ? projectTemplate({ title }) : articleTemplate({ title, date });
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, raw);
    return { collection, id: slug, href: publicHref(collection, slug) };
  }

  if (kind === 'series') {
    const slug = String(input.slug ?? slugify(title)).trim();
    if (!isSafeId('articles', slug) || slug.includes('/')) {
      throw new Error('系列 slug 只能用小写字母、数字和连字符');
    }
    const hubFile = resolveDocPath(root, 'articles', slug);
    const chapterFile = resolveDocPath(root, 'articles', `${slug}/1`);
    await assertNewFile(hubFile);
    await assertNewFile(chapterFile);
    await mkdir(path.dirname(chapterFile), { recursive: true });
    await writeFile(hubFile, seriesHubTemplate({ title, slug, date }));
    await writeFile(
      chapterFile,
      seriesChapterTemplate({ title: `${title} · 第 1 页`, date, order: 1 }),
    );
    return { collection: 'articles', id: slug, href: publicHref('articles', slug), chapterId: `${slug}/1` };
  }

  if (kind === 'chapter') {
    const hub = String(input.hub ?? '').trim();
    if (!isSafeId('articles', hub) || hub.includes('/')) {
      throw new Error('请选择合法的系列总览');
    }
    const hubFile = resolveDocPath(root, 'articles', hub);
    const hubRaw = await readFile(hubFile, 'utf8');
    const next = await nextChapterNumber(root, hub);
    const id = `${hub}/${next}`;
    const file = resolveDocPath(root, 'articles', id);
    await assertNewFile(file);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(
      file,
      seriesChapterTemplate({ title: `${title} · 第 ${next} 页`, date, order: next }),
    );
    const updated = addDocRefToRaw(hubRaw, `articles/${id}`, { pane: 'series' });
    await writeFile(hubFile, updated);
    return { collection: 'articles', id, href: publicHref('articles', id), hub };
  }

  throw new Error(`未知的创建类型：${kind}`);
}

export async function nextChapterNumber(root, hub) {
  const dir = path.join(root, 'src/content/articles', hub);
  let names = [];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (err && err.code === 'ENOENT') return 1;
    throw err;
  }
  let max = 0;
  for (const name of names) {
    const match = /^(\d+)\.mdx$/.exec(name);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max + 1;
}

export function listDocRefs(raw) {
  const refs = [];
  const seen = new Set();
  const text = String(raw ?? '');
  for (const match of text.matchAll(DOCREF_RE)) {
    const of = match[1];
    if (!seen.has(of)) {
      seen.add(of);
      refs.push(of);
    }
  }
  return refs;
}

export function ensureMediaImport(imports) {
  const lines = String(imports ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const fromMedia = lines.find((line) => line.includes("@/components/media"));
  if (!fromMedia) return [MEDIA_IMPORT, ...lines].join('\n');
  const names = new Set();
  const named = /import\s*\{([^}]+)\}\s*from\s*['"]@\/components\/media['"]/.exec(fromMedia);
  if (named) {
    for (const part of named[1].split(',')) names.add(part.trim());
  }
  names.add('DocList');
  names.add('DocRef');
  const merged = `import { ${[...names].join(', ')} } from '@/components/media';`;
  return lines.map((line) => (line === fromMedia ? merged : line)).join('\n');
}

function insertRefInSection(section, of, pane) {
  if (new RegExp(`<DocRef\\s+of=["']${of}["']`).test(section)) return section;
  const refLine = `  <DocRef of="${of}" />`;
  const close = section.lastIndexOf('</DocList>');
  if (close !== -1) {
    const before = section.slice(0, close).trimEnd();
    const after = section.slice(close);
    return `${before}\n${refLine}\n${after}`;
  }
  const open = pane === 'series' ? '<DocList pane="series">' : '<DocList>';
  const block = `\n\n${open}\n${refLine}\n</DocList>`;
  return `${section.trimEnd()}${block}`;
}

export function addDocRefToRaw(raw, of, { pane } = {}) {
  if (!isSafeDocRef(of)) throw new Error(`不合法的引用：${of}`);
  const parsed = parseMdx(raw);
  parsed.imports = ensureMediaImport(parsed.imports);
  parsed.bodyZh = insertRefInSection(parsed.bodyZh, of, pane);
  if (parsed.bodyEn) parsed.bodyEn = insertRefInSection(parsed.bodyEn, of, pane);
  return serializeMdx(parsed);
}

export function removeDocRefFromRaw(raw, of) {
  const parsed = parseMdx(raw);
  const strip = (section) =>
    section
      .replace(new RegExp(`\\n?\\s*<DocRef\\s+of=["']${of}["']\\s*/>\\s*`, 'g'), '\n')
      .replace(/<DocList(?:\s+pane="series")?>\s*<\/DocList>/g, '')
      .trim();
  parsed.bodyZh = strip(parsed.bodyZh);
  if (parsed.bodyEn) parsed.bodyEn = strip(parsed.bodyEn);
  return serializeMdx(parsed);
}

export async function setBlogsRef(root, of, present) {
  if (!isSafeDocRef(of)) throw new Error(`不合法的引用：${of}`);
  const file = resolveDocPath(root, 'pages', 'blogs');
  const raw = await readFile(file, 'utf8');
  const next = present ? addDocRefToRaw(raw, of) : removeDocRefFromRaw(raw, of);
  await writeFile(file, next.endsWith('\n') ? next : `${next}\n`);
  return listDocRefs(next);
}

export async function addDocRefToDoc(root, collection, id, of, opts = {}) {
  const file = resolveDocPath(root, collection, id);
  const raw = await readFile(file, 'utf8');
  const next = addDocRefToRaw(raw, of, { pane: opts.pane });
  await writeFile(file, next.endsWith('\n') ? next : `${next}\n`);
  return readDoc(root, collection, id);
}

async function runGit(cwd, args) {
  const { stdout, stderr } = await execFileAsync('git', args, { cwd, encoding: 'utf8' });
  return { stdout: stdout ?? '', stderr: stderr ?? '' };
}

export async function gitStatus(cwd) {
  let branch = 'HEAD';
  try {
    branch = (await runGit(cwd, ['symbolic-ref', '--quiet', '--short', 'HEAD'])).stdout.trim() || 'HEAD';
  } catch {
    try {
      branch = (await runGit(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])).stdout.trim();
    } catch {
      branch = '(no commits)';
    }
  }
  const porcelain = (await runGit(cwd, ['status', '--porcelain', '--', 'src/content'])).stdout;
  const files = porcelain
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => ({
      code: line.slice(0, 2).trim(),
      path: line.slice(3),
    }));
  return { branch, files, dirty: files.length > 0 };
}

export async function gitCommit(cwd, message) {
  const msg = String(message ?? '').trim();
  if (!msg) throw new Error('请填写提交说明');
  if (msg.startsWith('-')) throw new Error('提交说明不能以 - 开头');
  await runGit(cwd, ['add', '--', 'src/content']);
  const status = await gitStatus(cwd);
  if (!status.dirty) throw new Error('内容目录没有可提交的改动');
  await runGit(cwd, ['commit', '-m', msg]);
  return gitStatus(cwd);
}

export async function gitPush(cwd) {
  await runGit(cwd, ['push', '-u', 'origin', 'HEAD']);
  return gitStatus(cwd);
}

export function isLocalHost(hostHeader) {
  const hostname = String(hostHeader ?? '')
    .replace(/^\[/, '')
    .replace(/\]:\d+$/, '')
    .replace(/:\d+$/, '')
    .replace(/\]$/, '');
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '';
}
