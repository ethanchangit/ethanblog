# CLAUDE.md - ethanchang.io 项目指南

> **这是 Ethan Chang 的个人博客**（https://ethanchang.io）。
> 整体框架与路线图见 [docs/ROADMAP.md](docs/ROADMAP.md)。
> **内容创作规范**（把对话/文章转化为本站 MDX 页面的方法）见 [docs/MEDIUM.md](docs/MEDIUM.md)。

## 项目信息

- **定位**: Ethan Chang 的个人博客 —— 极简 Astro 站点，以文字与排版为主；需要时再嵌入交互组件
- **作者**: Ethan Chang（张峻源）
- **框架**: Astro 5（islands）+ Svelte 5（runes）+ MDX + Tailwind CSS v4 + GSAP
- **部署**: Cloudflare Pages（项目名 `ethanblog`）
- **域名**: https://ethanchang.io

## 常用命令

```bash
npm run studio            # 本地写作台（astro dev + /studio）
npm run dev               # 本地开发（端口 4321；/studio 同样可用）
npm run build            # 生产构建，输出到 dist/
npm run preview          # 静态伺服 dist/（Cloudflare adapter 不支持 astro preview）
npm run check            # astro check：类型 + 内容 schema 校验
npm run validate:content # 内容闸门：schema 查不到的创作规约（注水指令/Var-Calc 顺序等）
npm run test             # studio 单测 + Playwright（Playwright 需先 npm run build）
npm run deploy           # 构建并手动部署到 Cloudflare Pages
```

提交内容前跑**验证四连**：`npm run validate:content && npm run check && npm run build && npm run test`。

## 项目结构

```
src/
  styles/global.css        设计 token（@theme）+ 基础样式 + prose + .media-frame
  content.config.ts        articles / projects 共用 schema；`slot` 分流索引
  data/profile.ts          个人资料单一数据源（姓名/bio/skills/now/社交）
  lib/                     docs.ts、viz/registry.ts、rules/、reactive/、motion.ts、format.ts、user.ts、routes.ts
  layouts/                 Base / Doc
  components/shell/        Nav / Footer / Card / SectionHeading
  components/home/         Hero / NowPanel / SkillsGraph
  components/media/        可选交互组件（见其 README.md）
  pages/                   index（身份） / now / articles / projects / lab / 404 / rss.xml.ts / api/*（auth 可选）
  content/articles/*.mdx   文章（slot: article）
  content/projects/*.mdx   项目（slot: project；可选 repo/downloads/screenshots/demo）
plugins/
  remark-source-view.mjs   构建期插件保留，默认永不注入「⌥ 源码」
workers/
  guestbook/               Email Routing send_email Worker（Pages `[[services]]` GUESTBOOK）
studio/                    本地写作台（仅 `astro dev` 注入 `/studio`；生产不打包）
public/
  demos/<name>/index.html  自包含演示包（knowledge-garden / robert / network）
  media/                   图片、音频等静态媒体
scripts/audio-peaks.mjs    为 AudioClip 预计算波形峰值（PCM16 WAV）
scripts/validate-story.mjs 内容闸门（npm run validate:content）
.claude/skills/publish/    /publish 的可执行操作清单（SKILL.md）
```

## 内容创作

