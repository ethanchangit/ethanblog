export function formatDate(date: Date, lang: 'zh-CN' | 'en' = 'zh-CN'): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const dtf = new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  if (lang === 'en') return dtf.format(date);

  // 数字与年/月/日之间留空格：2026 年 3 月 1 日
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((p) => [p.type, p.value]),
  );
  return `${parts.year} 年 ${parts.month} 月 ${parts.day} 日`;
}

/** 研究线笔记编号：两位补零（1 → "01"）。 */
export function formatSeq(seq: number): string {
  return String(seq).padStart(2, '0');
}

/** 溯源行的素材类型标签（articles frontmatter source.type → 页眉展示） */
export const sourceTypeLabel: Record<string, { zh: string; en: string }> = {
  chat: { zh: '对话记录', en: 'Chat log' },
  notes: { zh: '个人笔记', en: 'Personal notes' },
  blog: { zh: '博客草稿', en: 'Blog draft' },
  mixed: { zh: '混合素材', en: 'Mixed sources' },
};

export const statusLabel: Record<string, { text: string; textEn: string; class: string }> = {
  active: { text: '活跃开发', textEn: 'Active', class: 'ui-badge ui-badge--active' },
  shipped: { text: '已发布', textEn: 'Shipped', class: 'ui-badge ui-badge--active' },
  wip: { text: '构思中', textEn: 'In progress', class: 'ui-badge' },
  archived: { text: '已归档', textEn: 'Archived', class: 'ui-badge' },
};
