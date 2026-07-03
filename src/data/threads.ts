/**
 * 研究线（threads）的单一数据源。
 * 每条线是一个长期追问，编号笔记（kind: notebook）通过 frontmatter 的
 * thread/seq 挂在线上 —— 改这里即可全站生效。
 */

export interface Thread {
  slug: string;
  title: string;
  question: string; // 这条线在追问什么
  status: 'active' | 'dormant' | 'closed';
  started: string; // YYYY-MM
  description: string;
}

export const threads: Thread[] = [
  {
    slug: 'web-as-medium',
    title: '把网页当动态媒介',
    question: '一张网页，能不能像房间一样对人做出反应？',
    status: 'active',
    started: '2026-07',
    description:
      '这条线研究一张网页能在多大程度上表现得像一个房间：内容对读者的位置与动作做出反应，而支配这些反应的规则本身可读、可改、可组合。起点是对 Ink & Switch 与 Bret Victor 的 Realtalk/Dynamicland 的调研，落点是用本站的媒介组件做一系列可以亲手玩的实验。',
  },
];

export function getThread(slug: string | undefined): Thread | undefined {
  if (!slug) return undefined;
  return threads.find((t) => t.slug === slug);
}
