/**
 * Block split / join / markdown preview for the local studio editor.
 * Browser-safe: no Node APIs. Never imported by the public site.
 */

export const MEDIA_IMPORT = "import { DocList, DocRef } from '@/components/media';";

const FENCE_RE = /^```/;
const HEADING_RE = /^#{1,6}(?:\s|$)/;
const HR_RE = /^(?:-{3,}|\*{3,}|_{3,})\s*$/;
const QUOTE_RE = /^>/;
const LIST_RE = /^\s*(?:[-*+]|\d+[.)])(?:\s|$)/;
const IMPORT_RE = /^\s*import\s/;
const HTML_RE = /^\s*</;
const LANG_SPLIT_RE = /<div\s+data-lang-split\b/i;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]
  ));
}

export function safeHref(href) {
  const raw = String(href ?? '').trim();
  if (!raw) return '#';
  if (/^(https?:|mailto:|\/|#|\.\/)/i.test(raw)) return escapeHtml(raw);
  return '#';
}

export function isOpaqueBlock(block) {
  const text = String(block ?? '').trim();
  if (!text) return false;
  if (IMPORT_RE.test(text) || /^\s*export\s/.test(text)) return true;
  if (LANG_SPLIT_RE.test(text)) return true;
  if (text.startsWith('<')) return true;
  return false;
}

function isListContinuation(line) {
  return LIST_RE.test(line) || (line.trim() !== '' && /^\s{2,}\S/.test(line));
}

function isBlockOpen(line) {
  return FENCE_RE.test(line)
    || HEADING_RE.test(line)
    || HR_RE.test(line)
    || QUOTE_RE.test(line)
    || LIST_RE.test(line)
    || IMPORT_RE.test(line)
    || HTML_RE.test(line);
}

/** Split markdown into block-level chunks. Blank lines start a new block; soft wraps stay inside one block. */
export function splitBlocks(markdown) {
  const text = String(markdown ?? '').replace(/\r\n/g, '\n');
  if (text.trim() === '' && text === '') return [''];
  const lines = text.split('\n');
  const blocks = [];
  let i = 0;

  const skipBlanks = () => {
    while (i < lines.length && lines[i].trim() === '') i += 1;
  };

  while (i < lines.length) {
    skipBlanks();
    if (i >= lines.length) break;
    const start = i;
    const line = lines[i];

    if (FENCE_RE.test(line)) {
      i += 1;
      while (i < lines.length && !FENCE_RE.test(lines[i])) i += 1;
      if (i < lines.length) i += 1;
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    if (IMPORT_RE.test(line)) {
      while (i < lines.length && IMPORT_RE.test(lines[i])) i += 1;
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    if (HTML_RE.test(line)) {
      i += 1;
      while (i < lines.length && lines[i].trim() !== '') i += 1;
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    if (HEADING_RE.test(line) || HR_RE.test(line)) {
      blocks.push(line);
      i += 1;
      continue;
    }

    if (QUOTE_RE.test(line)) {
      while (i < lines.length) {
        const current = lines[i];
        const next = lines[i + 1];
        if (QUOTE_RE.test(current) || (current.trim() === '' && next !== undefined && QUOTE_RE.test(next))) {
          i += 1;
          continue;
        }
        break;
      }
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    if (LIST_RE.test(line)) {
      while (i < lines.length && isListContinuation(lines[i])) i += 1;
      blocks.push(lines.slice(start, i).join('\n'));
      continue;
    }

    i += 1;
    while (i < lines.length) {
      const current = lines[i];
      if (current.trim() === '') break;
      if (isBlockOpen(current)) break;
      i += 1;
    }
    blocks.push(lines.slice(start, i).join('\n'));
  }

  return blocks.length ? blocks : [''];
}

export function joinBlocks(blocks) {
  return (blocks ?? [])
    .map((block) => String(block ?? '').replace(/[ \t]+$/gm, ''))
    .join('\n\n')
    .replace(/^\n+/, '');
}

function inlineMarkdown(raw) {
  let text = escapeHtml(raw);
  text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
  text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const decoded = href
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"');
    return `<a href="${safeHref(decoded)}">${label}</a>`;
  });
  text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  text = text.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, '$1<em>$2</em>');
  return text;
}

function renderFence(block) {
  const lines = block.split('\n');
  const end = FENCE_RE.test(lines[lines.length - 1] ?? '') ? lines.length - 1 : lines.length;
  const content = lines.slice(1, end).join('\n');
  return `<pre><code>${escapeHtml(content)}</code></pre>`;
}

function renderQuote(block) {
  const inner = block
    .split('\n')
    .map((line) => line.replace(/^>\s?/, ''))
    .join('\n')
    .trim();
  const paras = inner
    .split(/\n\n+/)
    .map((para) => `<p>${para.split('\n').map((line) => inlineMarkdown(line)).join('<br />')}</p>`)
    .join('');
  return `<blockquote>${paras || '<p></p>'}</blockquote>`;
}

function renderList(block) {
  const lines = block.split('\n').filter((line) => line.trim());
  const first = lines[0] ?? '';
  const ordered = /^\s*\d+[.)]\s/.test(first);
  const items = lines.map((line) => {
    const match = line.match(/^\s*(?:[-*+]|\d+[.)])\s+(.*)$/);
    return `<li>${inlineMarkdown(match ? match[1] : line.trim())}</li>`;
  }).join('');
  return ordered ? `<ol>${items}</ol>` : `<ul>${items}</ul>`;
}

export function classifyBlock(block) {
  const raw = String(block ?? '');
  const trimmed = raw.trim();
  if (!trimmed) return { type: 'p', text: '' };
  if (isOpaqueBlock(raw)) return { type: 'opaque', text: raw };
  if (FENCE_RE.test(trimmed)) return { type: 'fence', text: raw };
  if (HR_RE.test(trimmed)) return { type: 'hr', text: trimmed };

  if (!raw.includes('\n')) {
    const heading = /^(#{1,6})(?:\s+(.*))?$/.exec(trimmed);
    if (heading) {
      return { type: 'h', level: heading[1].length, text: heading[2] ?? '' };
    }
  }

  const lines = raw.split('\n');
  if (lines.every((line) => !line.trim() || QUOTE_RE.test(line))) {
    return {
      type: 'quote',
      text: lines.map((line) => line.replace(/^>\s?/, '')).join('\n'),
    };
  }
  if (lines.every((line) => !line.trim() || isListContinuation(line) || /^[-*+]$/.test(line.trim()) || /^\d+[.)]$/.test(line.trim()))) {
    const first = lines.find((line) => line.trim()) ?? '';
    const ordered = /^\s*\d+[.)]/.test(first);
    const items = lines.filter((line) => line.trim()).map((line) => {
      const match = line.match(/^\s*(?:[-*+]|\d+[.)])(?:\s+(.*))?$/);
      return match ? (match[1] ?? '') : line.trim();
    });
    return { type: ordered ? 'ol' : 'ul', text: items.join('\n') };
  }
  return { type: 'p', text: raw };
}

export function formatBlock(type, text, { level = 2 } = {}) {
  const body = String(text ?? '');
  if (type === 'h') {
    const hashes = '#'.repeat(Math.min(6, Math.max(1, Number(level) || 2)));
    return body.trim() ? `${hashes} ${body.trim()}` : hashes;
  }
  if (type === 'quote') {
    if (!body.trim()) return '>';
    return body.split('\n').map((line) => `> ${line}`).join('\n');
  }
  if (type === 'ul') {
    if (!body.trim()) return '-';
    return body.split('\n').map((line) => `- ${line}`).join('\n');
  }
  if (type === 'ol') {
    if (!body.trim()) return '1.';
    return body.split('\n').map((line, index) => `${index + 1}. ${line}`).join('\n');
  }
  if (type === 'opaque' || type === 'fence' || type === 'hr') return body;
  return body;
}

export function isFormattedEmpty(block) {
  const kind = classifyBlock(block);
  if (kind.type === 'p' || kind.type === 'opaque' || kind.type === 'fence' || kind.type === 'hr') return false;
  return !String(kind.text ?? '').trim();
}

export function hasBlockFormat(block) {
  const type = classifyBlock(block).type;
  return type === 'h' || type === 'quote' || type === 'ul' || type === 'ol';
}

export function mergeBlockMarkdown(prev, next) {
  const a = classifyBlock(prev);
  const b = classifyBlock(next);
  if (a.type === 'opaque' || a.type === 'fence' || a.type === 'hr' || b.type === 'opaque' || b.type === 'fence') {
    const left = String(prev ?? '').trimEnd();
    const right = String(next ?? '').trim();
    return right ? `${left}\n${right}` : left;
  }
  return formatBlock(a.type, `${a.text}${b.text}`, { level: a.level });
}

export function clearBlockFormat(block) {
  const kind = classifyBlock(block);
  return kind.type === 'p' ? String(block ?? '') : String(kind.text ?? '');
}

/** Detect a markdown block shortcut at the start of typed plain text (`## `, `> `, `- `, `1. `). */
export function detectMarkdownShortcut(plain) {
  const text = String(plain ?? '').replace(/\u00A0/g, ' ').replace(/\n$/, '');
  const heading = /^(#{1,6}) ([\s\S]*)$/.exec(text);
  if (heading) return { type: 'h', level: heading[1].length, text: heading[2] };
  if (text.startsWith('> ')) return { type: 'quote', text: text.slice(2) };
  const ul = /^[-*+] ([\s\S]*)$/.exec(text);
  if (ul) return { type: 'ul', text: ul[1] };
  const ol = /^1[.)] ([\s\S]*)$/.exec(text);
  if (ol) return { type: 'ol', text: ol[1] };
  return null;
}

