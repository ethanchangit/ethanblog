/** 站点只有中文版。`Lang` 仍留着，是为了现有调用能编译。 */
export type Lang = 'zh-CN' | 'en';
export const DEFAULT_LANG = 'zh-CN' as const;
export const LANG_STORAGE_KEY = 'lang';
export const LANG_EVENT = 'ethan:lang';

export const copy = {
  'zh-CN': {
    navArticles: '文章',
    navProjects: '项目',
    navBlogs: '博客',
    navTags: '标签',
    navAbout: '关于',
    navNow: '现在',
    navContact: '联系',
    navPrivacy: '隐私',
    navSearch: '搜索',
    navHome: '首页',
    navPages: '站点页面',
    indexSwitchAria: '文章与项目',
    searchTitle: '搜索',
    searchDesc: '搜索已发布的文章、项目与引用资料全文。',
    searchLabel: '搜索文章',
    searchPlaceholder: '搜索标题、标签或正文',
    searchEmpty: '没有匹配的文章。',
    themeAria: '切换浅色/深色模式',
    themeTitle: '切换主题',
    langAria: '选择语言',
    langListAria: '语言',
    skipToContent: '跳到正文',
    hello: '你好，我是',
    viewWork: '看项目 →',
    heroBio:
      '我做原生 iOS 应用，把 LLM 和语音 AI 融进生产力工具，也持续打磨自己的个人知识管理方法。',
    nowAria: '正在进行',
    nowUpdated: '更新于',
    nowDoing: '正在做',
    nowReading: '正在读',
    nowThinking: '正在想',
    skillsAria: '技能',
    skillsTitle: '我用什么造东西',
    contactAria: '联系',
    contactTitle: '想聊聊？',
    contactBody: '关于文章、项目或任何想法，欢迎来信。',
    aboutStack: '技术栈',
    aboutContact: '联系我',
    aboutDoing: '我在做什么',
    signOut: '退出登录',
    bookmark: '收藏',
    bookmarked: '已收藏',
    bookmarkAria: '收藏此文章',
    unbookmarkAria: '取消收藏',
    copyUrl: '复制链接',
    copyUrlCopied: '已复制',
    copyUrlAria: '复制本页链接',
    proficiency: '熟练度',
    usedIn: '用在了这些项目里',
    pickSkill: '点一个技能，看熟练度以及它被用在了哪些项目里。',
    domainMobile: '移动端',
    domainBackend: '后端',
    domainAI: 'AI',
    domainTools: '工具链',
    notFoundTitle: '这个页面不存在',
    notFoundBody: '它可能被移动了，或者从未存在过。',
    notFoundTry: '试试这些入口：',
    notFoundAgents: 'ethanchang.io 给 agent 的开发者资源',
    notFoundLlms: 'llms.txt',
    notFoundSitemap: '站点地图',
    notFoundContact: '联系',
    notFoundPrivacy: '隐私',
    backHome: '回到主页',
    contactPageTitle: '联系',
    contactPageDesc: '写信到 hey@ethanchang.io。没有工单，没有会把信发进虚空的表单。',
    privacyTitle: '隐私',
    privacyDesc: '阅读不需要账号。可选登录只同步收藏和进度。留言发到邮箱，不出现在页面上。',
    forAgentsTitle: 'ethanchang.io 给 agent 的开发者资源',
    forAgentsDesc: '同一 URL 的 Markdown、llms.txt、RSS 与实际存在的接口。这里没有对外 MCP。',
    aboutHowTitle: '怎么读这个网站',
    aboutHowArticlesTitle: '文章和项目',
    aboutHowArticlesBody:
      '文章是我愿意给人看的笔记。项目是一条软件研究线，不是作品集格子。Now 页是最近在做什么，不是简历。',
    aboutHowMachineTitle: '给机器看的副本',
    aboutHowContactTitle: '联系与隐私',
    siteBlog: '博客',
    articlesTitle: '文章',
    articlesDesc: '文章。',
    articlesEarlier: '更早',
    articlesNewer: '更新',
    articlesPagerAria: '文章分页',
    seriesNavAria: '系列导航',
    seriesChapters: '篇目',
    docListAria: '引用',
    seriesPrev: '上一篇',
    seriesNext: '下一篇',
    seriesCloseChild: '关闭',
    tagsTitle: '标签',
    tagsDesc: '按标签浏览文章。',
    tagsAll: '全部',
    tagsDomainsAria: '按领域筛选',
    tagsListAria: '全部标签',
    tagsEmpty: '没有匹配的标签。',
    tagsNoDocs: '没有匹配的文档。',
    tagPageDesc: '带有此标签的文章。',
    backToTags: '← 全部标签',
    blogsTitle: '博客',
    blogsDesc: '手工引用的文章与项目，不自动收录整个文件夹。',
    blogsLead: '这里不是文章列表的镜像。每一行都是我在 MDX 里写上的引用。',
    projectsTitle: '项目',
    projectsH1: '项目是一条线',
    projectsDesc: '我做的软件不是一排卡片，而是一条研究线——每个项目都在继承上一个项目里试通的能力。',
    projectsLead:
      '这不是项目集导航页。往下滚，你会看到我做过的软件如何彼此继承——在 Aletheia 里试通的生词高亮，在 Trace 里复用；在 Network 里打磨的卡片结构，在 Chunk 里复用。',
    projectsLineageH2: '时间线：从卡片到容器',
    projectsLineageP:
      '如果把每个项目看成一次实验，它们不是并列的 SKU，而是一条递进的研究线。先解决「怎么记」，再解决「怎么读」，最后问「记多了怎么办」。',
    projectsEdgesIntro: '三条明确的能力传递：',
    projectsArchiveH2: '项目档案',
    projectsArchiveP: '需要仓库链接、技术栈或完整说明？每个项目仍有独立档案页：',
    aboutLead: '媒介是我们的工具，目标是通过解决问题，传递真正的价值。',
    aboutIos: 'iOS 开发 —— 用 Swift 和 SwiftUI 构建原生应用',
    aboutAi: 'AI 集成 —— 用 LLM 和语音 AI 增强生产力工具',
    aboutPkm: '个人知识管理 —— 打造帮助捕捉和组织思考的工具与方法',
    labTitle: '组件试验场',
    labDesc: '媒介组件试验场',
    labLead: '媒介组件库的现场演示与 QA 页面。',
    updatedPrefix: '更新于',
    abstract: '摘要',
    commentsHeading: '留言',
    commentsHint: '写完会发到我的邮箱，不会出现在这页上。',
    commentsName: '名字',
    commentsEmail: '邮箱',
    commentsBody: '说点什么',
    commentsSubmit: '发送',
    commentsError: '没能发出，请稍后再试。',
    commentsSent: '已送到我的邮箱。',
    visitSite: '访问网站 ↗',
    githubRepo: 'GitHub 仓库 ↗',
    downloads: '下载',
    techStack: '技术栈',
    backToArticles: '← 文章',
    backToProjects: '← 返回项目',
    expandReading: '展开完整列表',
    collapseReading: '收起至首页',
    statusActive: '活跃开发',
    statusShipped: '已发布',
    statusWip: '构思中',
    statusArchived: '已归档',
    toc: '目录',
    tocAria: '目录',
    demoReload: '↻ 重载',
    demoFullscreen: '全屏 ↗',
    demoStart: '▶ 启动演示',
    demoSandbox: '演示将在页面内沙箱中运行',
    demoNewWindow: '在新窗口打开演示 ↗',
    audioPlay: '播放',
    audioPause: '暂停',
    audioSeek: '点击跳转',
    paramHint: '拖动滑块试试 →',
    tweetView: '在 X 上查看',
    tweetUnavailable: '无法载入这条帖子。',
    tweetVerified: '已认证',
    videoPlayHint: '点击封面播放',
    videoWatchYoutube: '在 YouTube 观看 ↗',
  },
} as const;

