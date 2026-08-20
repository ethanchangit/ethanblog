/**
 * Chrome-level bilingual layer (zh-CN / en).
 * MDX article/project bodies are not translated here — only shell UI.
 * Preference lives in localStorage; SSR default is Chinese, matching the site today.
 */

export type Lang = 'zh-CN' | 'en';

export const LANG_STORAGE_KEY = 'lang';
export const LANG_EVENT = 'ethan:lang';

export const copy = {
  'zh-CN': {
    navArticles: '文章',
    navProjects: '项目',
    navTags: '标签',
    navAbout: '关于',
    navSearch: '搜索',
    navHome: '首页',
    searchTitle: '搜索',
    searchDesc: '搜索已发布的文章。',
    searchLabel: '搜索文章',
    searchPlaceholder: '标题、摘要或标签',
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
    backHome: '回到主页',
    siteBlog: '博客',
    articlesTitle: '文章',
    articlesDesc: '文章。',
    articlesEarlier: '更早',
    articlesNewer: '更新',
    articlesPagerAria: '文章分页',
    seriesNavAria: '系列导航',
    seriesChapters: '篇目',
    seriesPrev: '上一篇',
    seriesNext: '下一篇',
    tagsTitle: '标签',
    tagsDesc: '按标签浏览文章。',
    tagsAll: '全部',
    tagsDomainsAria: '按领域筛选',
    tagsListAria: '全部标签',
    tagsEmpty: '没有匹配的标签。',
    tagsNoDocs: '没有匹配的文档。',
    tagPageDesc: '带有此标签的文章。',
    backToTags: '← 全部标签',
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
    aboutLead: '媒介是我们的工具，目标是传递真正的价值。',
    aboutIos: 'iOS 开发 —— 用 Swift 和 SwiftUI 构建原生应用',
    aboutAi: 'AI 集成 —— 用 LLM 和语音 AI 增强生产力工具',
    aboutPkm: '个人知识管理 —— 打造帮助捕捉和组织思考的工具与方法',
    labTitle: '组件试验场',
    labDesc: '媒介组件试验场',
    labLead: '媒介组件库的现场演示与 QA 页面。',
    updatedPrefix: '更新于',
    abstract: '摘要',
    commentsHeading: '留言',
    commentsEmpty: '还没有人留言。',
    commentsName: '名字',
    commentsBody: '说点什么',
    commentsSubmit: '发送',
    commentsError: '没能记下，请稍后再试。',
    commentsPublic: '公开',
    commentsPrivate: '私密',
    commentsPrivateMark: '私密',
    commentsPrivateSaved: '已记下，仅作者可见。',
    commentsVisAria: '留言可见范围',
    visitSite: '访问网站 ↗',
    githubRepo: 'GitHub 仓库 ↗',
    downloads: '下载',
    techStack: '技术栈',
    backToArticles: '← 文章',
    backToProjects: '← 返回项目',
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
  en: {
    navArticles: 'Articles',
    navProjects: 'Projects',
    navTags: 'Tags',
    navAbout: 'About',
    navSearch: 'Search',
    navHome: 'Home',
    searchTitle: 'Search',
    searchDesc: 'Search published articles.',
    searchLabel: 'Search articles',
    searchPlaceholder: 'Title, summary, or tag',
    searchEmpty: 'No matching articles.',
    themeAria: 'Toggle light/dark mode',
    themeTitle: 'Toggle theme',
    langAria: 'Choose language',
    langListAria: 'Language',
    skipToContent: 'Skip to content',
    hello: "Hi, I'm",
    viewWork: 'See projects →',
    heroBio:
      'I build native iOS apps, fold LLMs and voice AI into productivity tools, and keep refining how I manage knowledge.',
    nowAria: 'Now',
    nowUpdated: 'Updated',
    nowDoing: 'Building',
    nowReading: 'Reading',
    nowThinking: 'Thinking',
    skillsAria: 'Skills',
    skillsTitle: 'What I build with',
    contactAria: 'Contact',
    contactTitle: 'Want to talk?',
    contactBody: 'About writing, projects, or anything else — write me.',
    aboutStack: 'Stack',
    aboutContact: 'Contact',
    aboutDoing: 'What I do',
    signOut: 'Sign out',
    bookmark: 'Save',
    bookmarked: 'Saved',
    bookmarkAria: 'Save this article',
    unbookmarkAria: 'Remove bookmark',
    copyUrl: 'COPY URL',
    copyUrlCopied: 'Copied',
    copyUrlAria: 'Copy page URL',
    proficiency: 'proficiency',
    usedIn: 'Used in',
    pickSkill: 'Pick a skill to see proficiency and where it shows up.',
    domainMobile: 'Mobile',
    domainBackend: 'Backend',
    domainAI: 'AI',
    domainTools: 'Tooling',
    notFoundTitle: 'This page does not exist',
    notFoundBody: 'It may have moved, or it never existed.',
    backHome: 'Back home',
    siteBlog: 'Blog',
    articlesTitle: 'Articles',
    articlesDesc: 'Articles.',
    articlesEarlier: 'Earlier',
    articlesNewer: 'Newer',
    articlesPagerAria: 'Article pages',
    seriesNavAria: 'Series navigation',
    seriesChapters: 'Chapters',
    seriesPrev: 'Previous',
    seriesNext: 'Next',
    tagsTitle: 'Tags',
    tagsDesc: 'Browse articles by tag.',
    tagsAll: 'All',
    tagsDomainsAria: 'Filter by domain',
    tagsListAria: 'All tags',
    tagsEmpty: 'No matching tags.',
    tagsNoDocs: 'No matching documents.',
    tagPageDesc: 'Articles with this tag.',
    backToTags: '← All tags',
    projectsTitle: 'Projects',
    projectsH1: 'Projects are a lineage',
    projectsDesc:
      'The software I make is not a grid of cards — it is a research line, each project inheriting what the last one proved.',
    projectsLead:
      'This is not a portfolio index. Scroll and you will see how the software inherits: the word highlighting that worked in Aletheia is reused in Trace; the card structure honed in Network is reused in Chunk.',
    projectsLineageH2: 'Timeline: from cards to a container',
    projectsLineageP:
      'If each project is an experiment, they are not parallel SKUs but a line of inquiry. First: how to capture. Then: how to read. Finally: what happens when notes pile up.',
    projectsEdgesIntro: 'Three explicit hand-offs:',
    projectsArchiveH2: 'Project files',
    projectsArchiveP: 'Need the repo, stack, or a fuller write-up? Each project still has its own file:',
    aboutLead: 'Media are our tools; the goal is to deliver true value.',
    aboutIos: 'iOS development — native apps in Swift and SwiftUI',
    aboutAi: 'AI integration — LLMs and voice AI inside productivity tools',
    aboutPkm: 'Personal knowledge management — tools and methods for catching and organizing thought',
    labTitle: 'Component lab',
    labDesc: 'Media component lab',
    labLead: 'Live demos and QA for the media component library.',
    updatedPrefix: 'Updated',
    abstract: 'Abstract',
    commentsHeading: 'Comments',
    commentsEmpty: 'No comments yet.',
    commentsName: 'Name',
    commentsBody: 'Write a message',
    commentsSubmit: 'Send',
    commentsError: 'Could not save. Try again in a moment.',
    commentsPublic: 'Public',
    commentsPrivate: 'Private',
    commentsPrivateMark: 'Private',
    commentsPrivateSaved: 'Saved — only the author can see this.',
    commentsVisAria: 'Comment visibility',
    visitSite: 'Visit site ↗',
    githubRepo: 'GitHub repo ↗',
    downloads: 'Downloads',
    techStack: 'Stack',
    backToArticles: '← Articles',
    backToProjects: '← Back to projects',
    statusActive: 'Active',
    statusShipped: 'Shipped',
    statusWip: 'In progress',
    statusArchived: 'Archived',
    toc: 'Contents',
    tocAria: 'Table of contents',
    demoReload: '↻ Reload',
    demoFullscreen: 'Fullscreen ↗',
    demoStart: '▶ Start demo',
    demoSandbox: 'The demo runs in an on-page sandbox',
    demoNewWindow: 'Open demo in a new window ↗',
    audioPlay: 'Play',
    audioPause: 'Pause',
    audioSeek: 'Click to seek',
    paramHint: 'Drag the slider →',
    tweetView: 'View on X',
    tweetUnavailable: 'Could not load this post.',
    tweetVerified: 'Verified',
    videoPlayHint: 'Click the image to play',
    videoWatchYoutube: 'Watch on YouTube ↗',
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
  return copy[lang][key];
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

export function resolveLang(stored: string | null): Lang {
  return stored === 'en' ? 'en' : 'zh-CN';
}

export function getStoredLang(): Lang | null {
  if (typeof localStorage === 'undefined') return null;
  const value = localStorage.getItem(LANG_STORAGE_KEY);
  return value === 'en' || value === 'zh-CN' ? value : null;
}

export function readLang(): Lang {
  if (typeof document === 'undefined') return 'zh-CN';
  if (document.documentElement.lang === 'en') return 'en';
  return resolveLang(getStoredLang());
}

function syncChrome(lang: Lang) {
  document.querySelectorAll('.i18n-zh, .i18n-zh-block, .i18n-zh-only').forEach((el) => {
    el.setAttribute('aria-hidden', lang === 'en' ? 'true' : 'false');
  });
  document.querySelectorAll('.i18n-en, .i18n-en-block, .i18n-en-only').forEach((el) => {
    el.setAttribute('aria-hidden', lang === 'en' ? 'false' : 'true');
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-aria]').forEach((el) => {
    const key = el.dataset.i18nAria as CopyKey | undefined;
    if (key && key in copy['zh-CN']) {
      el.setAttribute('aria-label', t(lang, key));
    }
  });
  document.querySelectorAll<HTMLInputElement>('[data-i18n-placeholder]').forEach((el) => {
    const key = el.dataset.i18nPlaceholder as CopyKey | undefined;
    if (key && key in copy['zh-CN']) {
      el.placeholder = t(lang, key);
    }
  });
}

function syncDocumentMeta(lang: Lang) {
  const root = document.documentElement;
  const title = lang === 'en' ? root.dataset.titleEn : root.dataset.titleZh;
  if (title) document.title = title;
  const desc = lang === 'en' ? root.dataset.descEn : root.dataset.descZh;
  const meta = document.querySelector('meta[name="description"]');
  if (meta && desc) meta.setAttribute('content', desc);
}

export function applyLang(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.lang = lang;
  document.documentElement.dataset.lang = lang;
  syncChrome(lang);
  syncDocumentMeta(lang);
  document.dispatchEvent(new CustomEvent<Lang>(LANG_EVENT, { detail: lang }));
}

export function setLang(lang: Lang) {
  localStorage.setItem(LANG_STORAGE_KEY, lang);
  applyLang(lang);
}

export function toggleLang(): Lang {
  const next: Lang = readLang() === 'en' ? 'zh-CN' : 'en';
  setLang(next);
  return next;
}

let started = false;

export function initLang() {
  applyLang(resolveLang(getStoredLang()));
  if (started) return;
  started = true;
  document.addEventListener('astro:after-swap', () => {
    applyLang(resolveLang(getStoredLang()));
  });
}

export function subscribeLang(cb: (lang: Lang) => void): () => void {
  if (typeof document === 'undefined') return () => {};
  cb(readLang());
  const handler = (event: Event) => {
    cb((event as CustomEvent<Lang>).detail);
  };
  document.addEventListener(LANG_EVENT, handler);
  return () => document.removeEventListener(LANG_EVENT, handler);
}