/** Render one block to sanitized HTML. Opaque MDX/HTML is escaped, never executed. */
export function renderBlockHtml(block) {
  const raw = String(block ?? '');
  const kind = classifyBlock(raw);
  const blank = '\u200B';
  if (kind.type === 'opaque') {
    return `<pre class="studio-block-opaque"><code>${escapeHtml(kind.text)}</code></pre>`;
  }
  if (kind.type === 'fence') return renderFence(raw);
  if (kind.type === 'hr') return '<hr />';
  if (kind.type === 'h') {
    const inner = kind.text.trim() ? inlineMarkdown(kind.text) : blank;
    return `<h${kind.level}>${inner}</h${kind.level}>`;
  }
  if (kind.type === 'quote') {
    if (!kind.text.trim()) return `<blockquote><p>${blank}</p></blockquote>`;
    return renderQuote(raw);
  }
  if (kind.type === 'ul' || kind.type === 'ol') {
    if (!kind.text.trim()) {
      const item = `<li>${blank}</li>`;
      return kind.type === 'ol' ? `<ol>${item}</ol>` : `<ul>${item}</ul>`;
    }
    return renderList(raw);
  }
  if (!kind.text.trim()) return `<p>${blank}</p>`;
  return `<p>${kind.text.split('\n').map((line) => inlineMarkdown(line)).join('<br />')}</p>`;
}

