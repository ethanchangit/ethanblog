import { docCardProps } from '@/lib/tags';
import type { DocEntry } from '@/lib/docs';

/** Index all published documents, including reference-only pages and body text. */
export function searchHaystack(entry: DocEntry): string {
  return [
    entry.data.title,
    entry.data.description,
    ...entry.data.tags,
    (entry.body ?? '').replace(/^import .*$/gm, '').replace(/<[^>]*>/g, ' '),
  ]
    .join('\n')
    .toLowerCase();
}

export function searchCardProps(entry: DocEntry) {
  return {
    ...docCardProps(entry),
    haystack: searchHaystack(entry),
  };
}

export function matchesQuery(haystack: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystack.includes(needle);
}
