/**
 * Local writing studio — filesystem helpers.
 * Only used by the Vite dev middleware; never imported by the public site.
 */
import { execFile } from 'node:child_process';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { MEDIA_IMPORT, ensureMediaImport } from './blocks.mjs';
import {
  COLLECTIONS,
  LANG_SPLIT,
  addDocRefToRaw as coreAddDocRefToRaw,
  isSafeDocRef,
  isSafeId,
  listDocRefs,
  parseMdx,
  pickFrontmatter,
  publicHref,
  removeDocRefFromRaw,
  serializeMdx,
  slugify,
  todayIso,
} from './core.mjs';

const execFileAsync = promisify(execFile);

export { MEDIA_IMPORT, ensureMediaImport };
export {
  COLLECTIONS,
  LANG_SPLIT,
  isSafeDocRef,
  isSafeId,
  listDocRefs,
  parseMdx,
  pickFrontmatter,
  publicHref,
  removeDocRefFromRaw,
  serializeMdx,
  slugify,
  todayIso,
};
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
    descriptionEn: data.descriptionEn ?? '',
    tags: Array.isArray(data.tags) ? data.tags : [],
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

function childTemplate({ title, date, order, slot }) {
  return serializeMdx({
    frontmatter: {
      slot: slot ?? 'article',
      title,
      description: '草稿摘要，发布前改成可检验的陈述句。',
      date,
      order,
      draft: true,
    },
    imports: '',
    bodyZh: '在这里用 Markdown 写这一页。',
    bodyEn: 'Write this page here.',
  });
}

export function parentIdOf(id) {
  const slash = String(id ?? '').lastIndexOf('/');
  return slash === -1 ? undefined : id.slice(0, slash);
}

export function collectionPane(collection) {
  return collection === 'pages' ? undefined : 'series';
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

  if (kind === 'child') {
    const parentCollection = input.parentCollection || 'articles';
    const parentId = String(input.parentId ?? input.hub ?? '').trim();
    if (parentCollection === 'pages' || !isSafeId(parentCollection, parentId)) {
      throw new Error('请打开一篇可以有子页面的文章');
    }
    const parentFile = resolveDocPath(root, parentCollection, parentId);
    const parentRaw = await readFile(parentFile, 'utf8');
    const next = await nextChildNumber(root, parentCollection, parentId);
    const id = `${parentId}/${next}`;
    if (!isSafeId(parentCollection, id)) {
      throw new Error('子页面路径不合法');
    }
    const file = resolveDocPath(root, parentCollection, id);
    await assertNewFile(file);
    const parent = parseMdx(parentRaw);
    const slot = parent.frontmatter.slot || (parentCollection === 'projects' ? 'project' : 'article');
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, childTemplate({ title, date, order: next, slot }));
    return {
      collection: parentCollection,
      id,
      href: publicHref(parentCollection, id),
      parentId,
    };
  }

  throw new Error(`未知的创建类型：${kind}`);
}

export async function nextChildNumber(root, collection, parentId) {
  const dir = path.join(root, 'src/content', collection, parentId);
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

export function addDocRefToRaw(raw, of, { pane } = {}) {
  if (!isSafeDocRef(of)) throw new Error(`不合法的引用：${of}`);
  const parsed = parseMdx(raw);
  parsed.imports = ensureMediaImport(parsed.imports);
  return coreAddDocRefToRaw(serializeMdx(parsed), of, { pane });
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
