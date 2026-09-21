import { unified } from 'unified';
import remarkParse from 'remark-parse';
import remarkGfm from 'remark-gfm';
import remarkRehype from 'remark-rehype';
import remarkSmartypants from 'remark-smartypants';
import rehypeStringify from 'rehype-stringify';

const parser = unified().use(remarkParse).use(remarkGfm);
const renderer = unified().use(remarkParse).use(remarkGfm).use(remarkSmartypants).use(remarkRehype).use(rehypeStringify);

export function tagDiff(before = [], after = []) {
  const previous = new Set(before), next = new Set(after);
  return {
    added: [...next].filter(tag => !previous.has(tag)),
    removed: [...previous].filter(tag => !next.has(tag)),
    unchanged: [...next].filter(tag => previous.has(tag)),
  };
}

export function onlyTagsChanged(card) {
  if (!card?.previouslyPublished || card.beforeContent.trim() !== card.afterContent.trim()) return false;
  const before = card.beforeProperties, after = card.afterProperties;
  const { added, removed } = tagDiff(before.tags, after.tags);
  if (!added.length && !removed.length) return false;
  // Review status is not a reader-facing change. Missing listed/featured use
  // the website's defaults; all other properties must match, including dates.
  const ignored = new Set(['tags', 'draft', 'heptabaseStatus']);
  const value = (properties, key) => properties[key] ?? ({ listed: true, featured: false }[key]);
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => !ignored.has(key))
    .every(key => JSON.stringify(value(before, key)) === JSON.stringify(value(after, key)));
}

// Top-level Markdown blocks preserve fenced code, lists, tables and paragraphs.
// Offsets retain exact source bytes; a soft line wrap is not a new paragraph.
export function paragraphs(source) {
  if (source.length > 300000) throw new Error('正文过长，请拆分文章后审核。');
  return parser.parse(source).children.map(node => ({
    text: source.slice(node.position.start.offset, node.position.end.offset), type: node.type,
  }));
}
const normalized = block => block.type === 'code' ? block.text : block.text.replace(/\s+/g, ' ').trim();

export function paragraphDiff(before, after) {
  const a = paragraphs(before), b = paragraphs(after);
  if (a.length > 1000 || b.length > 1000) throw new Error('段落超过 1000 段，请拆分后审核。');
  const x = a.map(normalized), y = b.map(normalized);
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = x[i] === y[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);
  const edits = []; let i = 0, j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && x[i] === y[j]) { edits.push({ kind: 'unchanged', before: a[i].text, after: b[j].text, from: ++i, to: ++j }); }
    else if (j === b.length || i < a.length && dp[i+1][j] >= dp[i][j+1]) edits.push({ kind: 'removed', before: a[i].text, after: '', from: ++i });
    else edits.push({ kind: 'added', before: '', after: b[j].text, to: ++j });
  }
  // Exact moved paragraphs should not be reported as deletion plus new prose.
  for (const removed of edits.filter(e => e.kind === 'removed')) {
    const added = edits.find(e => e.kind === 'added' && e.after === removed.before);
    if (added) {
      Object.assign(added, { kind: 'moved', from: removed.from });
      Object.assign(removed, { kind: 'moved', to: added.to });
    }
  }
  // Pair edits between unchanged anchors, ignoring moved blocks. Keep both
  // records in place so each column preserves its own complete document order.
  for (let n = 0; n < edits.length;) {
    if (edits[n].kind === 'unchanged') { n++; continue; }
    const deleted = [], added = [];
    while (n < edits.length && edits[n].kind !== 'unchanged') {
      const e = edits[n++];
      if (e.kind === 'removed') deleted.push(e);
      else if (e.kind === 'added') added.push(e);
    }
    for (let k = 0; k < Math.min(deleted.length, added.length); k++) {
      Object.assign(deleted[k], { kind: 'modified', to: added[k].to });
      Object.assign(added[k], { kind: 'modified', from: deleted[k].from });
    }
  }
  return edits;
}

export async function renderedProse(source, renderReference = () => '', context = source) {
  const tokens = [];
  // Mask code first so literal examples of links/components remain literal.
  const code = [], ranges = [];
  const collect = node => { if (node.type === 'code' || node.type === 'inlineCode') ranges.push([node.position.start.offset, node.position.end.offset]); else node.children?.forEach(collect); };
  collect(parser.parse(source));
  for (const [start, end] of ranges.sort((a, b) => b[0] - a[0])) { const token = `DASHBOARDCODE${code.push(source.slice(start, end)) - 1}END`; source = source.slice(0,start) + token + source.slice(end); }
  // Generated DocRef is the only component expanded here. Arbitrary MDX is not
  // executed in the dashboard; unsupported archive components remain visible.
  let body = source.replace(/<DocList(?:\s+[^>]*)?>\s*([\s\S]*?)\s*<\/DocList>/g, (whole, children) => {
    if (children.replace(/<DocRef\s+of=["'][^"']+["']\s*\/>/g, '').trim()) return whole;
    return children.replace(/<DocRef\s+of=["']([^"']+)["']\s*\/>/g, (_, path) => `\n\nDASHBOARDREF${tokens.push(renderReference(path)) - 1}END\n\n`);
  }).replace(/<a\s+href="([^"\n]+)"\s+data-doc-mention\s*>([\s\S]*?)<\/a>/g, (_, href, label) => `[${label}](${href})`);
  body = body.replace(/DASHBOARDCODE(\d+)END/g, (_, n) => code[Number(n)]);
  // Raw HTML is text, never trusted HTML. Markdown links are filtered as well.
  // Individual review blocks still resolve reference-style links defined elsewhere
  // in their own document version, never against the other side of the diff.
  if (context !== source) body += '\n\n' + parser.parse(context).children.filter(node => node.type === 'definition')
    .map(node => context.slice(node.position.start.offset, node.position.end.offset)).join('\n');
  const tree = parser.parse(body);
  const safe = node => {
    if (node.type === 'html') node.type = 'text';
    if (['link', 'image', 'definition'].includes(node.type) && /^(?:javascript|data|vbscript):/i.test(node.url?.replace(/[\s\u0000-\u001f]/g, '') || '')) node.url = '#';
    if (node.type === 'image' || node.type === 'imageReference') { node.type = 'text'; node.value = `[图片：${node.alt || '未命名'}；审核时不向外站加载]`; }
    node.children?.forEach(safe);
  };
  safe(tree);
  const htmlTree = await renderer.run(tree);
  return renderer.stringify(htmlTree).replace(/<p>DASHBOARDREF(\d+)END<\/p>/g, (_, n) => tokens[Number(n)] || '');
}
