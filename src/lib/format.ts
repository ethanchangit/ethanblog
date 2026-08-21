export function formatDate(date: Date, lang: 'zh-CN' | 'en' = 'en'): string {
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

/** 推文卡页脚：时间 · 日期，对齐官方 embed 的阅读节奏。 */
export function formatTweetStamp(date: Date, lang: 'zh-CN' | 'en' = 'en'): string {
  const locale = lang === 'en' ? 'en-US' : 'zh-CN';
  const time = new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit' }).format(date);
  return `${time} · ${formatDate(date, lang)}`;
}

export const statusLabel: Record<string, { text: string; textEn: string; class: string }> = {
  active: { text: '活跃开发', textEn: 'Active', class: 'ui-badge ui-badge--active' },
  shipped: { text: '已发布', textEn: 'Shipped', class: 'ui-badge ui-badge--active' },
  wip: { text: '构思中', textEn: 'In progress', class: 'ui-badge' },
  archived: { text: '已归档', textEn: 'Archived', class: 'ui-badge' },
};