**触发约定**：用户消息首行以 `/publish`（或 `发布：`）开头 = 内容创作，**按 [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md) 的可执行清单逐步执行**，创建或更新 `src/content/` 下的 MDX；以 `/infra`（或 `基建：`）开头 = 网站基建，改组件/样式/API，不碰 article 正文。路由表见 [AGENTS.md](AGENTS.md#任务路由)。

**先读 [docs/MEDIUM.md](docs/MEDIUM.md)**——创作规范：从"对话/笔记/文章"到本站 MDX 的转换流水线（输入类型专则、组件决策表、页面接口）。调研笔记见 [docs/research/](docs/research/)。

**写一篇文章**：本地打开 `npm run studio`（浏览器 `/studio`）用 Markdown 写，或在 `src/content/articles/` 建 `<slug>.mdx`。frontmatter 必填 `slot: article`、title/description/date；定稿还必须有 `titleEn`/`descriptionEn` 与正文 `<div data-lang-split></div>` 后的英文副本。交互组件从 `@/components/media` 导入，Svelte 组件必须写 `client:*` 指令（规则见 `src/components/media/README.md`，ScrollScene 必须 `client:visible={{ rootMargin: '150% 0px' }}`）。页面路由是 `/articles/<slug>`。

**添加一个项目**：在 `src/content/projects/` 建 `<slug>.mdx`，同一套字段加 `slot: project`；`repo`/`demo`/`screenshots` 等可选。要在页面内提供在线体验，把自包含的演示 HTML 放进 `public/demos/<name>/`，并在正文用 `InteractiveDemo` 嵌入。

**更新 Now 页**：改 `src/data/profile.ts` 的 `nowIntro` / `nowIntroEn`、`now` 和 `nowUpdated`。首页身份文案也在同一文件（`profile` / `skills`）。

**组件 QA**：每个交互组件在 `/lab` 页面都有最小示例；新组件先在 /lab 点亮再进文章。

## 部署流程

生产只走 **GitHub Actions 手动部署**（`.github/workflows/deploy.yml` 仅 `workflow_dispatch`，推 `main` 不会发版）。

1. 本地验证：`npm run check && npm run build`
2. 合并进 `main` 后，在 GitHub → Actions → **Deploy to Cloudflare Pages** → **Run workflow**（或 `gh workflow run "Deploy to Cloudflare Pages" --ref main`）
3. 流水线：test job 跑验证四连 → deploy job 跑 `scripts/ensure-d1.sh`（校验/创建 D1 与 SESSION KV + 应用远程迁移）→ `wrangler deploy -c workers/guestbook/wrangler.toml` → `wrangler pages deploy dist --project-name=ethanblog`
4. 需要的 Secrets：`CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`
   - token 必须具备 **Account 级 Cloudflare Pages:Edit + D1:Edit + Workers KV Storage:Edit + Workers Scripts:Edit**（现用 token 名 `ethanblog-ci`，2026-07-09 创建）。权限不足会在 ensure-d1.sh 处报 `Authentication error [code: 10000]`——2026-07 曾因旧 token 只有 Pages 权限导致部署中断一个月。Workers Scripts:Edit 是 guestbook Worker 部署所需；Pages 的 wrangler.toml 不能含 `send_email`。
5. 本机直推 Cloudflare（不经 CI）：`npm run deploy`

## 账户体系（可选；生产仍绑定 OAuth / D1，导航不再露出登录）

- API 路由：`src/pages/api/{auth,me,bookmarks,progress}.ts`（`export const prerender = false`）——静态博客可不依赖；登录后文章页的收藏/进度仍走这些接口
- D1：`wrangler.toml` 绑定 `DB` → `migrations/0001_init.sql`；迁移脚本 `./scripts/migrate-d1.sh`
- Auth：better-auth + GitHub/Google OAuth → `src/lib/auth.ts` + `src/lib/auth-client.ts`
- 用户态：一律经 `src/lib/user.ts`（服务端 `getUser()` / 客户端 `fetchUser()`），组件不自建全局状态
- Cloudflare Pages 环境变量（见 `src/env.d.ts`）：`BETTER_AUTH_SECRET`、`GITHUB_CLIENT_*`、`GOOGLE_CLIENT_*` —— **已于 2026-07-09 上传至生产**（`wrangler pages secret bulk .env.production`）；D1 迁移同日已应用。本地改密钥后重跑 `npm run setup:cloudflare`；本地开发登录需另建 `.dev.vars`（见 `.dev.vars.example`）并在 OAuth 应用里加 localhost 回调

## 可选交互组件（已实现）

- `CodePlayground`：Sandpack 沙箱（`src/lib/sandpack/setup.ts`）
- `Scene3D`：three.js 场景注册表（`src/lib/scene3d/registry.ts`）
- `ImageGallery`：图片网格 + Lightbox
- 演示包：`public/demos/{knowledge-garden,robert,network}/`
- 测试：`npm run test`（Playwright 全量，CI 在 deploy 前运行）

## 反应式文档（已实现）

- **反应式散文** `Var` + `Calc`：正文里可拖的数字 + 随之重算的内联结果（`src/lib/reactive/`，同 scope 跨岛屿共享；SSR 纯文本降级）
- `VerdictTable`：多方案 × 多维度评分裁决表（零 JS）
- `Mention` + `MentionTarget`：正文词语 ↔ 媒介块双向高亮（零 JS 委托脚本）
- **/publish skill 化** + `validate:content` 内容闸门（`scripts/validate-story.mjs`，CI 已接入）
- 后续蓝图见 [docs/ROADMAP.md](docs/ROADMAP.md)
