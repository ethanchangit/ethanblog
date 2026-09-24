# Ethan 发布后台

入口：`https://ethanchang.io/dashboard`。生产环境用后台密码登录。所有写作留在 Heptabase；后台只负责拉取、比较、隐私审查、提交和发布，不提供编辑器。

## 哪里的内容为准

- **Heptabase 是写作来源。** 读取准确名为 `blog` 的标签数据库。审核入口只拉取 `Status = review` 的主文章；`new`、`writing`、`blocked` 不进入审核清单。大小写兼容，但每个状态只能有一个选项。`published` 表示已通过审核，是否真正上线另看发布进度。
- **GitHub 是网站、已审查内容与发布历史的唯一真源。** 提交只创建或更新内容 PR；经过检查和明确确认后合并到 `main`。push 到 `main` 会在 `verify` 通过后自动部署到 Cloudflare Pages。pull request 只跑 `verify`。在 `main` 上 `workflow_dispatch` 也会部署。
- 站点页来自 `#blog` 里 Blog Type 为 Page 的卡片，最多显示 4 页。不超过 4 张时全部发布，审核里不出现挑选。超过 4 张时，拉取后的审核清单顶部写明「站点页面最多显示 4 页」，并要求勾选留下哪几页；未勾选的不会悄悄去掉，已在网站上的要等确认发布后才撤下。关于、Now、联系、隐私继续用原来的地址；留下的新 Page 卡片发布到 `/pages/<id>`。固定地址已被占用时，审核预览会写明新页面的地址，两张都保留。发布副本在 `src/content/pages/`。Blog Type 的选项以数据库为准，当前是 Article、Project、Page 和 Reference。只有 Article 进入文章列表。Reference 有自己的页面，不进文章列表。项目和文章没有篇数上限。卡片已有的发布日期和创建时间原样复制，不另造一个今天。标题下的预览段落来自 Summary；Summary 为空时留空，不把正文第一段当成摘要。
- **Cloudflare 私有存储只保留待提交快照、审查记录、授权、发布进度，以及每张卡片上次成功拉取的编辑时间。** 编辑时间在 D1 表 `studio_card_pulls` 的 `edited_at`。每次拉取先只读 `#blog` 和 `#blogi18n` 的卡片列表和编辑时间，用来发现移出 `#blog` 或已删除的卡片；这一步不下载属性和正文。编辑时间没变的卡片不再读取，沿用上次拉到的内容；编辑时间变了，或还没有可信的上次拉取，才读取属性和正文。已发布正文里的 `updated` 也可以当作比较基准。后台重启后仍用这张表比较。拉取或保存审查结果不会直接更新网站。后台不会直接覆盖 `main`。
- 每篇文章或项目用真实的 `heptabaseCardLink: heptabase://card/<uuid>` 一对一关联，不靠标题猜测。历史文章可以继续展示，但更新前需要关联；不能编造链接。
- 当前只有一份正文，不要求中英双语。英文版副本已移除，中文正文中的英文名称、引用和代码不受影响。

## 日常发布

