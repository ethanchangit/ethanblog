import { articleCardProps, type PublishedArticle } from '@/lib/tags';

/** Title, English title, descriptions, and tags — enough for this small corpus. */
export function searchHaystack(entry: PublishedArticle): string {
  return [
    entry.data.title,
    entry.data.titleEn ?? '',
    entry.data.description,
    entry.data.descriptionEn ?? '',
    ...entry.data.tags,
  ]
    .join('\n')
    .toLowerCase();
}

export function searchCardProps(entry: PublishedArticle) {
  return {
    ...articleCardProps(entry),
    haystack: searchHaystack(entry),
  };
}

export function matchesQuery(haystack: string, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  return haystack.includes(needle);
}
