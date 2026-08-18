/**
 * 研究线（threads）的单一数据源。
 * 每条线是一个长期追问，编号笔记（kind: notebook）通过 frontmatter 的
 * thread/seq 挂在线上 —— 改这里即可全站生效。
 */

export interface Thread {
  slug: string;
  title: string;
  titleEn: string;
  question: string;
  questionEn: string;
  status: 'active' | 'dormant' | 'closed';
  started: string; // YYYY-MM
  description: string;
  descriptionEn: string;
}

export const threads: Thread[] = [
  {
    slug: 'web-as-medium',
    title: '把网页当动态媒介',
    titleEn: 'The web as a dynamic medium',
    question: '一张网页，能不能像房间一样对人做出反应？',
    questionEn: 'Can a web page respond to a person the way a room does?',
    status: 'active',
    started: '2026-07',
    description:
      '这条线研究一张网页能在多大程度上表现得像一个房间：内容对读者的位置与动作做出反应，而支配这些反应的规则本身可读、可改、可组合。起点是对 Ink & Switch 与 Bret Victor 的 Realtalk/Dynamicland 的调研，落点是用本站的媒介组件做一系列可以亲手玩的实验。',
    descriptionEn:
      'This thread asks how far a web page can behave like a room: content that reacts to where the reader is and what they do, with the rules themselves readable, editable, and composable. It starts from Ink & Switch and Bret Victor’s Realtalk/Dynamicland, and lands in experiments you can play with on this site.',
  },
];

export function getThread(slug: string | undefined): Thread | undefined {
  if (!slug) return undefined;
  return threads.find((t) => t.slug === slug);
}
