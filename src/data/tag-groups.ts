/**
 * 标签页分组（/tags）的单一数据源。
 * slug 对应查询参数 ?group=；未列入任何组的标签会进「其他」。
 * 同一标签只出现在最先写到它的那一组。改这里即可全站生效。
 */

export const ALL_GROUP = 'all';

export interface TagGroup {
  slug: string;
  title: string;
  titleEn: string;
  tags: string[];
}

export const FALLBACK_GROUP = {
  slug: 'other',
  title: '其他',
  titleEn: 'Other',
} as const satisfies Pick<TagGroup, 'slug' | 'title' | 'titleEn'>;

export const tagGroups: TagGroup[] = [
  {
    slug: 'writing',
    title: '写作与知识',
    titleEn: 'Writing & knowledge',
    tags: ['知识管理', 'PKM', '笔记方法论', 'Heptabase', 'Obsidian', '深度学习'],
  },
  {
    slug: 'software',
    title: '软件与项目',
    titleEn: 'Software & projects',
    tags: ['软件开发', '个人项目', '网站'],
  },
  {
    slug: 'media',
    title: '媒介与研究',
    titleEn: 'Media & research',
    tags: ['超媒体', '动态媒介', '媒介引擎', '研究线', '宣言'],
  },
];

export function groupedTags(allTags: string[]): TagGroup[] {
  const available = new Set(allTags);
  const seen = new Set<string>();
  const groups: TagGroup[] = [];

  for (const group of tagGroups) {
    const tags = group.tags.filter((tag) => available.has(tag) && !seen.has(tag));
    for (const tag of tags) seen.add(tag);
    if (tags.length > 0) groups.push({ ...group, tags });
  }

  const rest = allTags.filter((tag) => !seen.has(tag)).sort((a, b) => a.localeCompare(b, 'zh-CN'));
  if (rest.length > 0) {
    groups.push({ ...FALLBACK_GROUP, tags: rest });
  }

  return groups;
}

export function resolveGroupSlug(groups: TagGroup[], raw: string | null | undefined): string {
  const slug = raw?.trim() || ALL_GROUP;
  if (slug === ALL_GROUP) return ALL_GROUP;
  return groups.some((group) => group.slug === slug) ? slug : ALL_GROUP;
}
