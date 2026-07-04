/**
 * 作品页的叙事数据：时间线与项目间的继承关系。
 * 单一数据源，供 /projects 超媒体长页引用。
 */

export interface LineageEdge {
  from: string;
  to: string;
  /** 继承了什么能力 */
  carries: string;
}

/** 项目 slug → 继承自哪些项目 */
export const lineageEdges: LineageEdge[] = [
  {
    from: 'aletheia',
    to: 'trace',
    carries: '生词高亮与一键生成学习卡片',
  },
  {
    from: 'network',
    to: 'chunk',
    carries: '卡片式内容单元与键盘导航范式',
  },
  {
    from: 'robert',
    to: 'chunk',
    carries: '块级笔记与语音入口的低摩擦记录',
  },
];

export const lineageTimeline = [
  {
    date: '已发布',
    title: 'Network',
    icon: '⌨',
    body: '在桌面上验证「卡片 + 键盘」能否让重度写作者双手不离开键盘完成全部操作。',
  },
  {
    date: '活跃开发',
    title: 'Robert',
    icon: '🎙',
    body: '把记录的摩擦力压到最低：语音进来，块级卡片出去。',
  },
  {
    date: '实验中',
    title: 'Aletheia',
    icon: '🔍',
    body: '阅读长文时的生词标注、高亮与卡片生成——研究分析的草稿间。',
  },
  {
    date: '继承 Aletheia',
    title: 'Trace',
    icon: '✦',
    body: '把 Aletheia 里试通的 highlight → 卡片流水线，收敛成独立的阅读学习工具。',
  },
  {
    date: '继承 Network',
    title: 'Chunk',
    icon: '🧩',
    body: '当笔记涨到数千条，Network 的卡片结构能否撑住「越积越多而不越乱」？',
  },
  {
    date: '元作品',
    title: 'ethanchang.io',
    icon: '◎',
    body: '你正在看的容器：把上述实验嵌进同一套超媒介引擎里展示。',
  },
] as const;