export function isFenceBlock(block) {
  return FENCE_RE.test(String(block ?? '').trim());
}

/**
 * If the caret sits in an `@query` mention token, return its start index and query.
 * Does not fire inside emails (`name@host`).
 */
export function atQueryAtCaret(text, caret) {
  const value = String(text ?? '');
  const pos = Math.max(0, Math.min(Number(caret) || 0, value.length));
  const before = value.slice(0, pos);
  const match = /(^|[\s\n])@([^\s@]*)$/.exec(before);
  if (!match) return null;
  const query = match[2];
  return { start: pos - query.length - 1, query };
}

export function docRefMarkup(of, pane) {
  const open = pane === 'series' ? '<DocList pane="series">' : '<DocList>';
  return `${open}\n  <DocRef of="${of}" />\n</DocList>`;
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

export function matchPages(pages, query) {
  const q = String(query ?? '').trim().toLowerCase();
  const list = Array.isArray(pages) ? pages : [];
  if (!q) return list;
  return list.filter((page) => {
    const path = `${page.collection}/${page.id}`;
    return page.title.toLowerCase().includes(q)
      || String(page.titleEn ?? '').toLowerCase().includes(q)
      || path.toLowerCase().includes(q)
      || page.id.toLowerCase().includes(q);
  });
}
