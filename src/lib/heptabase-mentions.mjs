// Heptabase card mentions become this site's mention links.
// A card with no published page, and any non-card mention, keeps its readable title.

export function mentionPattern() {
  return /<hepta-mention\b([^>]*)>([\s\S]*?)<\/hepta-mention>|\[([^\]\n]*)\]\(heptabase:\/\/card\/([0-9a-f-]+)\)/gi;
}

export function mentionFrom(match) {
  if (match[4]) return { type: 'card', id: String(match[4]).toLowerCase(), label: match[3] ?? '' };
  const attrs = match[1] ?? '';
  const type = /(?:^|\s)type\s*=\s*(["'])([^"']+)\1/i.exec(attrs)?.[2] || 'card';
  const id = /(?:^|\s)id\s*=\s*(["'])([^"']+)\1/i.exec(attrs)?.[2]?.toLowerCase() || '';
  return { type, id, label: match[2] ?? '' };
}

export function escapeProse(value) {
  return String(value).replace(/[<>{}]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;' })[char]);
}

function escapeLabel(value) {
  return String(value).replace(/[&<>{}"]/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '{': '&#123;', '}': '&#125;', '"': '&quot;',
  })[char]);
}

function safeAttr(value) {
  const text = String(value || '');
  if (!text || /["'<>\s]/.test(text)) return '';
  return text;
}

/** @returns {{ html?: string, text?: string }} */
export function mentionMarkup(parsed, page, { standalone = false } = {}) {
  const label = String(parsed?.label || page?.title || '').trim();
  const href = safeAttr(page?.href);
  const of = safeAttr(page?.of);
  const linked = parsed?.type === 'card' && parsed.id && href;
  if (!linked) return { text: label };
  if (standalone && of) return { html: `<DocList pane="embed">\n  <DocRef of="${of}" />\n</DocList>` };
  const ofAttr = of ? ` data-doc-of="${of}"` : '';
  return { html: `<a href="${href}"${ofAttr} data-doc-mention>${escapeLabel(label || page.title || '')}</a>` };
}
