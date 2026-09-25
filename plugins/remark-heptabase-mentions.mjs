/**
 * Build-time conversion of Heptabase mentions.
 * `<hepta-mention>` and `[label](heptabase://card/<id>)` become mention links
 * when that card has a published page. Otherwise the readable title remains,
 * and the raw mention markup does not.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { parseMdx, publicHref } from '../studio/core.mjs';
import { mentionMarkup } from '../src/lib/heptabase-mentions.mjs';

const CONTENT = new URL('../src/content/', import.meta.url);

function walkMdx(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkMdx(path, out);
    else if (name.endsWith('.mdx')) out.push(path);
  }
  return out;
}

function docId(collection, file, root) {
  const rel = file.slice(root.length).replace(/\\/g, '/').replace(/^\//, '').replace(/\.mdx$/, '');
  if (collection === 'pages' && rel === 'blogs') return 'blogs';
  return rel;
}

/** Card id → published page. Drafts are not link targets. */
export function mentionPagesFromContent(root = CONTENT) {
  const base = root instanceof URL ? root : new URL(root, 'file:');
  const dir = base.pathname;
  const pages = new Map();
  for (const collection of ['articles', 'projects', 'pages']) {
    const folder = join(dir, collection);
    let files = [];
    try { files = walkMdx(folder); } catch { continue; }
    for (const file of files) {
      const parsed = parseMdx(readFileSync(file, 'utf8'));
      const data = parsed.frontmatter || {};
      if (data.draft) continue;
      const link = String(data.heptabaseCardLink || '');
      const id = /^heptabase:\/\/card\/([0-9a-f-]{36})$/i.exec(link)?.[1]?.toLowerCase();
      if (!id) continue;
      const docIdValue = docId(collection, file, folder);
      const href = collection === 'articles' && data.url ? `/${data.url}` : publicHref(collection, docIdValue);
      pages.set(id, { href, of: `${collection}/${docIdValue}`, title: data.title || '' });
    }
  }
  return pages;
}

function textOf(node) {
  if (!node) return '';
  if (node.type === 'text' || node.type === 'inlineCode') return node.value || '';
  return (node.children || []).map(textOf).join('');
}

function mentionNode(type, id, label, pages) {
  const page = type === 'card' && id ? pages.get(id) : null;
  const rendered = mentionMarkup({ type, id, label }, page, { standalone: false });
  if (rendered.html) return { type: 'html', value: rendered.html };
  return { type: 'text', value: rendered.text || '' };
}

function mentionOpen(value) {
  return /^<hepta-mention\b([^>]*)>\s*$/i.exec(String(value || ''));
}

export function rewriteMentionTree(tree, pages) {
  const visit = (parent) => {
    const children = parent?.children;
    if (!Array.isArray(children)) return;
    for (let i = 0; i < children.length; i++) {
      const node = children[i];
      if (node.type === 'code' || node.type === 'inlineCode') continue;
      if (node.type === 'link') {
        const id = /^heptabase:\/\/card\/([0-9a-f-]{36})$/i.exec(node.url || '')?.[1]?.toLowerCase();
        if (id) {
          children[i] = mentionNode('card', id, textOf(node), pages);
          continue;
        }
      }
      const open = node.type === 'html' ? mentionOpen(node.value) : null;
      const mid = children[i + 1];
      const close = children[i + 2];
      if (open && mid?.type === 'text' && close?.type === 'html' && /^<\/hepta-mention>\s*$/i.test(close.value || '')) {
        const type = /(?:^|\s)type\s*=\s*(["'])([^"']+)\1/i.exec(open[1])?.[2] || 'card';
        const id = /(?:^|\s)id\s*=\s*(["'])([^"']+)\1/i.exec(open[1])?.[2]?.toLowerCase() || '';
        children.splice(i, 3, mentionNode(type, id, mid.value, pages));
        continue;
      }
      visit(node);
    }
  };
  visit(tree);
  return tree;
}

export function remarkHeptabaseMentions() {
  const pages = mentionPagesFromContent();
  return (tree) => { rewriteMentionTree(tree, pages); };
}