1. 在 Heptabase 完成写作、日期和标签，把准备审核的主文章标为 `review`。
2. 打开后台，点大按钮「拉取最新更新」。首次会引导 Heptabase 授权。生产 https://ethanchang.io/dashboard 要后台密码；本地 `npm run dev` 的 http://localhost:4321/dashboard 不要密码。按钮在拉取时显示「正在拉取更新」。这一步先核对 `#blog` 和 `#blogi18n` 的卡片列表和编辑时间，不下载属性和正文。编辑时间没变的跳过；变了或还没有可信缓存的，才读取属性和正文。进度会先写「正在核对卡片列表…」，有变化时再写「正在读取有更新的卡片」。
3. 左侧分成 **New articles**（新卡片或首次公开）、**Edited articles**（GitHub 主版本里已公开文章的更新）与 **Deleted articles**（移出 `#blog` 或源卡片已删除）。`Blog Type` 为 Article 的卡片进入文章列表，Reference 有自己的页面但不进文章列表，Project 进入项目页，Page 进入站点页。Page 预览写明发布地址。站点页最多 4 页；不超过 4 张时全部发布。超过 4 张时，清单顶部的「站点页面」要求勾选留下哪几页，再用上移、下移排列导航顺序，然后点「确认留下这些页面」。不超过 4 张时，同一处只排列顺序，点「确认这个顺序」。顺序写入 `src/data/page-order.ts`，发布后导航按这个顺序显示。项目和文章没有上限。没选时停止拉取，不按标题猜测。Article 用有序清单，跟随的 Reference 用下方无序清单。首次关联只列出同一类型里尚未连接的网页。没有待删除文章时不显示第三组。卡片已经删除的文章只出现在 Deleted articles，不会被重新发布。
4. 点击条目，在右侧查看发布排版，或切换「段落对比」。对比以 GitHub 主版本为基准，不把未合并 PR 当作已发布文章。全文按一篇文章排成一列，按阅读顺序逐段比较：同一位置文字相同的段落只出现一次，不标红绿。同一位置两边文字不同，先显示红底删除线的旧段落，紧接着是绿底的新段落。只在旧文出现的段落标红，只在新文出现的段落标绿。不标移动，没有「移至」跳转，也不画连线。不再分「原文 · 发布前」和「这一版 · 发布后」两栏。未变段落不折叠，不在正文里重复「原有内容／新内容」标签。代码块、列表、表格按完整块比较；标签变化仍独立展示。普通正文复用博客的 Doc/Card 排版；审核时不加载外站图片或运行交互组件，避免私人内容泄露，复杂源码不伪装成已渲染效果。
5. 检查完整递归引用范围，包括循环和共享引用。还没有进入 `#blog` 的引用卡片要加入 `#blog`，并把 Blog Type 设为 Reference，便于回到同一张表里审查。**类型本身不是公开许可**。
6. 只在 blog 上设置 ✓ 和 ×。通过前明确确认正文与所有 page 都可公开；立即回写 `published`。已有 Publish Date 或创建时间原样保留；两样都空才补当天（默认 Africa/Dar_es_Salaam）。此时仅为「已通过，待发布」，尚未上传 GitHub。拒绝则回写 `blocked`，保留日期和线上旧文章，不填写 comment。被引用的其他 blog 必须单独通过，不能借 mention 绕过拒绝。
7. 可只通过部分博客。点「提交通过的更新到 GitHub」只提交这些博客及其引用；再次检查源内容、属性和隐私确认。公开仓库里 **PR 提交已经是公开行为**。
8. GitHub 检查通过后「确认发布」，核对清单，再「确认发布到博客」。内容、主版本或检查变化时停止。
9. 后台显示「已上线」才算真正发布完成；合并成功、审核 Published 都不等于已上线。以实际网站版本和 GitHub 发布结果为准。

Reference 卡片在 `#blog` 里，用 Blog Type 的 Reference 选项和文章、项目、站点页分开。它们有自己的地址，不出现在文章列表。草稿不进入公开站点或搜索。

段落身份的当前限制：2026-09-21 核对公开 MCP 的 `read_object` 和两张 `#blog` 卡片，返回的是带行号的 Hepta Markdown，没有普通段落的 block ID；接口也没有请求这些 ID 的选项。行号只用于完整拉取和翻页，不能作为稳定身份。后台因此按阅读顺序逐段比较，不声称同一段落的身份已被确认，也不把换了位置的相同文字配对成移动。未来获得官方支持的块级读取方式后，才可把真实 ID 与对应的已发布版本一并保存；不能由内容或行号伪造 ID。桌面 CLI 依赖运行中的 Heptabase，不能直接替代部署在 Cloudflare 的云端读取流程。

## 撤下文章

在 Heptabase 将关联文章移出 `#blog`，或直接删除源卡片，下次「拉取最新更新」会把它列入 **Deleted articles**。关于、Now、联系、隐私和 Blog Type 为 Reference 的资料同样：卡片离开 `#blog` 或被删除就进入这份清单。这项检查不要求卡片仍为 Review，也包括已经通过审核、尚未上线的新文章。没有关联源卡片的旧文章不会因为拉取结果里找不到它而被删除。权限、网络或不完整列表不当作删除。不会删除 Heptabase 里的源卡片。

1. 点击待删除文章，右侧显示现有内容和删除原因。下方列出会一起撤下的专属引用资料；仍被其他页面使用的资料会保留。
2. 点击 ✓，核对完整删除清单并明确确认；点击 × 仅表示本轮暂不删除，不改 Heptabase 属性。撤下流程不会删除或改写 Heptabase 源卡片，不会把状态改为 Blocked。
3. 确认后只是「待发布」。提交前可在底部取消删除，恢复之前的待发布更新。已经提交 GitHub 的删除需要通过 GitHub 调整，后台不会覆盖已提交的审查结果。
4. 与新增、编辑一起提交 GitHub，检查通过后明确确认发布，才会从线上正文、列表和搜索中移除。只在本地待发布、从未提交的新文章被撤回时，清理待发布清单即可，不需要创建空的发布。

