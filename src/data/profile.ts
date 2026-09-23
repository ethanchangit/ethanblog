/**
 * 站点身份：名字、邮箱、社交链接和技能。
 * 关于、Now、联系、隐私的正文在 Heptabase，发布副本是 src/content/pages/。
 */

export const site = {
  title: 'Ethan Chang',
  wordmark: 'ethan.chang',
  description: 'Ethan Chang 的个人博客 —— 文章、笔记与项目。',
  url: 'https://ethanchang.io',
  lang: 'zh-CN',
} as const;

export const profile = {
  name: 'Ethan Chang',
  chineseName: '张峻源',
  role: ['iOS 开发者', 'AI 工具制作人', '知识管理实践者'],
  bio: '我做原生 iOS 应用，把 LLM 和语音 AI 融进生产力工具，也持续打磨自己的个人知识管理方法。',
  email: 'hey@ethanchang.io',
  socials: [
    { label: 'Twitter', url: 'https://twitter.com/ethanchang_', icon: 'twitter' },
    { label: 'GitHub', url: 'https://github.com/ethanchangit', icon: 'github' },
    { label: 'Email', url: 'mailto:hey@ethanchang.io', icon: 'mail' },
  ],
} as const;

export interface Skill {
  name: string;
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
  { name: 'LLM 集成', domain: 'AI', level: 85, projects: ['robert', 'aletheia', 'trace'] },
  { name: '语音 AI（Whisper）', domain: 'AI', level: 76, projects: ['robert'] },
  { name: '知识管理方法论', domain: 'AI', level: 88, projects: ['maker-plan', 'network', 'trace'] },
];
