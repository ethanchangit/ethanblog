# AGENTS.md

> **这是 Ethan Chang（张峻源）的个人博客**（https://ethanchang.io）。
> 框架是 Astro 5、Svelte 5、MDX、Tailwind CSS v4、GSAP。Cloudflare Pages 项目名 `ethanblog`。
> 创作规范：[docs/MEDIUM.md](docs/MEDIUM.md)。后台操作与恢复：[docs/STUDIO.md](docs/STUDIO.md)。
> 本文件是强制约束。`.claude/skills/publish/SKILL.md` 与 `.cursor/rules/` 跟这里走。仓库没有 `CLAUDE.md`，也没有根目录 README。

## 任务路由

用户消息**首行**的触发词决定任务类型。读到触发词后按对应模式执行，不要混用。

| 触发词 | 模式 | 必读 | 允许改动 |
|---|---|---|---|
| `/publish`、`发布：` | 内容创作 | [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md)（可执行清单）+ [docs/MEDIUM.md](docs/MEDIUM.md)（创作规范） | `src/content/articles/`、`src/content/projects/` |
| `/infra`、`基建：` | 网站基建 | 本文 + [media/README.md](src/components/media/README.md) | `src/components/`、`src/lib/`、`src/pages/`、`plugins/` 等 |

**`/publish`（内容创作）硬性约束**：

