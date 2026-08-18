/**
 * 项目集合页的叙事数据：时间线与项目间的继承关系。
 * 单一数据源，供 /projects 集合页引用。
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

export const lineageTimeline = [
  {
    date: '已发布',
    dateEn: 'Shipped',
    title: 'Network',
    icon: '⌨',
    href: '/projects/network',
    body: '在桌面上验证「卡片 + 键盘」能否让重度写作者双手不离开键盘完成全部操作。',
    bodyEn:
      'On the desktop: can a heavy writer do everything without leaving the keyboard, if the unit of work is a card?',
  },
  {
    date: '活跃开发',
    dateEn: 'Active',
    title: 'Robert',
    icon: '🎙',
    href: '/projects/robert',
    body: '把记录的摩擦力压到最低：语音进来，块级卡片出去。',
    bodyEn: 'Drive capture friction as close to zero as it will go: voice in, block-level cards out.',
  },
  {
    date: '实验中',
    dateEn: 'Experiment',
    title: 'Aletheia',
    icon: '🔍',
    href: '/projects/aletheia',
    body: '阅读长文时的生词标注、高亮与卡片生成——研究分析的草稿间。',
    bodyEn:
      'Marking unfamiliar words, highlighting, and turning them into cards while reading — a lab for research and analysis.',
  },
  {
    date: '继承 Aletheia',
    dateEn: 'From Aletheia',
    title: 'Trace',
    icon: '✦',
    href: '/projects/trace',
    body: '把 Aletheia 里试通的 highlight → 卡片流水线，收敛成独立的阅读学习工具。',
    bodyEn:
      'The highlight-to-card pipeline that worked in Aletheia, tightened into a reading-and-learning product of its own.',
  },
  {
    date: '继承 Network',
    dateEn: 'From Network',
    title: 'Chunk',
    icon: '🧩',
    href: '/projects/chunk',
    body: '当笔记涨到数千条，Network 的卡片结构能否撑住「越积越多而不越乱」？',
    bodyEn:
      'When notes reach the thousands, can Network’s card structure still mean “more without messier”?',
  },
  {
    date: '元作品',
    dateEn: 'Meta-work',
    title: 'ethanchang.io',
    icon: '◎',
    href: '/projects/ethanchang-io',
    body: '你正在看的容器：把上述实验嵌进同一套超媒介引擎里展示。',
    bodyEn: 'The container you are in: those experiments, nested in one hypermedia engine.',
  },
] as const;
