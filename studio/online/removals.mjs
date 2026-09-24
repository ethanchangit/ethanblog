import { parseMdx } from '../core.mjs';
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

export function linkedPaths(raw) {
  const body = parseMdx(raw).bodyZh, refs = new Set(blogReferences(body));
  proseParts(body, text => {
    for (const match of text.matchAll(/(?:\]\(<?|\bhref=["'])(?:https:\/\/(?:cn\.)?ethanchang\.io)?\/(?:(articles|projects)\/([a-z0-9-]+(?:\/\d+)*)|([a-z0-9]+(?:-[a-z0-9]+)*))(?=[\/#?"')>\s])/g)) {
      // A Heptabase URL article is linked at the site root: /<url> is articles/<url>.mdx.
      refs.add(match[3] ? `articles/${match[3]}` : `${match[1]}/${match[2]}`);
    }
    return text;
  });
  return [...refs].map(ref => `src/content/${ref}.mdx`);
}

export function withoutIndexRefs(raw, paths) {
  const removed = new Set(paths.map(path => path.replace(/^src\/content\//, '').replace(/\.mdx$/, '')));
  return proseParts(raw, text => text.replace(/(?:^[ \t]*)?<DocRef\s+of=["']([^"']+)["']\s*\/>[ \t]*\n?/gm, (whole, ref) => removed.has(ref) ? '' : whole));
}

export function removalScope(files, rootPath) {
  const data = new Map([...files].filter(([path]) => path !== BLOG_INDEX).map(([path, raw]) => [path, parseMdx(raw).frontmatter]));
  const edges = new Map([...files].map(([path, raw]) => [path, linkedPaths(raw)]));
  const follow = starts => {
    const seen = new Set(), pending = [...starts];
    while (pending.length) { const path = pending.pop(); if (seen.has(path)) continue; seen.add(path); pending.push(...(edges.get(path) || [])); }
    return seen;
  };
  const descendants = [...follow([rootPath])].filter(path => path !== rootPath && data.get(path)?.listed === false && data.get(path)?.heptabaseCardLink);
  const candidates = new Set([rootPath, ...descendants]);
  const needed = follow([...data.keys()].filter(path => !candidates.has(path)));
  // A withdrawn article takes its translations with it.
  const rootLink = data.get(rootPath)?.heptabaseCardLink;
  const translations = rootLink ? [...data].filter(([path, fm]) => path !== rootPath && fm.translationOf === rootLink).map(([path]) => path) : [];
  const paths = [rootPath, ...translations, ...descendants.filter(path => !needed.has(path) && !translations.includes(path))];
  const deleted = new Set(paths);
  const blockers = [...edges].filter(([path, targets]) => path !== BLOG_INDEX && !deleted.has(path) && targets.some(target => deleted.has(target))).map(([path]) => ({ path, title: data.get(path)?.title || path }));
  return { paths, blockers, keptReferences: descendants.filter(path => needed.has(path)).map(path => ({ path, title: data.get(path)?.title || path })) };
}
