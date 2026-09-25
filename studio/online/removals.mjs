import { parseMdx, serializeMdx } from '../core.mjs';
import { blogReferences, proseParts } from './card-content.mjs';
import { propertiesFromRead } from './card-properties.mjs';
import { fail } from './auth.mjs';

export const BLOG_INDEX = 'src/content/pages/blogs.mdx';
export const removalReasons = {
  untagged: '已移出 #blog',
  deleted: 'Heptabase 卡片已删除',
  capped: '超过站点页面上限，这次不留在网站上',
};

// Blogs, projects, Reference cards, and the four core pages stay only while the card is in #blog.

// A missing item in a list alone is never sufficient evidence of deletion.
export async function removalReason(client, id, schema, blogIds) {
  if (blogIds.has(id)) return null;
  let result;
  try { result = await client.call('read_object', { objectType: 'card', objectId: id, offset: 0, limit: 1 }); }
  catch (error) { if (error.heptabaseReason === 'objectNotFound') return 'deleted'; throw error; }
  if (!new RegExp(`^card ".*" \\[${id}\\]`, 'i').test(result.content || '')) throw fail('无法确认卡片是否已移除，未安排删除。', 502);
  if (propertiesFromRead(result.content, schema).member) throw fail('Heptabase 列表与卡片属性不一致，请重新拉取。', 409);
  return 'untagged';
}

