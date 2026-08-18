/**
 * 项目集合页上的继承边。节点本身来自 projects 内容集合，不在这里复述摘要。
 */

export interface LineageEdge {
  from: string;
  to: string;
  /** 继承了什么能力 */
  carries: string;
  carriesEn: string;
}

/** 项目 slug → 继承自哪些项目 */
export const lineageEdges: LineageEdge[] = [
  {
    from: 'aletheia',
    to: 'trace',
    carries: '生词高亮与一键生成学习卡片',
    carriesEn: 'word highlighting and one-tap study cards',
  },
  {
    from: 'network',
    to: 'chunk',
    carries: '卡片式内容单元与键盘导航范式',
    carriesEn: 'card-shaped content units and keyboard navigation',
  },
  {
    from: 'robert',
    to: 'chunk',
    carries: '块级笔记与语音入口的低摩擦记录',
    carriesEn: 'block-level notes and low-friction voice capture',
  },
];

/** Timeline 左侧符号；不是摘要，文案走 frontmatter description。 */
export const lineageIcons: Record<string, string> = {
  network: '⌨',
  robert: '🎙',
  aletheia: '🔍',
  trace: '✦',
  chunk: '🧩',
  'ethanchang-io': '◎',
};