如果其他保留页面仍链接到将被删除的文章，后台会列出这些页面并阻止删除，需先在来源中处理引用。拉取不完整、授权失败、暂时不可访问都不会被当作删除；只有完整标签清单和源卡片检查一致，或 Heptabase 明确报告卡片不存在，才会生成删除建议。提交和正式发布前都会重新核对；卡片重新加入 `#blog`、删除原因改变、网站内容变化时会要求重新审查。

撤下不是抹除历史：GitHub 已公开的历史版本和外部缓存仍可能保留内容。网站撤下可通过 GitHub 的新更新恢复，但不能保证已公开的私人资料被彻底收回。

## 首次关联已有文章

已有对应卡片：从卡片列表拉取，选择同一 Blog Type 下的原页面。没有对应卡片：在「首次关联旧文章」里点「创建 Heptabase 卡片」，核对后创建，加入 `#blog`，并按文章或项目写入 Blog Type。这只建立对应关系，仍需拉取和审查才能提交。

创建结果不明确时不会反复新建。先在 Heptabase 确认是否已有卡片，再通过拉取关联原文章。已有引用文章必须先完成对应关系。交互组件无法直接作为 Heptabase 正文编辑时，原代码会保存在卡片代码块中；未修改的归档可以还原，修改后的代码必须通过 GitHub 单独审查，后台不会执行卡片中新增的代码。

`Tag` 直接沿用数据库多选项。审核时单独显示新增、移除的标签，保留的标签默认折叠；全部移除时明确提示「更新后没有标签」。只有标签改变的已有文章会标为「仅标签更新」，正文、标题、日期等也改变时不会误用此标记。顺序调整和重复标签不计为增删。发布预览、段落对比和通过确认中都可检查标签变化；仍按整篇博客统一通过或拒绝，不在后台逐个编辑或批准标签。

MCP 暂不能创建选项，缺少时会列出名称，要求先在 Heptabase 添加，不会丢掉原标签。特殊卡片、复杂嵌入等不能安全转换的内容会明确阻止同步。

## 部署与配置

Cloudflare Pages 项目 `ethanblog`，域名 https://ethanchang.io （英文博客、后台）和 https://cn.ethanchang.io （中文博客）。部署时 `scripts/ensure-domains.mjs` 自动补齐 cn 域名和 DNS。保留 `DB`、`SESSION`、`GUESTBOOK` 绑定；后台使用 `studio_` 表，迁移不重建原数据库。GitHub Actions 使用 `CLOUDFLARE_API_TOKEN`、`CLOUDFLARE_ACCOUNT_ID`、`STUDIO_SECRET`。

Cloudflare production 需要：

| Secret | 用途与权限 |
| --- | --- |
| `GITHUB_TOKEN` | 仅授权 `ethanchangit/ethanblog` 的 fine-grained PAT：Contents、Pull requests 读写，Actions 只读。不要复用本机或聊天插件的宽权限凭证。Actions 自带的同名令牌不适用，因为它创建的更新不能正常触发后续工作流。 |
| `STUDIO_PASSWORD_HASH` | 在本机运行 `npm run dashboard:password` 设置至少 10 个字符的密码。只上传加盐摘要，明文不显示、不保存。换密码使旧登录失效。 |
| `STUDIO_SECRET` | 随机 32 字节密钥的 Base64，用于加密 Heptabase 授权和验证发布回执；同时保存到 GitHub Actions 同名 Secret。 |

任何密钥都不能进入代码、聊天、普通配置或不可信 PR 预览。正式配置前必须经站点所有者确认。建议保护 `main`、禁止强制推送并要求最新 `verify` 检查；`production` 可要求人工审批。

## Heptabase MCP

网站后台仍走 `studio/online/heptabase.mjs`：动态注册、授权页 `https://api.heptabase.com/auth`、令牌端点 `https://api.heptabase.com/token`、MCP `https://api.heptabase.com/mcp`，scope 为 `offline_access space:read space:write`。令牌加密在 D1 `studio_connections`（id `heptabase`），密钥是 `STUDIO_SECRET`。明文不进仓库。

Cursor 项目连接是 `.cursor/mcp.json` 里的 `heptabase-mcp`，只有 URL。编辑器与 CLI 读取它，并与 `~/.cursor/mcp.json` 合并，同名时以项目文件为准。拉取后刷新 Cursor，或在仓库目录运行 `agent mcp login heptabase-mcp`，在 Heptabase 点 Allow。写入权限在这次授权里授予。

