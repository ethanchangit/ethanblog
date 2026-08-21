/**
 * 站点与个人资料的单一数据源。
 * 首页（身份）、/now、导航、RSS 都从这里读取 —— 改这里即可全站生效。
 * 更新 Now 页：只改 nowIntro / now / nowUpdated（不要另写一份 MDX）。
 * 「什么是 Now 页」的格式说明（含 nownownow.com 链接）写在 src/pages/now.astro，不放这里。
 */

export const site = {
  title: 'Ethan Chang',
  wordmark: 'ethan.chang',
  description: 'Ethan Chang 的个人博客 —— 文章、笔记与项目。',
  descriptionEn: "Ethan Chang's blog — articles, notes, and projects.",
  url: 'https://ethanchang.io',
  lang: 'en',
} as const;

export const profile = {
  name: 'Ethan Chang',
  chineseName: '张峻源',
  role: ['iOS 开发者', 'AI 工具制作人', '知识管理实践者'],
  bio: '我做原生 iOS 应用，把 LLM 和语音 AI 融进生产力工具，也持续打磨自己的个人知识管理方法。',
  bioEn:
    'I build native iOS apps, fold LLMs and voice AI into productivity tools, and keep refining how I manage knowledge.',
  email: 'hey@ethanchang.io',
  socials: [
    { label: 'Twitter', url: 'https://twitter.com/ethanchang_', icon: 'twitter' },
    { label: 'GitHub', url: 'https://github.com/ethanchangit', icon: 'github' },
    { label: 'Email', url: 'mailto:hey@ethanchang.io', icon: 'mail' },
  ],
} as const;

export interface Skill {
  name: string;
  nameEn?: string;
  domain: '移动端' | '后端' | 'AI' | '工具链';
  level: number; // 0–100
  projects: string[]; // project slugs
}

export const skills: Skill[] = [
  { name: 'Swift / SwiftUI', domain: '移动端', level: 90, projects: ['robert'] },
  { name: 'UIKit', domain: '移动端', level: 75, projects: ['robert'] },
  { name: 'GRDB / SQLite', domain: '移动端', level: 80, projects: ['robert', 'network'] },
  { name: 'TypeScript', domain: '后端', level: 80, projects: ['network'] },
  { name: 'Cloudflare Workers', domain: '后端', level: 78, projects: ['robert'] },
  { name: 'Electron / React', domain: '工具链', level: 72, projects: ['network'] },
  { name: 'LLM 集成', nameEn: 'LLM integration', domain: 'AI', level: 85, projects: ['robert', 'aletheia', 'trace'] },
  { name: '语音 AI（Whisper）', nameEn: 'Voice AI (Whisper)', domain: 'AI', level: 76, projects: ['robert'] },
  { name: '知识管理方法论', nameEn: 'Knowledge management methods', domain: 'AI', level: 88, projects: ['maker-plan', 'network', 'trace'] },
];

export interface NowItem {
  verb: string; // 正在做 / 正在读 / 正在想
  text: string;
  textEn: string;
}

/** 给一年没见的朋友的那几句：这一章在做什么，不是简历。 */
export const nowIntro =
  '眼下主要在写这个博客，把笔记和项目页打磨成我真正愿意给人看的样子。一边用 Heptabase 做深度学习的长期实践，一边在想语音输入能不能把「记下来」这件事的摩擦力降下去。';
export const nowIntroEn =
  "Right now I'm writing this blog, and making the notes and project pages something I'd actually want people to read. I'm also in a long practice of deep learning with Heptabase, and wondering whether voice input can take the friction out of capturing notes.";

export const now: NowItem[] = [
  { verb: '正在做', text: '写博客，打磨笔记与项目页', textEn: 'Writing the blog, refining notes and project pages' },
  { verb: '正在读', text: 'Heptabase 深度学习工作流的长期实践笔记', textEn: 'Long-form notes on a Heptabase deep-learning workflow' },
  { verb: '正在想', text: '语音优先的笔记输入如何降低记录的摩擦力', textEn: 'How voice-first capture can lower the friction of taking notes' },
];

export const nowUpdated = '2026-08-21';
