# AGENTS.md

> **这是 Ethan Chang（张峻源）的个人博客**，只有英文站 https://ethanchang.io 。cn.ethanchang.io 会跳到同一路径。
> 框架是 Astro 5、Svelte 5、MDX、Tailwind CSS v4。Cloudflare Pages 项目名 `ethanblog`。
> 创作规范：[docs/MEDIUM.md](docs/MEDIUM.md)。后台操作与恢复：[docs/STUDIO.md](docs/STUDIO.md)。
> 本文件是强制约束。`.claude/skills/publish/SKILL.md` 与 `.cursor/rules/` 跟这里走。仓库没有 `CLAUDE.md`，也没有根目录 README。

## 用法上下文

在这个博客里工作，或要弄清框架怎么读取每一个属性，先读 Heptabase 卡片 **skill blogcontext**。

- 卡片 id：`60e2701a-4374-4bf7-9f4e-4d1d674aed8f`
- 打开：`heptabase://card/60e2701a-4374-4bf7-9f4e-4d1d674aed8f`

这张卡说明怎么在这个博客里工作：Heptabase 是写作来源，网站呈现卡片，`/dashboard` 负责审核和发布。它也说明框架实际读取的每个属性是什么意思，包括 slug、Language、Status（含 `blocked`）、Summary、Remark、Tag，以及代码还会读的其他字段。

**项目的用法逻辑变了，就在同一次改动里更新这张卡。** 用法逻辑包括怎么工作，以及框架如何读取、写回每一个属性。同一次改动里改仓库说明，也改这张卡，后来的 agent 才读得到当前约定。

## 任务路由

用户消息**首行**的触发词决定任务类型。读到触发词后按对应模式执行，不要混用。

| 触发词 | 模式 | 必读 | 允许改动 |
|---|---|---|---|
| `/publish`、`发布：` | 内容创作 | [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md)（可执行清单）+ [docs/MEDIUM.md](docs/MEDIUM.md)（创作规范） | `src/content/articles/`、`src/content/projects/` |
| `/infra`、`基建：` | 网站基建 | 本文 + [media/README.md](src/components/media/README.md) | `src/components/`、`src/lib/`、`src/pages/`、`plugins/` 等 |

**`/publish`（内容创作）硬性约束**：

