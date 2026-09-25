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

// Compare blocks in reading order. The same text at the same position is unchanged.
// Different text at that position is a rewrite. A block that only exists on one
// side is an addition or a deletion. Text that changed place is not paired.
export function paragraphDiff(before, after) {
  const a = paragraphs(before), b = paragraphs(after);
  if (a.length > 1000 || b.length > 1000) throw new Error('段落超过 1000 段，请拆分后审核。');
  const edits = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const left = a[i], right = b[i], position = i + 1;
    if (left && right && normalized(left) === normalized(right)) edits.push({ kind: 'unchanged', before: left.text, after: right.text, from: position, to: position });
    else if (left && right) edits.push({ kind: 'modified', before: left.text, after: right.text, from: position, to: position });
    else if (left) edits.push({ kind: 'removed', before: left.text, after: '', from: position });
    else edits.push({ kind: 'added', before: '', after: right.text, to: position });
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
  }).replace(/<a\b([^>]*\bdata-doc-mention\b[^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs, label) => {
    const href = /\bhref\s*=\s*"([^"\n]+)"/.exec(attrs)?.[1];
    if (!href) return whole;
    return `[${label.replace(/[\[\]]/g, '')}](${href})`;
  }).replace(/<hepta-mention\b([^>]*)>([\s\S]*?)<\/hepta-mention>/gi, (whole, attrs, label) => {
    const id = /(?:^|\s)id\s*=\s*(["'])([^"']+)\1/.exec(attrs)?.[2];
    if (!id) return whole;
    return `[${label.replace(/[\[\]]/g, '').trim()}](heptabase://card/${id})`;
  });
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