function resolvePublicSlug(slug, files) {
  if (!files) return [`src/content/articles/${slug}.mdx`];
  const present = ['articles', 'projects', 'pages'].map(collection => `src/content/${collection}/${slug}.mdx`).filter(path => files.has(path));
  if (present.length) return present;
  const byUrl = [];
  for (const [path, raw] of files) {
    if (!/^src\/content\/(articles|projects)\//.test(path)) continue;
    const url = parseMdx(raw).frontmatter?.url;
    if (typeof url === 'string' && url === slug) byUrl.push(path);
  }
  return byUrl;
}

export function linkedPaths(raw, files = null) {
  const body = parseMdx(raw).bodyZh, refs = new Set(), slugs = new Set();
  const contentLink = /(?:\]\(<?|\bhref=["'])(?:https:\/\/(?:cn\.)?ethanchang\.io)?\/(?:(articles|projects|pages)\/([a-z0-9-]+(?:\/\d+)*)|([a-z0-9]+(?:-[a-z0-9]+)*(?:\/\d+)*))(?=[#?"')>\s]|$)/g;
  for (const ref of blogReferences(body)) refs.add(ref);
  proseParts(body, text => {
    for (const match of text.matchAll(contentLink)) {
      if (match[3]) slugs.add(match[3]);
      else refs.add(`${match[1]}/${match[2]}`);
    }
    return text;
  });
  const paths = new Set([...refs].filter(ref => /^(articles|projects|pages)\//.test(ref)).map(ref => `src/content/${ref}.mdx`));
  for (const slug of slugs) for (const path of resolvePublicSlug(slug, files)) paths.add(path);
  return [...paths];
}

export function withoutIndexRefs(raw, paths) {
  const removed = new Set(paths.map(path => path.replace(/^src\/content\//, '').replace(/\.mdx$/, '')));
  return proseParts(raw, text => text.replace(/(?:^[ \t]*)?<DocRef\s+of=["']([^"']+)["']\s*\/>[ \t]*\n?/gm, (whole, ref) => removed.has(ref) ? '' : whole));
}

/** Keep the same file and address, but stop listing it as an article. */
export function asReferenceSource(raw) {
  const parsed = parseMdx(raw);
  return serializeMdx({ ...parsed, frontmatter: { ...parsed.frontmatter, listed: false, heptabaseType: 'reference' } });
}

function canKeepAsReference(frontmatter) {
  return Boolean(frontmatter) && frontmatter.slot !== 'page' && frontmatter.slot !== 'project';
}

/**
 * @param {Map<string, string>} files
 * @param {string} rootPath
 * @param {{ ignorePaths?: string[] }} [options] paths treated as already gone, so their links do not count
 */
export function removalScope(files, rootPath, { ignorePaths = [] } = {}) {
  const ignored = new Set(ignorePaths.filter(path => path !== rootPath));
  const present = ignored.size ? new Map([...files].filter(([path]) => !ignored.has(path))) : files;
  const data = new Map([...present].filter(([path]) => path !== BLOG_INDEX).map(([path, raw]) => [path, parseMdx(raw).frontmatter]));
  const edges = new Map([...present].map(([path, raw]) => [path, linkedPaths(raw, present)]));
  const follow = starts => {
    const seen = new Set(), pending = [...starts];
    while (pending.length) { const path = pending.pop(); if (seen.has(path)) continue; seen.add(path); pending.push(...(edges.get(path) || [])); }
    return seen;
  };
  const descendants = [...follow([rootPath])].filter(path => path !== rootPath && data.get(path)?.listed === false && data.get(path)?.heptabaseCardLink);
  const candidates = new Set([rootPath, ...descendants]);
  const needed = follow([...data.keys()].filter(path => !candidates.has(path)));
  // A withdrawn article takes its translations with it. A kept article keeps them too.
  const rootLink = data.get(rootPath)?.heptabaseCardLink;
  const translations = rootLink ? [...data].filter(([path, fm]) => path !== rootPath && fm.translationOf === rootLink).map(([path]) => path) : [];
  const paths = [rootPath, ...translations, ...descendants.filter(path => !needed.has(path) && !translations.includes(path))];
  const deleted = new Set(paths);
  const inbound = [...edges].filter(([path, targets]) => path !== BLOG_INDEX && !deleted.has(path) && targets.some(target => deleted.has(target))).map(([path, targets]) => ({
    path, title: data.get(path)?.title || path, targets: targets.filter(target => deleted.has(target)),
  }));
  const demote = new Set();
  for (const link of inbound) for (const target of link.targets) if (canKeepAsReference(data.get(target))) demote.add(target);
  if (demote.has(rootPath)) for (const path of translations) demote.add(path);
  // The page stays, so materials it still links to stay too.
  const retained = new Set(demote.has(rootPath) ? descendants.filter(path => !demote.has(path)) : []);
  const dropped = new Set(paths.filter(path => !demote.has(path) && !retained.has(path)));
  const citations = inbound.filter(link => link.targets.some(target => demote.has(target))).map(({ path, title }) => ({ path, title }));
  const blockers = inbound.filter(link => link.targets.some(target => dropped.has(target))).map(({ path, title }) => ({ path, title }));
  const kept = new Set([...descendants.filter(path => needed.has(path)), ...retained]);
  return {
    paths: [...dropped],
    demotions: [...demote].map(path => ({ path, title: data.get(path)?.title || path })),
    citations,
    blockers,
    keptReferences: [...kept].map(path => ({ path, title: data.get(path)?.title || path })),
  };
}

/** Decide the whole batch together. A page that this batch deletes does not force the others to stay. */
export function settleRemovals(files, roots) {
  const rootSet = [...new Set(roots.filter(path => files.has(path)))];
  let ignore = new Set(rootSet);
  let scopes = new Map();
  for (let pass = 0; pass < rootSet.length + 3; pass++) {
    scopes = new Map(rootSet.map(path => [path, removalScope(files, path, { ignorePaths: [...ignore] })]));
    const next = new Set();
    for (const path of rootSet) {
      const scope = scopes.get(path);
      if (!scope?.demotions.some(entry => entry.path === path)) next.add(path);
      for (const child of scope?.paths || []) if (child !== path) next.add(child);
    }
    if (next.size === ignore.size && [...next].every(path => ignore.has(path))) return scopes;
    ignore = next;
  }
  return scopes;
}