- **禁止**新建或修改组件、布局、样式、API、测试基建；除非用户在同条消息写明 `allow-new-component: true`
- 新页面默认 `draft: true`
- 正文写中文（`#blog` 原文）。译文不写进同一个文件，而是 `#blogi18n` 里的独立卡片，由后台发布（见下文「两种语言」）。定稿要有标题、摘要、正文和 `slot`（`article` / `project`）。不要写 `titleEn` / `descriptionEn`，不要插入 `<div data-lang-split>`。技术名词、代码和引用保留原文。
- 新建或更新须关联真实 `heptabaseCardLink`（`heptabase://card/<uuid>`）。不能编造。历史页可以暂时没有链接继续展示，更新前要补上。
- 系列子文放 `src/content/articles/<hub>/<n>.mdx`（总览是 `<hub>.mdx`）；子文默认不进 `/articles`
- 操作细则见 [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md) 与 [MEDIUM.md §0](docs/MEDIUM.md#0-触发约定)

**`/infra`（网站基建）硬性约束**：

- **禁止**创建或改写 story / project 正文，除非用户明确要求

**无前缀时的默认路由**：措辞像「写成 story / 记笔记 / 把对话发出来」→ 内容创作；像「修组件 / 加 API / 部署挂了」→ 基建。歧义时先问一句。

## 样式约束（极简博客）

- **适用范围**：本节的极简约束只管公开站点，目的是让读者只看到内容。`/dashboard` 是工作工具，为了可读性不受这条约束：可以用边框、卡片/面板、按审核类型区分的底色和彩色标签、吸顶标题、独立的属性块和更醒目的差异标记。后台颜色仍从 `@theme` token 派生；token 里没有的审核类型色，只能在 `studio/online/dashboard.css` 顶部定义成后台专用变量（`--dash-*`），分亮暗两套，不要在各处散写色值。后台样式不能泄漏到公开页面。
- 颜色只能来自 `src/styles/global.css` 的 `@theme` 设计 token（surface / ink / primary / accent），组件与内容中不允许出现裸色值（hex/rgb 字面量）。canvas 绘制通过 `getComputedStyle` 读取 token（见 `src/lib/viz/registry.ts` 的做法）。
- 双主题：白天为纯白画布（`surface-950` = 白），夜间为 `#191919`（`data-theme="dark"`）。默认跟随系统 `prefers-color-scheme`，用户可通过导航栏切换并持久化到 `localStorage`。
- **不要**使用装饰性边框、背景色块、圆角卡片、色条、渐变遮罩、设备边框（红绿灯）等产品感 chrome。页面靠排版与留白组织，不靠盒子。
- 唯一例外是文章/项目页眉的元数据块 `.article-meta`（标签、技术栈）：和后台属性块一样用浅底和标签列，让读者一眼看出这是元数据。标签是带 # 的文字，没有描边，也不另加底色。别处不要照搬。
- 后台段落对比的红/绿底属于指定的差异标记，允许使用；颜色取自 accent-deletion / accent-insertion token，原文红底删除线、新文绿底，不给未改动内容加装饰。
- `.media-frame` / `.media-caption` 只负责间距与图注，**不是**带边框/背景的卡片容器；不要各自发明卡片样式。
- 中文壳层（`.i18n-zh`）里，`<a>` 紧贴前后汉字（`写信到<a>联系</a>`）。源码空格或换行会变成「写信到 联系」；英文链接前后可以留空格。

## 交互组件约束（可选升档时的契约）

- Svelte 岛屿在 MDX/页面里必须显式写 `client:*` 指令；默认 `client:visible`，首屏才用 `client:load`。
- 跨岛屿边界的 props 必须 JSON 可序列化。
- 所有组件必须在无 JS 时渲染出有意义的静态内容（内容优先；交互是可选升档）。
- 动效必须尊重 `prefers-reduced-motion`（用 `@/lib/motion` 的 `reducedMotion()`）。
- GSAP 只能在岛屿内部（onMount/$effect）动态 import，禁止在 `.astro` frontmatter 引入；ScrollTrigger 必须在组件销毁时 kill。
- 完整契约见 `src/components/media/README.md`。

## 内容从哪里来

Heptabase 是写作来源。GitHub `main`（`ethanchangit/ethanblog`）是网站与已发布内容的真源。后台把已审查的内容做成 PR，合并进 `main` 后由 Actions 部署。后台不直接改 `main`。

- 文章：`src/content/articles/<slug>.mdx`，`slot: article`，必须有 `date`。项目：`src/content/projects/<slug>.mdx`，`slot: project`。schema 在 `src/content.config.ts`。`slot` 决定进 `/articles` 还是 `/projects`，不是 topical `tags`。
- `src/content/pages/` 有手写目录 `blogs.mdx`，以及来自 Heptabase 的站点页。关于在 `/about`，首页 `/` 是文章列表。Now、联系、隐私仍用原来的地址（`/now`、`/contact`、`/privacy`）。站点页最多显示 4 页。不超过 4 张时全部发布，不需要挑选。超过 4 张时，审核清单写明上限是 4，并要求选择留下哪几页；未选中的不会悄悄去掉。每次审核都可以拖动手柄排列这几页，确认后写入 `src/data/page-order.ts`，导航按这个顺序显示。导航顺序的每一行都可以单独隐藏。隐藏记在本机决定里，和顺序一起在发布时写入这份文件：未隐藏的按拖动顺序出现在导航上，隐藏的不写入顺序，因此不进公开导航。隐藏不是撤下，也不改 Heptabase 卡片。不足 4 页时同样可以隐藏。每一行可以在新标签打开对应卡片，地址用这张卡片自己的 `heptabaseCardLink`。新的 Page 卡片在留下的 4 页里时，下一轮审查发布后出现在 `/<id>`。同一个固定地址已经被另一张卡片占用时，新卡片用自己的地址，不替换、不丢弃。卡片移出 `#blog` 或被删除后，下一次拉取并发布会从站点撤下，权限或网络错误不当作删除。
- `draft: true` 不进公开站点，也不进搜索。`listed: false` 有自己的 URL，不进文章/项目索引；非草稿正文仍进 `/search`。

### 英文站

- 公开站点只有英文。`#blog` 卡片仍是身份：状态、日期、标签、摘要、URL 以它为准。公开 `/tags` 只读这些卡片的 Tag，平铺显示，不分组。
- 发布出去的页面就是 `#blog` 卡片原文：标题和正文按卡片所写保留，包括英文 bullet 下面缩进的中文。不把 `#blogi18n` 的英文卡片抽出来替换这一页，也不另建 `/en` 或 `/zh` 文章树。
- 被提到的卡片打上 Heptabase 标签 `references`。引用页从这张标签读取，不从 Blog Type 的 Reference 选项读取。已经是文章、项目或站点页的卡片也可以同时带这个标签，不改它的 Blog Type。卡片正文末尾写 `## Mentioned by`，列出提到它的卡片标题和 id，不把这些行再当成新的 mention。
- `slug` 就是地址，放在站点根路径：slug 是 `toolset` 时，页面在 `https://ethanchang.io/toolset`，文件是 `src/content/articles/toolset.mdx`。文章已经发布、而卡片 slug 和现有文件名不同时，之后每次发布都把文件搬到这个 slug，旧文件名和旧 slug 写入 frontmatter 的 `aliases`，站点从这些旧地址 301 到新地址。目录里的 DocRef 可以继续写旧 id。另一张卡片已经占用这个 slug、slug 撞上固定地址，或同一张卡片连着多份文件时，停下并报冲突。译文的 URL 为空或与原文相同；不同就停下。没写 URL 的文章、项目和站点页也在 `/<id>`。`/articles` 和 `/projects` 仍是列表。旧的 `/articles/<id>`、`/projects/<id>`、`/pages/<id>` 转到 `/<id>`。URL 只能是小写字母、数字、连字符，不能占用固定地址（`now`、`tags`、`articles`、`projects`、`dashboard`、`contact`、`privacy`、`about`、`en`、`cn` 等，完整清单是 `src/lib/routes.ts` 的 `RESERVED_URLS`），撞了就拒绝并报出冲突。
- 一次构建出一个站，页面在 `dist/` 根目录。Worker（`scripts/cf-worker-entry.mjs`，规则在 `src/lib/hosts.ts`）把 `cn.ethanchang.io`、`en.localhost`、`/en`、`/zh` 和 `/_lang/` 转到 ethanchang.io 上的同一路径。界面、日期和列表是英文。
- 本机 `http://localhost:4321` 就是这个英文站。后台只在 ethanchang.io/dashboard；cn.ethanchang.io/dashboard 跳回去。

### `#blog`

拉取读 Heptabase 里准确名为 `blog` 的标签数据库。名为 `blog i18n` 的标签和关联字段如果还在，只用来核对译文，不写进公开页；没有这个标签时，拉取只读 `#blog`，不因此失败。字段按名字从线上表结构读取（`slug`、`Remark`；若仍有译文库，还有它的 `slug`、`Language`），不写死 id。`slug` 可以是文字或选项，值就是地址。引用资料不再使用单独的 `#blog-reference` 标签。

- 审核清单收 `Status = review` 的文字卡片，也收 `Status = published` 且网站上已经有已发布副本的卡片，和 review 一起拉取。`new`、`writing`、`blocked` 不进清单。Status 选项为 `new`、`writing`、`blocked`、`review`、`published`，各一个（大小写不敏感；旧名 `block` 不再认）。`published` 表示已通过审核。网站上已经发布过的卡片，之后在 Heptabase 里仍是 published 时，更新会继续出现在审核清单里。
- `Blog Type` 的选项以数据库里的为准。发布要求有 `Article`、`Project` 和 `Page`。只有 `Article` 进公开文章列表。`Project` 进项目页，`Page` 进站点页。引用页不靠 Blog Type：带 `references` 标签、且自己不是文章、项目或站点页的卡片，有自己的页面，不进文章列表。项目和文章随卡片增加，没有篇数上限。站点页最多 4 页。没选就停止，不按标题猜测。卡片上已有的 Publish Date、创建时间和更新时间原样写入网站；两样都没有时，首次发布才用当天日期。摘要来自 `Summary` 字段；字段为空时，标题下的预览段落留空，不从正文第一段抄。
- 主卡片递归提到的卡片，发布前打上 `references` 标签。已经在 `#blog` 里的文章、项目和站点页保持原来的 Blog Type。不在 `#blog` 里的卡片不改成 Article、Project 或 Page，也不要求 Blog Type 里有 Reference。这不是公开许可；通过前要明确确认正文和全部引用都可以公开。带 `references` 标签的卡片离开 `#blog` 不会被当成删除。
- 被提到的另一张 Blog、Project 或 Page 卡片仍是主卡片，必须单独通过或拒绝，不会被改成 Reference。

### `/dashboard`

入口是 https://ethanchang.io/dashboard ，用后台密码登录。这里不能编辑 Markdown。正文在 Heptabase 改；后台只拉取、预览、段落对比、确认、提交和发布。审核预览不加载外站图片，也不运行交互组件。细节与故障恢复见 [docs/STUDIO.md](docs/STUDIO.md)。

Heptabase 的 Cursor 连接在仓库 `.cursor/mcp.json`：服务器 `heptabase-mcp`，URL `https://api.heptabase.com/mcp`，没有令牌或 client secret。编辑器和 CLI 读这份项目文件；拉取后刷新 Cursor，或在仓库目录执行 `agent mcp login heptabase-mcp`，由本人在 Heptabase 完成授权。要改卡片，授权时授予写入。Cloud Agent 不读这份文件，也不用后台 D1 里的授权。这个账号没有团队，不要去 Dashboard → Plugins & MCPs，也不要把 `STUDIO_SECRET` 或访问令牌放进仓库或 Cloud Agent 环境。

1. 「拉取最新更新」。清单里有 `Status = review` 的卡片，也有 `Status = published` 且网站上已经有已发布副本的卡片。左侧为 New articles、Edited articles；已关联文章移出 `#blog` 且不在 `references` 标签里，或 Heptabase 明确报告源卡片不存在时，另列 Deleted articles。这项检查不要求卡片仍为 Review。只留在 `references` 标签里的卡片不是删除。没有关联链接的旧文不会因为清单里找不到它而被删除。权限、网络或不完整结果不当作删除。
2. 拉取完成后，审核都在本机进行，不再逐次访问 Heptabase 或 GitHub。主卡片上点通过是一次点击，没有确认弹窗；点通过即确认正文、全部引用和译文都可以公开，并记入本机决定。拒绝会先打开备注对话框，通过不会。可以勾选多篇后批量通过或批量拒绝；批量拒绝共用一次备注。删除和暂不删除仍是一次点击，不写 Remark。决定之后两个按钮都还在，当前选择保持高亮，可以改判。站点页的勾选、从导航隐藏和拖动顺序也只改本机清单。这些点击不锁住整页。Publish Date 或创建时间已有则原样保留；两样都空时才在发布时补当天（默认时区 `Africa/Dar_es_Salaam`）。此时只是「已通过，待发布」。Heptabase 的 Status 要等这次发布提交时才回写：通过写成 `published`，拒绝写成 `blocked`，不改日期，也不改线上旧文。对话框里的备注留在本机决定里，等这次发布上线（deploy 回执，`completeWriteback`）再写回卡片的 `Remark`。留空会在那时清空 Remark。译文跟着主卡片一起通过或拒绝。底部「直接发布」把本机决定一次提交，并发布这次拉取里尚未拒绝的更新和尚未跳过的删除，不再弹出确认框。发布失败不表示网站已经改变。
3. 「提交通过的更新到 GitHub」把尚未送出的本机决定一次提交，只包含已通过的主卡片及其引用，并再次核对来源、属性和公开确认。公开仓库里的 PR 已经是公开行为。
4. 检查通过后「确认发布」，核对清单，再「确认发布到博客」，合并到 `main`。内容、主版本或检查变了就停止。
5. 后台显示「已上线」，且线上版本与该 commit 一致，才算发布完成。

撤下走同一条发布。确认删除只进入待发布清单；提交前可以取消尚未提交的删除。无人引用时撤下该文和专属资料。若其他页面仍引用将被撤下的卡片，发布不会被拦住：它从文章列表、项目列表和站点页面撤下，留下为 reference，地址和链接保留。审核预览和发布栏会点名引用它的页面，并可以一键留下为 reference。仍是文章、项目或站点页的其他卡片保持原类型，不会因为被提到而改成 reference。不删除、不改写 Heptabase 源卡片，也不直接改 `main`。

后台内容 PR 只允许 `src/content/articles/`、`src/content/projects/` 下的 MDX、`src/content/pages/` 下的 MDX、`src/data/tag-groups.ts` 和 `src/data/page-order.ts`。公开 `/tags` 不读 `tag-groups.ts`。站点程序改动在 GitHub 审查。卡片里归档的交互源码不能直接跑上网站。

## 开发与部署

- Node 22+。`npm install` 后 `npm run dev`（Astro，默认 http://localhost:4321）。
- 本地后台：`npm run dev`，打开 http://localhost:4321/dashboard。这条路由只在本机 dev server 注入，不要求后台密码；改 `studio/online/` 会热更新。生产 https://ethanchang.io/dashboard 仍要密码。没有 GitHub 令牌时页面能打开，拉取 GitHub 或 Heptabase 会提示尚未配置。云端密钥名是 `GITHUB_TOKEN_BLOG`，本机同名写在 `.dev.vars`。生产 Pages 仍用 `GITHUB_TOKEN`。后台两条都认。`STUDIO_SECRET` 也放在 `.dev.vars`（见 `.dev.vars.example`），不要写进仓库。
- 日常写作在 Heptabase。本机不再提供 `/studio` 编辑器；`astro dev` 只注入 http://localhost:4321/dashboard。生产构建不包含这个开发路由。
- `node studio/online/preview.mjs` 是内存里的界面验收（默认 http://localhost:4350/dashboard）。本机打开不要求后台密码，不连接真实 GitHub 或 Heptabase。它用 `studio/online/sample-review.mjs` 的示例数据（新文、已编辑、删除、站点页、段落对比、通过和拒绝），并直接提供当前的 `studio/online` 界面源码，所以本机改后台后刷新就能看到。打开或刷新后直接是审核界面，不用点「拉取最新更新」。这套数据只在这个本地进程里。`npm run dev` 的后台、正式发布、生产后台和真实拉取仍走 Heptabase 与 GitHub。
- `npm run preview` 伺服 `dist/`（`@astrojs/cloudflare` 不支持 `astro preview`）。`npm run build` 同时构建博客和后台，产物是 `dist/`（已 gitignore）。`npm run check` 做类型和内容 schema 校验。`npm run validate:content` 查 schema 覆盖不到的创作规约。
- `npm run test` 含 Playwright，它伺服已经构建的 `dist/`，所以要先 `npm run build`。
- 提交前跑验证四连：`npm run validate:content && npm run check && npm run build && npm run test`。
- 首页身份、技能和 Now 页改 `src/data/profile.ts`（`profile`、`skills`、`nowIntro`、`now`、`nowUpdated`）。项目内演示把自包含 HTML 放进 `public/demos/<name>/`，正文用 `InteractiveDemo`。新交互组件直接接在用到它的文章或项目上，并补测试。
- 公开导航没有登录。收藏、阅读进度和留言走 `src/lib/user.ts` 与 `src/pages/api/`（better-auth，博客可以不启用）。这和后台密码是两套登录。本地 OAuth 用 `.dev.vars`，样例是 `.dev.vars.example`。
- 两个域名都挂在 Pages 项目 `ethanblog`：`ethanchang.io`（英文）和 `cn.ethanchang.io`（中文）。部署时 `scripts/ensure-domains.mjs` 检查 cn 域名是否已挂到项目、DNS 是否有指向 `ethanblog.pages.dev` 的 CNAME，缺了就补；这要求 `CLOUDFLARE_API_TOKEN` 有 Pages 编辑和 ethanchang.io 的 DNS 编辑权限，权限不够时只留警告，不挡发布。
- 部署是 `.github/workflows/deploy.yml`。pull request 只跑 `verify`。push 到 `main` 会在 `verify` 通过后自动部署到 Cloudflare Pages 项目 `ethanblog`。在 `main` 上 `workflow_dispatch` 也会部署。
- 部署使用已经测过的 `dist/`：远程执行 `wrangler d1 migrations apply ethanblog --remote`，部署 guestbook Worker，再 `wrangler pages deploy dist --project-name=ethanblog`。然后核验线上站点，并向 `https://ethanchang.io/dashboard/api/deployed` 发送签名回执。回执失败时站点可能已经更新，以线上版本为准。
- Actions 用到的密钥是 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`STUDIO_SECRET`。Pages 上的后台密钥（`GITHUB_TOKEN`、`STUDIO_PASSWORD_HASH`、`STUDIO_SECRET`）见 [docs/STUDIO.md](docs/STUDIO.md)。Pages 的 `wrangler.toml` 不能写 `send_email`；留言信在 `workers/guestbook`。