export type CopyKey = keyof typeof copy['zh-CN'];

export const DOMAIN_KEYS = {
  移动端: 'domainMobile',
  后端: 'domainBackend',
  AI: 'domainAI',
  工具链: 'domainTools',
} as const satisfies Record<string, CopyKey>;

export const NOW_VERB_KEYS = {
  正在做: 'nowDoing',
  正在读: 'nowReading',
  正在想: 'nowThinking',
} as const satisfies Record<string, CopyKey>;

export function t(lang: Lang, key: CopyKey): string {
  return copy['zh-CN'][key];
}

export function tf(lang: Lang, key: CopyKey, vars: Record<string, string | number>): string {
  return t(lang, key).replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));
}

export function domainKey(domain: string): CopyKey | null {
  if (domain in DOMAIN_KEYS) return DOMAIN_KEYS[domain as keyof typeof DOMAIN_KEYS];
  return null;
}

export function nowVerbKey(verb: string): CopyKey | null {
  if (verb in NOW_VERB_KEYS) return NOW_VERB_KEYS[verb as keyof typeof NOW_VERB_KEYS];
  return null;
}


export function resolveLang(_stored: string | null): Lang { return 'zh-CN'; }
export function getStoredLang(): Lang { return 'zh-CN'; }
export function langFromEnvironment(): Lang { return 'zh-CN'; }
export function readLang(): Lang { return 'zh-CN'; }
export function applyLang(_lang: Lang = 'zh-CN') {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = 'zh-CN';
  document.documentElement.dataset.lang = 'zh-CN';
  document.querySelectorAll('[data-i18n-aria]').forEach(el => {
    const key = el.getAttribute('data-i18n-aria') as CopyKey;
    if (key in copy['zh-CN']) el.setAttribute('aria-label', t('zh-CN', key));
  });
}
let started = false;
export function initLang() {
  applyLang();
  if (started) return;
  started = true;
  document.addEventListener('astro:after-swap', () => applyLang());
}
export function subscribeLang(cb: (lang: Lang) => void): () => void {
  cb('zh-CN');
  return () => {};
}
