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
    navAbout: '关于',
    themeAria: '切换浅色/深色模式',
    themeTitle: '切换主题',
    langAria: '当前语言：中文，点击切换为英文',
    skipToContent: '跳到正文',
    hello: '你好，我是',
    viewWork: '看项目 →',
    heroBio:
      '我做原生 iOS 应用，把 LLM 和语音 AI 融进生产力工具，也持续打磨自己的个人知识管理方法。',
    roleIos: 'iOS 开发者',
    roleAi: 'AI 工具制作人',
    rolePkm: '知识管理实践者',
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
    articlesDesc: '文章与研究笔记。',
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
    aboutLead: '媒介是我们的工具，目标是传递价值。',
    aboutIos: 'iOS 开发 —— 用 Swift 和 SwiftUI 构建原生应用',
    aboutAi: 'AI 集成 —— 用 LLM 和语音 AI 增强生产力工具',
    aboutPkm: '个人知识管理 —— 打造帮助捕捉和组织思考的工具与方法',
    labTitle: '组件试验场',
    labDesc: '媒介组件试验场',
    labLead: '媒介组件库的现场演示与 QA 页面。',
    kindInteractive: '互动故事',
    kindEssay: '文章',
    updatedPrefix: '更新于',
    sourcePrefix: '原始素材：',
    abstract: '摘要',
    citeHeading: '请这样引用',
    recruitHeading: '如果你也在想这个问题',
    recruitBody: '这篇内容的反馈、反驳、延伸讨论，都欢迎写信来聊。',
    threadLabel: '研究线：',
    noteHash: '笔记 #',
    prevNextAria: '前后篇',
    visitSite: '访问网站 ↗',
    githubRepo: 'GitHub 仓库 ↗',
    downloads: '下载',
    techStack: '技术栈',
    backToProjects: '← 返回项目',
    statusActive: '活跃开发',
    statusShipped: '已发布',
    statusWip: '构思中',
    statusArchived: '已归档',
    sourceChat: '对话记录',
    sourceNotes: '个人笔记',
    sourceBlog: '博客草稿',
    sourceMixed: '混合素材',
    pageHistory: '这一页如何长成 · {n} 次修订',
    historyPublish: '发布',
    historyRevise: '修订',
    historyUpdate: '更新',
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
    sourceView: '⌥ 源码',
    citeBy: '文 /',
    citeMonth: '{y}年{m}月',
    tweetView: '在 X 上查看',
    tweetUnavailable: '无法载入这条帖子，点击查看原文。',
  },
  en: {
    navArticles: 'Articles',
    navProjects: 'Projects',
    navAbout: 'About',
    themeAria: 'Toggle light/dark mode',
    themeTitle: 'Toggle theme',
    langAria: 'Current language: English. Click to switch to Chinese',
    skipToContent: 'Skip to content',
    hello: "Hi, I'm",
    viewWork: 'See projects →',
    heroBio:
      'I build native iOS apps, fold LLMs and voice AI into productivity tools, and keep refining how I manage knowledge.',
    roleIos: 'iOS developer',
    roleAi: 'AI toolmaker',
    rolePkm: 'Knowledge management practitioner',
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
    articlesDesc: 'Essays and research notes.',
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
    aboutLead: 'Media are our tools; the goal is to pass value along.',
    aboutIos: 'iOS development — native apps in Swift and SwiftUI',
    aboutAi: 'AI integration — LLMs and voice AI inside productivity tools',
    aboutPkm: 'Personal knowledge management — tools and methods for catching and organizing thought',
    labTitle: 'Component lab',
    labDesc: 'Media component lab',
    labLead: 'Live demos and QA for the media component library.',
    kindInteractive: 'Interactive',
    kindEssay: 'Essay',
    updatedPrefix: 'Updated',
    sourcePrefix: 'Source: ',
    abstract: 'Abstract',
    citeHeading: 'Cite this page',
    recruitHeading: 'If you are thinking about this too',
    recruitBody: 'Feedback, disagreement, further discussion — write me.',
    threadLabel: 'Thread: ',
    noteHash: 'Note #',
    prevNextAria: 'Previous and next',
    visitSite: 'Visit site ↗',
    githubRepo: 'GitHub repo ↗',
    downloads: 'Downloads',
    techStack: 'Stack',
    backToProjects: '← Back to projects',
    statusActive: 'Active',
    statusShipped: 'Shipped',
    statusWip: 'In progress',
    statusArchived: 'Archived',
    sourceChat: 'Chat log',
    sourceNotes: 'Personal notes',
    sourceBlog: 'Blog draft',
    sourceMixed: 'Mixed sources',
    pageHistory: 'How this page grew · {n} revisions',
    historyPublish: 'Published',
    historyRevise: 'Revised',
    historyUpdate: 'Updated',
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
    sourceView: '⌥ Source',
    citeBy: 'By',
    citeMonth: '{m} {y}',
    tweetView: 'View on X',
    tweetUnavailable: 'Could not load this post. Click to view the original.',
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
