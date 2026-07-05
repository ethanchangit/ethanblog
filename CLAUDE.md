# CLAUDE.md - ethanchang.io 项目指南

> 整体框架计划与分阶段路线图见 [docs/ROADMAP.md](docs/ROADMAP.md)。
> **内容创作规范**（把对话/文章转化为本站媒介的方法）见 [docs/MEDIUM.md](docs/MEDIUM.md)。

## 项目信息

- **定位**: 超媒体个人主页 —— 不是博客，是一个持续加功能的"软件"
- **框架**: Astro 5（islands 架构）+ Svelte 5（runes）+ MDX + Tailwind CSS v4 + GSAP
- **部署**: Cloudflare Pages（项目名 `ethanblog`）
- **域名**: https://ethanchang.io

## 常用命令

```bash
npm run dev              # 本地开发（端口 4321）
npm run build            # 生产构建，输出到 dist/
npm run preview          # 静态伺服 dist/（Cloudflare adapter 不支持 astro preview）
npm run check            # astro check：类型 + 内容 schema 校验
npm run validate:content # 内容闸门：schema 查不到的创作规约（注水指令/溯源/Var-Calc 顺序等）
npm run test             # Playwright 测试（需先 npm run build）
npm run deploy           # 构建并手动部署到 Cloudflare Pages
```

提交内容前跑**验证四连**：`npm run validate:content && npm run check && npm run build && npm run test`。

## 项目结构

```
src/
  styles/global.css        设计 token（@theme）+ 基础样式 + prose + .media-frame
  content.config.ts        stories / projects 两个内容集合的 schema（stories 含 notebook 档 + thread/seq）
  data/profile.ts          个人资料单一数据源（姓名/bio/skills/now/社交）
  data/threads.ts          研究线单一数据源（notebook 挂线的唯一真相）
  lib/                     viz/registry.ts、rules/（RuleGarden 引擎）、reactive/（Var/Calc：eval.ts 安全求值器 + store.svelte.ts 跨岛屿状态）、history.ts（PageHistory 读 git 史）、motion.ts、format.ts、user.ts
  layouts/                 Base / Story / Project
  components/shell/        Nav / Footer / Card / SectionHeading / PageHistory
  components/home/         Hero / NowPanel / SkillsGraph / FeaturedGrid
  components/media/        ★ 媒介组件库（见其 README.md，契约必读）
  pages/                   index / stories / threads / projects / about / lab / 404 / rss.xml.ts / api/*
  content/stories/*.mdx    故事（kind: interactive | essay | notebook；可选 source 溯源 + history 版本史）
  content/stories/notes/   编号研究笔记（<thread>/<NN>-<slug>.mdx）
  content/projects/*.mdx   项目（结构化 frontmatter：repo/downloads/screenshots/demo）
plugins/
  remark-source-view.mjs   构建期为 MDX 媒介组件注入「⌥ 源码」disclosure（拆开看）
public/
  demos/<name>/index.html  自包含软件演示包（knowledge-garden / robert / network）
  media/                   图片、音频等静态媒体
scripts/audio-peaks.mjs    为 AudioClip 预计算波形峰值（PCM16 WAV）
scripts/validate-story.mjs 内容闸门（npm run validate:content）
.claude/skills/publish/    /publish 的可执行操作清单（SKILL.md）
```

## 内容创作

**触发约定**：用户消息首行以 `/publish`（或 `发布：`）开头 = 媒介创作，**按 [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md) 的可执行清单逐步执行**，创建或更新 `src/content/` 下的 MDX；以 `/infra`（或 `基建：`）开头 = 网站基建，改组件/样式/API，不碰 story 正文。路由表见 [AGENTS.md](AGENTS.md#任务路由)。

**先读 [docs/MEDIUM.md](docs/MEDIUM.md)**——创作宪法：从"对话/笔记/文章"到本站媒介的完整转换流水线（输入类型专则、档位判定、组件决策表、两档发布制、溯源、页面接口）。理论地基见 [docs/research/](docs/research/)。

**写一篇故事**：在 `src/content/stories/` 建 `<slug>.mdx`。frontmatter 必填 title/description/date；`kind: interactive`（含交互组件）、`essay`（纯文字）或 `notebook`（编号研究笔记，须填 thread/seq，放 `notes/<thread>/` 子目录）。交互组件从 `@/components/media` 导入，Svelte 组件必须写 `client:*` 指令（规则见 `src/components/media/README.md`，ScrollScene 必须 `client:visible={{ rootMargin: '150% 0px' }}`）。

**添加一个项目**：在 `src/content/projects/` 建 `<slug>.mdx`，frontmatter 见 `content.config.ts`。要在页面内提供在线体验，把自包含的演示 HTML 放进 `public/demos/<name>/`，并在正文用 `InteractiveDemo` 嵌入。

**更新主页状态**：改 `src/data/profile.ts` 的 `now` 和 `nowUpdated`。

**组件 QA**：每个媒介组件在 `/lab` 页面都有最小示例；新组件先在 /lab 点亮再进故事。

## 部署流程

1. 本地验证：`npm run check && npm run build`
2. 提交并推送到 main → GitHub Actions 自动部署（`.github/workflows/deploy.yml`：setup-node → npm ci → check → build → wrangler pages deploy）
3. 需要的 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
4. 手动部署：`npm run deploy`

## Phase 2 账户体系（已实现，部署需配置）

- API 路由：`src/pages/api/{auth,me,bookmarks,progress}.ts`（`export const prerender = false`）
- D1：`wrangler.toml` 绑定 `DB` → `migrations/0001_init.sql`；迁移脚本 `./scripts/migrate-d1.sh`
- Auth：better-auth + GitHub/Google OAuth → `src/lib/auth.ts` + `src/lib/auth-client.ts`
- 用户态：一律经 `src/lib/user.ts`（服务端 `getUser()` / 客户端 `fetchUser()`），组件不自建全局状态
- 部署前需设置 Cloudflare Pages 环境变量（见 `src/env.d.ts`）：`BETTER_AUTH_SECRET`、`GITHUB_CLIENT_*`、`GOOGLE_CLIENT_*`

## Phase 3+ 媒介升档（已实现）

- `CodePlayground`：Sandpack 沙箱（`src/lib/sandpack/setup.ts`）
- `Scene3D`：three.js 场景注册表（`src/lib/scene3d/registry.ts`）
- `ImageGallery`：图片网格 + Lightbox
- 演示包：`public/demos/{knowledge-garden,robert,network}/`
- 测试：`npm run test`（Playwright 全量，CI 在 deploy 前运行）

## Phase 4 Batch 1 反应式文档与溯源（已实现）

- **反应式散文** `Var` + `Calc`：正文里可拖的数字 + 随之重算的内联结果（Tangle 手感，
  `src/lib/reactive/`，同 scope 跨岛屿共享；SSR 纯文本降级）
- `VerdictTable`：多方案 × 多维度评分裁决表（零 JS）
- `Mention` + `MentionTarget`：正文词语 ↔ 媒介块双向高亮（零 JS 委托脚本）
- `PageHistory`：frontmatter `history: true` 时文末「这一页如何长成」git 提交史
- **溯源** `source` schema + 页眉溯源行；人机双声（正文 ink 色 vs `Calc` accent 色）
- **/publish skill 化** + `validate:content` 内容闸门（`scripts/validate-story.mjs`，CI 已接入）
- 蓝图：Phase 4 Batch 2/3 见 [docs/ROADMAP.md](docs/ROADMAP.md)
