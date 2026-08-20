export interface TocHeading {
  depth: number;
  slug: string;
  text: string;
}

export function tocEntries(headings: TocHeading[]): TocHeading[] {
  return headings.filter((heading) => heading.depth === 2 || heading.depth === 3);
}

export function hasToc(headings: TocHeading[]): boolean {
  return tocEntries(headings).length >= 3;
}
