import { fail } from './auth.mjs';
import { cardId } from './heptabase.mjs';
import { ensureMediaImport } from '../blocks.mjs';
import { publicHref } from '../core.mjs';

// Do not turn code examples into links, dependencies, or executable MDX.
export function proseParts(text, transform) {
  const code = /^[ \t]*(`{3,}|~{3,})[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$|`+[^`\n]*`+/gm;
  let offset = 0, out = '';
  for (const match of text.matchAll(code)) { out += transform(text.slice(offset, match.index)) + match[0]; offset = match.index + match[0].length; }
  return out + transform(text.slice(offset));
}
// Attribute order is not fixed. A mention is never reduced to its label.
const mention = /<hepta-mention\b([^>]*)>([\s\S]*?)<\/hepta-mention>|\[([^\]\n]*)\]\(heptabase:\/\/card\/([0-9a-f-]+)\)/gi;
const escapeText = (s) => s.replace(/[<>{}]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;' })[c]);
const unescapeText = (s) => s.replace(/&(lt|gt|amp|quot|#123|#125);/g, (_, c) => ({ lt: '<', gt: '>', amp: '&', quot: '"', '#123': '{', '#125': '}' })[c]);

function mentionFrom(match) {
  if (match[4]) return { type: 'card', id: match[4], label: match[3] ?? '' };
  const attrs = match[1] ?? '';
  const type = /(?:^|\s)type\s*=\s*(["'])([^"']+)\1/.exec(attrs)?.[2] || 'card';
  const id = /(?:^|\s)id\s*=\s*(["'])([^"']+)\1/.exec(attrs)?.[2] || '';
  if (!id) throw fail('mention 没有卡片 id，未把它收成纯文字。');
  return { type, id, label: match[2] ?? '' };
}

export function references(source) {
  const refs = new Map();
  proseParts(source, (part) => {
    mention.lastIndex = 0;
    for (const match of part.matchAll(mention)) {
      const parsed = mentionFrom(match);
      if (parsed.type !== 'card') throw fail(`暂不能发布 ${parsed.type} 类型的 mention。请先转成文字卡片，未忽略这条引用。`);
      const id = cardId(`heptabase://card/${parsed.id}`);
      refs.set(id, { id, title: parsed.label });
    }
    return part;
  });
  return [...refs.values()];
}

export function blogReferences(body) {
  const paths = new Set();
  proseParts(body, (part) => {
    for (const m of part.matchAll(/<DocRef\s+of=["']([^"']+)["']\s*\/>/g)) paths.add(m[1]);
    for (const m of part.matchAll(/<a\s[^>]*\bdata-doc-mention\b[^>]*>/g)) {
      const of = /\bdata-doc-of=["']([^"']+)["']/.exec(m[0]);
      if (of) { paths.add(of[1]); continue; }
      const href = /\bhref=["']\/([^"'#]+)["']/.exec(m[0]);
      if (!href) continue;
      const path = href[1].replace(/\/+$/, '');
      if (/^(articles|projects|pages)\//.test(path)) paths.add(path);
    }
    return part;
  });
  return [...paths];
}

export function fromHeptabase(source, targets, imports = '') {
  const lines = source.split('\n');
  // Reference cards also use lower-level headings for their title.
  const heading = /^#{1,6}[ \t]+(.+?)(?:[ \t]+#+)?[ \t]*$/.exec(lines[0]);
  if (!heading || !heading[1].trim()) throw fail('卡片需要以标题开头。');
  const title = heading[1].trim();
  lines.shift();
  let hasBlock = false;
  const body = proseParts(lines.join('\n').trim(), (part) => {
    const tokens = [];
    mention.lastIndex = 0;
    let text = part.replace(mention, (whole, attrs, inner, linkLabel, linkId, offset) => {
      const parsed = mentionFrom([whole, attrs, inner, linkLabel, linkId]);
      if (parsed.type !== 'card') throw fail(`暂不能发布 ${parsed.type} 类型的 mention。`);
      const id = cardId(`heptabase://card/${parsed.id}`);
      const target = targets.get(id);
      if (!target) throw fail('引用的卡片尚未完整读取，未继续发布。');
      const lineStart = part.lastIndexOf('\n', offset - 1) + 1;
      const end = part.indexOf('\n', offset + whole.length);
      const standalone = !part.slice(lineStart, offset).trim() && !part.slice(offset + whole.length, end < 0 ? part.length : end).trim();
      const of = `${target.collection}/${target.id}`;
      hasBlock ||= standalone;
      const label = parsed.label || target.title;
      const markup = standalone ? `<DocList pane="embed">\n  <DocRef of="${of}" />\n</DocList>` : `<a href="${publicHref(target.collection, target.id)}" data-doc-of="${of}" data-doc-mention>${escapeText(label)}</a>`;
      return `\u0001${tokens.push(markup) - 1}\u0002`;
    });
    // Preserve the text of colors; other protected objects require explicit handling.
    text = text.replace(/<hepta-color\s+[^>]*>([\s\S]*?)<\/hepta-color>/g, '$1');
    if (/<\/?hepta-/.test(text)) throw fail('卡片包含暂不能安全转换的嵌入或复杂表格，未丢弃内容。');
    text = escapeText(text).replace(/^(import|export)\s/gm, (_, word) => `&#${word.charCodeAt(0)};${word.slice(1)} `);
    return text.replace(/\u0001(\d+)\u0002/g, (_, i) => tokens[Number(i)]);
  });
  return { title, body, imports: hasBlock ? ensureMediaImport(imports) : imports };
}

export function toHeptabase(parsed, docs) {
  const byPath = new Map(docs.map((d) => [`${d.collection}/${d.id}`, d]));
  const token = (path, label) => {
    const doc = byPath.get(path);
    if (!doc?.heptabaseCardLink) throw fail(`请先为被引用的 ${path} 连接 Heptabase 卡片。`);
    return `<hepta-mention type="card" id="${cardId(doc.heptabaseCardLink)}">${label || doc.title}</hepta-mention>`;
  };
  let body = proseParts(parsed.bodyZh, (part) => {
    let text = part.replace(/<DocList(?:\s+[^>]*)?>\s*([\s\S]*?)\s*<\/DocList>/g, (_, children) => {
      const refs = [...children.matchAll(/<DocRef\s+of=["']([^"']+)["']\s*\/>/g)];
      if (children.replace(/<DocRef\s+of=["'][^"']+["']\s*\/>/g, '').trim()) throw fail('引用区有其他内容，未改写。');
      return refs.map((m) => token(m[1])).join('\n\n');
    });
    text = text.replace(/<a\s+([^>]*\bdata-doc-mention\b[^>]*)>([\s\S]*?)<\/a>/g, (whole, attrs, label) => {
      const of = /\bdata-doc-of=["']([^"']+)["']/.exec(attrs);
      const href = /\bhref=["']\/((?:articles|projects|pages)\/[^"'#\s]+)["']/.exec(attrs);
      const path = of?.[1] || href?.[1];
      if (!path) return whole;
      return token(path, unescapeText(label));
    });
    return unescapeText(text);
  });
  // Existing arbitrary MDX is kept byte-for-byte in a standard code fence when it
  // cannot be represented as native Heptabase prose. No component is discarded.
  let needsArchive = false;
  proseParts(body, (part) => { mention.lastIndex = 0; needsArchive ||= /<\/?[A-Za-z]|^import\s|^export\s/m.test(part.replace(mention, '')); return part; });
  if (needsArchive) {
    const raw = [parsed.imports, parsed.bodyZh].filter(Boolean).join('\n\n');
    const fence = '`'.repeat(Math.max(3, ...[...raw.matchAll(/`+/g)].map((m) => m[0].length + 1)));
    body = `${fence}mdx\n${raw}\n${fence}`;
  }
  return `# ${parsed.frontmatter.title}\n\n${body.trim()}`;
}
