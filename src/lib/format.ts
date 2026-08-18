export function formatDate(date: Date, lang: 'zh-CN' | 'en' = 'zh-CN'): string {
  return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** 推文卡页脚：时间 · 日期，对齐官方 embed 的阅读节奏。 */
export function formatTweetStamp(date: Date, lang: 'zh-CN' | 'en' = 'zh-CN'): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${time} · ${formatDate(date, lang)}`;
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
