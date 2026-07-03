export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
}

export const statusLabel: Record<string, { text: string; class: string }> = {
  active: { text: '活跃开发', class: 'bg-accent-900/60 text-accent-300' },
  shipped: { text: '已发布', class: 'bg-primary-900/60 text-primary-300' },
  wip: { text: '构思中', class: 'bg-surface-800 text-ink-400' },
  archived: { text: '已归档', class: 'bg-surface-800 text-ink-500' },
};
