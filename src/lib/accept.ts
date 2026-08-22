/**
 * RFC 9110 §12.5.1 Accept matching for HTML vs Markdown.
 * Same rules as https://acceptmarkdown.com/recipes/astro
 */

export const PRODUCES = ['text/html', 'text/markdown'] as const;
export type ProducedType = (typeof PRODUCES)[number];

type AcceptEntry = { type: string; q: number; specificity: number };

function parseAccept(header: string): AcceptEntry[] {
  return header.split(',').map((raw) => {
    const parts = raw
      .trim()
      .split(';')
      .map((s) => s.trim());
    const type = (parts[0] ?? '').toLowerCase();
    let q = 1;
    for (const param of parts.slice(1)) {
      const [name, value] = param.split('=').map((s) => s.trim());
      if (name === 'q') {
        const parsed = Number(value);
        if (!Number.isNaN(parsed)) q = Math.max(0, Math.min(1, parsed));
      }
    }
    const specificity = type === '*/*' ? 0 : type.endsWith('/*') ? 1 : 2;
    return { type, q, specificity };
  });
}

function matches(entry: AcceptEntry, candidate: string): boolean {
  if (entry.type === '*/*') return true;
  if (entry.type.endsWith('/*')) return candidate.startsWith(entry.type.slice(0, -1));
  return entry.type === candidate;
}

/** `null` means every produced type was rejected (callers should 406). */
export function preferredType(header: string | null): ProducedType | null {
  if (!header) return PRODUCES[0];
  const entries = parseAccept(header);
  if (entries.length === 0) return PRODUCES[0];

  let best: ProducedType | null = null;
  let bestQ = -1;
  let bestPosition = Infinity;

  for (const candidate of PRODUCES) {
    let matched: AcceptEntry | null = null;
    let matchedPosition = Infinity;
    for (let idx = 0; idx < entries.length; idx++) {
      const e = entries[idx];
      if (!e || !matches(e, candidate)) continue;
      if (
        matched === null ||
        e.specificity > matched.specificity ||
        (e.specificity === matched.specificity && idx < matchedPosition)
      ) {
        matched = e;
        matchedPosition = idx;
      }
    }
    if (matched === null) continue;
    if (matched.q <= 0) continue;
    if (matched.q > bestQ || (matched.q === bestQ && matchedPosition < bestPosition)) {
      bestQ = matched.q;
      bestPosition = matchedPosition;
      best = candidate;
    }
  }

  return best;
}

export function appendVaryAccept(headers: Headers): void {
  const existing = headers.get('Vary');
  if (!existing) {
    headers.set('Vary', 'Accept');
    return;
  }
  const tokens = existing.split(',').map((s) => s.trim().toLowerCase());
  if (!tokens.includes('accept')) {
    headers.set('Vary', `${existing}, Accept`);
  }
}

const SKIP_PREFIXES = ['/api/', '/_astro/', '/media/', '/demos/'];

/** Negotiate only extensionless document URLs, not assets or already-typed files. */
export function shouldNegotiate(pathname: string): boolean {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/api') return false;
  if (SKIP_PREFIXES.some((prefix) => path.startsWith(prefix))) return false;
  const last = path.split('/').pop() ?? '';
  return !last.includes('.');
}

/** `/` → `/index.md`; `/zh/now` → `/zh/now.md`. */
export function markdownAssetPath(pathname: string): string {
  const path = pathname.replace(/\/+$/, '') || '/';
  if (path === '/') return '/index.md';
  return `${path}.md`;
}
