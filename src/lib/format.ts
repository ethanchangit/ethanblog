export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

/** 研究线笔记编号：两位补零（1 → "01"）。 */
export function formatSeq(seq: number): string {
  return String(seq).padStart(2, '0');
}

/** 溯源行的素材类型中文标签（stories frontmatter source.type → 页眉展示） */
export const sourceTypeLabel: Record<string, string> = {
  chat: '对话记录',
  notes: '个人笔记',
  blog: '博客草稿',
  mixed: '混合素材',
};

export const statusLabel: Record<string, { text: string; class: string }> = {
  active: { text: '活跃开发', class: 'ui-badge ui-badge--active' },
  shipped: { text: '已发布', class: 'ui-badge ui-badge--active' },
  wip: { text: '构思中', class: 'ui-badge' },
  archived: { text: '已归档', class: 'ui-badge' },
};