- **禁止**新建或修改组件、布局、样式、API、测试基建；除非用户在同条消息写明 `allow-new-component: true`
- 新页面默认 `draft: true`
- 只有中文正文。定稿要有标题、摘要、正文和 `slot`（`article` / `project`）。不要写 `titleEn` / `descriptionEn`，不要插入 `<div data-lang-split>`。技术名词、代码和引用保留原文。
- 新建或更新须关联真实 `heptabaseCardLink`（`heptabase://card/<uuid>`）。不能编造。历史页可以暂时没有链接继续展示，更新前要补上。
- 系列子文放 `src/content/articles/<hub>/<n>.mdx`（总览是 `<hub>.mdx`）；子文默认不进 `/articles`
- 操作细则见 [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md) 与 [MEDIUM.md §0](docs/MEDIUM.md#0-触发约定)

**`/infra`（网站基建）硬性约束**：

- **禁止**创建或改写 story / project 正文，除非用户明确要求

**无前缀时的默认路由**：措辞像「写成 story / 记笔记 / 把对话发出来」→ 内容创作；像「修组件 / 加 API / 部署挂了」→ 基建。歧义时先问一句。

## 样式约束（极简博客）

- 颜色只能来自 `src/styles/global.css` 的 `@theme` 设计 token（surface / ink / primary / accent），组件与内容中不允许出现裸色值（hex/rgb 字面量）。canvas 绘制通过 `getComputedStyle` 读取 token（见 `src/lib/viz/registry.ts` 的做法）。
- 双主题：白天为纯白画布（`surface-950` = 白），夜间为 `#191919`（`data-theme="dark"`）。默认跟随系统 `prefers-color-scheme`，用户可通过导航栏切换并持久化到 `localStorage`。
- **不要**使用装饰性边框、背景色块、圆角卡片、色条、渐变遮罩、设备边框（红绿灯）等产品感 chrome。页面靠排版与留白组织，不靠盒子。
- 后台段落对比的红/绿底属于指定的差异标记，允许使用；颜色取自 accent-deletion / accent-insertion token，原文红底删除线、新文绿底，不给未改动内容加装饰。
- `.media-frame` / `.media-caption` 只负责间距与图注，**不是**带边框/背景的卡片容器；不要各自发明卡片样式。
- 中文壳层（`.i18n-zh`）里，`<a>` 紧贴前后汉字（`写信到<a>联系</a>`）。源码空格或换行会变成「写信到 联系」；英文链接前后可以留空格。

## 交互组件约束（可选升档时的契约）

- Svelte 岛屿在 MDX/页面里必须显式写 `client:*` 指令；默认 `client:visible`，首屏才用 `client:load`；ScrollScene 必须 `client:visible={{ rootMargin: '150% 0px' }}`（避免注水膨胀导致布局跳动）。
- 跨岛屿边界的 props 必须 JSON 可序列化。
- 所有组件必须在无 JS 时渲染出有意义的静态内容（内容优先；交互是可选升档）。
- 动效必须尊重 `prefers-reduced-motion`（用 `@/lib/motion` 的 `reducedMotion()`）。
- GSAP 只能在岛屿内部（onMount/$effect）动态 import，禁止在 `.astro` frontmatter 引入；ScrollTrigger 必须在组件销毁时 kill。
- 完整契约见 `src/components/media/README.md`。

## 内容从哪里来

Heptabase 是写作来源。GitHub `main`（`ethanchangit/ethanblog`）是网站与已发布内容的真源。后台把已审查的内容做成 PR，合并进 `main` 后由 Actions 部署。后台不直接改 `main`。

- 文章：`src/content/articles/<slug>.mdx`，`slot: article`，必须有 `date`。项目：`src/content/projects/<slug>.mdx`，`slot: project`。schema 在 `src/content.config.ts`。`slot` 决定进 `/articles` 还是 `/projects`，不是 topical `tags`。
- `src/content/pages/` 有手写目录 `blogs.mdx`，以及关于、Now、联系、隐私四份发布副本（`about.mdx`、`now.mdx`、`contact.mdx`、`privacy.mdx`）。这四页的正文只来自 Heptabase 里 Blog Type 为 Page 的 `#blog` 卡片；路由只渲染这些副本。卡片移出 `#blog` 或被删除后，下一次拉取并发布会从站点撤下，权限或网络错误不当作删除。
- `draft: true` 不进公开站点，也不进搜索。`listed: false` 有自己的 URL，不进文章/项目索引；非草稿正文仍进 `/search`。

### `#blog` 与 `#blog-reference`

拉取读 Heptabase 里准确名为 `blog` 的标签数据库。

- 审核清单只收 `Status = review` 的文字卡片。Status 选项为 `new`、`writing`、`block`、`review`、`published`，各一个。`published` 表示已通过审核，不表示网站已上线。
- `Blog Type` 有 `Blog`、`Project` 和 `Page`。Blog 进文章页，Project 进项目页，Page 只对应关于、Now、联系、隐私。没选就停止，不按标题猜测。
- 主卡片递归提到、且自己不在 `#blog` 里的卡片，后台称为 page：`listed: false`，列在该主卡片下方，不单独通过或拒绝。发布前必须带上标签 `blog-reference`（`#blog-reference`）。标签只用于回到 Heptabase 集中审查，不是公开许可；通过前要明确确认正文和全部引用都可以公开。
- 被提到的另一张 `#blog` 卡片仍是主卡片，必须单独通过或拒绝，不会被标成 `#blog-reference`。

### `/dashboard`

入口是 https://ethanchang.io/dashboard ，用后台密码登录。这里不能编辑 Markdown。正文在 Heptabase 改；后台只拉取、预览、段落对比、确认、提交和发布。审核预览不加载外站图片，也不运行交互组件。细节与故障恢复见 [docs/STUDIO.md](docs/STUDIO.md)。

Heptabase 的 Cursor 连接在仓库 `.cursor/mcp.json`：服务器 `heptabase-mcp`，URL `https://api.heptabase.com/mcp`，没有令牌或 client secret。编辑器和 CLI 读这份项目文件；拉取后刷新 Cursor，或在仓库目录执行 `agent mcp login heptabase-mcp`，由本人在 Heptabase 完成授权。要改卡片，授权时授予写入。Cloud Agent 不读这份文件，也不用后台 D1 里的授权。这个账号没有团队，不要去 Dashboard → Plugins & MCPs，也不要把 `STUDIO_SECRET` 或访问令牌放进仓库或 Cloud Agent 环境。

1. 「拉取最新更新」。左侧为 New articles、Edited articles；已关联文章移出 `#blog`，或 Heptabase 明确报告源卡片不存在时，另列 Deleted articles。这项检查不要求卡片仍为 Review。没有关联链接的旧文不会因为清单里找不到它而被删除。权限、网络或不完整结果不当作删除。
2. 主卡片上 ✓ / ×。通过则回写 `published`；Publish Date 为空时补当天（默认时区 `Africa/Dar_es_Salaam`），已有日期保留。此时只是「已通过，待发布」。拒绝则回写 `block`，不改日期，也不改线上旧文。
3. 「提交通过的更新到 GitHub」只提交已通过的主卡片及其引用，并再次核对来源、属性和公开确认。公开仓库里的 PR 已经是公开行为。
4. 检查通过后「确认发布」，核对清单，再「确认发布到博客」，合并到 `main`。内容、主版本或检查变了就停止。
5. 后台显示「已上线」，且线上版本与该 commit 一致，才算发布完成。

撤下走同一条发布。确认删除只进入待发布清单；提交前可以取消尚未提交的删除。只撤下该文和专属引用，仍被其他页面使用的资料保留，并阻止剩余页面出现断链。不删除、不改写 Heptabase 源卡片。

后台内容 PR 只允许 `src/content/articles/`、`src/content/projects/` 下的 MDX、`src/content/pages/blogs.mdx` 和 `src/data/tag-groups.ts`。站点程序改动在 GitHub 审查。卡片里归档的交互源码不能直接跑上网站。

## 开发与部署

- Node 22+。`npm install` 后 `npm run dev`（Astro，默认 http://localhost:4321）。
- 本地后台：`npm run dev`，打开 http://localhost:4321/dashboard。这条路由只在本机 dev server 注入，不要求后台密码；改 `studio/online/` 会热更新。生产 https://ethanchang.io/dashboard 仍要密码。没有 `GITHUB_TOKEN` 时页面能打开，拉取 GitHub 或 Heptabase 会提示尚未配置。配置好的令牌放在环境变量里，不要写进仓库。
- `npm run studio` 与 `npm run dev` 是同一条命令。同一进程的 http://localhost:4321/studio 只能改本机文件，是迁移期留下的工具。它不是写作应用，生产构建不注入、不部署。日常写作在 Heptabase。
- `node studio/online/preview.mjs` 是内存里的界面验收（默认 http://localhost:4350/dashboard）。它会要测试密码，不连接真实 GitHub 或 Heptabase。
- `npm run preview` 伺服 `dist/`（`@astrojs/cloudflare` 不支持 `astro preview`）。`npm run build` 同时构建博客和后台，产物是 `dist/`（已 gitignore）。`npm run check` 做类型和内容 schema 校验。`npm run validate:content` 查 schema 覆盖不到的创作规约。
- `npm run test` 含 Playwright，它伺服已经构建的 `dist/`，所以要先 `npm run build`。
- 提交前跑验证四连：`npm run validate:content && npm run check && npm run build && npm run test`。
- 首页身份、技能和 Now 页改 `src/data/profile.ts`（`profile`、`skills`、`nowIntro`、`now`、`nowUpdated`）。项目内演示把自包含 HTML 放进 `public/demos/<name>/`，正文用 `InteractiveDemo`。新交互组件先在 `/lab` 放最小示例。
- 公开导航没有登录。收藏、阅读进度和留言走 `src/lib/user.ts` 与 `src/pages/api/`（better-auth，博客可以不启用）。这和后台密码是两套登录。本地 OAuth 用 `.dev.vars`，样例是 `.dev.vars.example`。
- 部署是 `.github/workflows/deploy.yml`。pull request 只跑 `verify`。push 到 `main` 会在 `verify` 通过后自动部署到 Cloudflare Pages 项目 `ethanblog`。在 `main` 上 `workflow_dispatch` 也会部署。
- 部署使用已经测过的 `dist/`：远程执行 `wrangler d1 migrations apply ethanblog --remote`，部署 guestbook Worker，再 `wrangler pages deploy dist --project-name=ethanblog`。然后核验线上站点，并向 `https://ethanchang.io/dashboard/api/deployed` 发送签名回执。回执失败时站点可能已经更新，以线上版本为准。
- Actions 用到的密钥是 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`STUDIO_SECRET`。Pages 上的后台密钥（`GITHUB_TOKEN`、`STUDIO_PASSWORD_HASH`、`STUDIO_SECRET`）见 [docs/STUDIO.md](docs/STUDIO.md)。Pages 的 `wrangler.toml` 不能写 `send_email`；留言信在 `workers/guestbook`。
