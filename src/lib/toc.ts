/** 文章标题在目录里的锚点。点它回到页顶；无 JS 时仍是指向文首的链接。 */
export const DOC_TITLE_ID = 'doc-title';

export interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

export function tocEntries(headings: TocHeading[]): TocHeading[] {
  return headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
}

export function hasToc(headings: TocHeading[]): boolean {
  return tocEntries(headings).length > 0;
}
