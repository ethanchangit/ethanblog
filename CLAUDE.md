# CLAUDE.md - ethanchang.io 项目指南

> 整体框架计划与分阶段路线图见 [docs/ROADMAP.md](docs/ROADMAP.md)。

## 项目信息

- **定位**: 超媒体个人主页 —— 不是博客，是一个持续加功能的"软件"
- **框架**: Astro 5（islands 架构）+ Svelte 5（runes）+ MDX + Tailwind CSS v4 + GSAP
- **部署**: Cloudflare Pages（项目名 `ethanblog`）
- **域名**: https://ethanchang.io

## 常用命令

```bash
npm run dev        # 本地开发（端口 4321）
npm run build      # 生产构建，输出到 dist/
npm run preview    # 静态伺服 dist/（Cloudflare adapter 不支持 astro preview）
npm run check      # astro check：类型 + 内容 schema 校验
npm run deploy     # 构建并手动部署到 Cloudflare Pages
```

## 项目结构

```
src/
  styles/global.css        设计 token（@theme）+ 基础样式 + prose + .media-frame
  content.config.ts        stories / projects 两个内容集合的 schema
  data/profile.ts          个人资料单一数据源（姓名/bio/skills/now/社交）
  lib/                     viz/registry.ts（canvas 绘制注册表）、motion.ts、format.ts、user.ts（Phase 2 接缝）
  layouts/                 Base / Story / Project
  components/shell/        Nav / Footer / Card / SectionHeading
  components/home/         Hero / NowPanel / SkillsGraph / FeaturedGrid
  components/media/        ★ 媒介组件库（见其 README.md，契约必读）
  pages/                   index / stories / projects / about / lab / 404 / rss.xml.ts
  content/stories/*.mdx    故事（kind: interactive | essay）
  content/projects/*.mdx   项目（结构化 frontmatter：repo/downloads/screenshots/demo）
public/
  demos/<name>/index.html  自包含软件演示包（InteractiveDemo 加载）
  media/                   图片、音频等静态媒体
scripts/audio-peaks.mjs    为 AudioClip 预计算波形峰值（PCM16 WAV）
```

## 内容创作

**写一篇故事**：在 `src/content/stories/` 建 `<slug>.mdx`。frontmatter 必填 title/description/date；`kind: interactive`（含交互组件）或 `essay`（纯文字）。交互组件从 `@/components/media` 导入，Svelte 组件必须写 `client:*` 指令（规则见 `src/components/media/README.md`，ScrollScene 必须 `client:visible={{ rootMargin: '150% 0px' }}`）。

**添加一个项目**：在 `src/content/projects/` 建 `<slug>.mdx`，frontmatter 见 `content.config.ts`。要在页面内提供在线体验，把自包含的演示 HTML 放进 `public/demos/<name>/`，并在正文用 `InteractiveDemo` 嵌入。

**更新主页状态**：改 `src/data/profile.ts` 的 `now` 和 `nowUpdated`。

**组件 QA**：每个媒介组件在 `/lab` 页面都有最小示例；新组件先在 /lab 点亮再进故事。

## 部署流程

1. 本地验证：`npm run check && npm run build`
2. 提交并推送到 main → GitHub Actions 自动部署（`.github/workflows/deploy.yml`：setup-node → npm ci → check → build → wrangler pages deploy）
3. 需要的 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
4. 手动部署：`npm run deploy`

## Phase 2 路线图（账户体系，尚未实现）

- API 路由放 `src/pages/api/**`（`export const prerender = false`），Cloudflare adapter 已就位
- D1 表：users / sessions / bookmarks / progress；绑定写进 `wrangler.toml` 的 `[[d1_databases]]`
- Auth 方案：better-auth + GitHub/Google OAuth
- 约定：用户态一律通过 `src/lib/user.ts` 走（现在恒 null），组件不自建全局状态