Cloud Agent 不加载这份文件，也不读 Pages 上的密钥。这个账号没有团队，不要去 Dashboard → Plugins & MCPs。`STUDIO_SECRET` 和访问令牌不要放进 Cloud Agent 环境。

GitHub 合并后发布同一个已测试构建包，核验正式网站，再发送签名回执确认发布结果。回执失败时网站可能已上线，刷新发布状态可重试；不会把 Published 或 PR 合并当作网站上线证明。

## 验证和本地预览

```sh
npm ci
npm run validate:content
npm run check
npm run build
npm run test
```

`build` 同时构建博客与后台，最终只发布 `dist/`。`.studio-build/` 和 `.studio/` 不上传。

本地调试后台：

```sh
npm run dev
```

打开 http://localhost:4321/dashboard。这条路由只在 `astro dev` 注入，本机不要求后台密码，改 `studio/online/` 会热更新。生产 https://ethanchang.io/dashboard 仍要密码。`npm run studio` 与 `npm run dev` 是同一条命令。

本机拉取读 `.dev.vars` 里的 `GITHUB_TOKEN_BLOG`（或 `GITHUB_TOKEN`）和 `STUDIO_SECRET`。云端 Cursor Secrets 用同名 `GITHUB_TOKEN_BLOG`，类型是 Runtime Secret。生产 Pages 仍用 `GITHUB_TOKEN`。`STUDIO_SECRET` 加密 Heptabase 授权；令牌只授权 `ethanchangit/ethanblog`，Contents 与 Pull requests 读写，Actions 只读。不要复用 `gh` 的登录令牌，也不要把令牌写进仓库。授权和拉取缓存写在 `.studio/dashboard.sqlite`，重启后还在。

同一进程的 http://localhost:4321/studio 只能改本机文件。它不是写作应用，生产构建不注入、不部署。

内存验收（不连接真实 GitHub 或 Heptabase）：

```sh
npm run build
node studio/online/preview.mjs
```

默认 http://localhost:4350/dashboard。本机打开不要求后台密码。生产 https://ethanchang.io/dashboard 仍要密码。

## 故障和恢复

- 生产未配置密码、存储或 GitHub 时明确提示，不会在生产打开无密码后台。请求主机是 localhost、127.0.0.1 或 `::1` 时不检查密码，也不需要会话 cookie。其他主机，包括 https://ethanchang.io，仍要密码。Cloudflare 上的环境变量不能把生产后台打开。
- 生产登录过期时重新输入密码；连续错误尝试会暂时限制。
- 隐私审查失效：重新拉取，检查完整引用范围，再确认。只把 Blog Type 标成 Reference 还不够，仍要明确确认可以公开。
- 两边都有改动：比较后明确确认采用 Heptabase 的版本。GitHub 上的修改不会被悄悄覆盖。
- 保存中断：整批审查快照一起保存或一起回滚；之前的版本仍保留。
- 审核回写中断：底部显示重试入口，沿用已确认的版本和首次日期，不重复建卡。不覆盖中途的新修改；若要废弃未完成审核，在 Heptabase 将卡片重新标为 Review，再拉取并重新决定。尚有未完成回写时不允许提交发布。
- 提交中断：不改动内容直接重试，会复用相同提交；不会强制重置已有分支。手工关闭但未合并的内容 PR 需先在 GitHub 恢复或处理。
- 检查失败：查看 PR，修正后重新提交。主版本变化需更新内容分支并重新检查。
- 合并后部署失败：重试对应 GitHub Actions，不会把“已合并”显示成“已上线”。回滚通过新的 GitHub 回滚 PR 完成。
- Heptabase 授权过期或撤销：重新连接，不把访问令牌粘贴到网页或聊天。更换加密密钥前必须备份并处理旧授权。

本次不接入访问统计、不提供网页编辑器、媒体上传或自动翻译。

## 译文（#blogi18n）

- 译文是 `#blogi18n`（标签 `blog i18n`）里的独立卡片。`#blog` 卡片的关联字段 `blog i18n` 指向它；配对只看关联。
- 审核时译文列在原文下面（Translation · en），和原文一起通过或拒绝。发布后中文在 cn.ethanchang.io，英文在 ethanchang.io，同一路径。
- 译文的 `Language` 必填；`URL` 为空或与原文相同。没有加入 `#blogi18n`、URL 不一致、同一语言关联了两张，都会停下并说明原因。
- 撤下原文时，它的译文一起撤下。从关联里去掉某张译文，不会自动撤下已发布的那一版，需要在 GitHub 删除对应文件。
