import { getCollection, type CollectionEntry } from 'astro:content';
import { articleHref, projectHref } from '@/lib/routes';

/** 哪份索引收录这条文档。与 topical `tags` 无关。 */
export type DocSlot = 'article' | 'project';
export type DocEntry = CollectionEntry<'articles'> | CollectionEntry<'projects'>;

export function docHref(entry: Pick<DocEntry, 'id' | 'data'>): string {
  return entry.data.slot === 'project' ? projectHref(entry.id) : articleHref(entry.id);
}

export async function loadDocs(opts: { includeDrafts?: boolean } = {}): Promise<DocEntry[]> {
  const [articles, projects] = await Promise.all([
    getCollection('articles', opts.includeDrafts ? undefined : ({ data }) => !data.draft),
    getCollection('projects', opts.includeDrafts ? undefined : ({ data }) => !data.draft),
  ]);
  return [...articles, ...projects];
}

export async function docsBySlot(
  slot: DocSlot,
  opts: { includeDrafts?: boolean } = {},
): Promise<DocEntry[]> {
  return (await loadDocs(opts)).filter((entry) => entry.data.slot === slot);
}
