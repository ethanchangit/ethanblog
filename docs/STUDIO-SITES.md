# Ethan Blog Studio on ChatGPT Sites

本目录新增的线上 Studio 是博客源码的私人编辑与发布入口。正式博客仍由 `ethanblog` Cloudflare Pages 项目托管；Studio 不迁移博客，也不复用正式博客的留言数据库。

## 运行方式

本地编辑器仍使用原来的命令：

```bash
npm run studio
```

线上 Worker 版本单独构建：

```bash
npm ci
npm run build:studio-site
```

构建结果是 `dist/client` 和 `dist/server/index.js`。Sites 的 `.openai/hosting.json` 将 D1 绑定命名为 `DB`；`drizzle/0000_studio.sql` 创建私人草稿和发布记录表。Site 发布时使用这个 Worker 产物，不使用 Astro 正式博客的静态构建产物。

## Sites 部署

Site 源码必须包含 `.openai/hosting.json`、`drizzle/`、`studio/online/` 和共享的 `studio/core.mjs`、`studio/tag-groups-core.mjs`。在 Sites 项目设置中保存环境变量后，再保存版本并部署私有版本。保存版本和部署是两个动作；每个 Site 部署 URL 都是生产 URL。

Site 的 audience 应保持 owner-only/private。Sites 平台身份会通过可信请求头提供给 Worker，Worker 还会检查应用作者白名单；没有白名单时，线上 API 不允许读写。

需要在 Site 设置中配置：

| 变量 | 类型 | 用途 |
| --- | --- | --- |
| `GITHUB_TOKEN` | Secret | 仅限 `ethanchangit/ethanblog` 的 fine-grained token；读取内容、写入内容和触发 Actions 所需最小权限 |
| `STUDIO_ALLOWED_USER_EMAILS` 或 `STUDIO_ALLOWED_USER_IDS` | 普通变量 | 允许使用后台的本人账号；建议优先使用稳定 user ID |

可选变量：`GITHUB_REPOSITORY`、`GITHUB_DEFAULT_BRANCH`、`GITHUB_DEPLOY_WORKFLOW`。不配置时分别使用 `ethanchangit/ethanblog`、`main` 和 `.github/workflows/deploy.yml`。

不要把 Token 放入浏览器、localStorage、仓库文件、普通数据库字段、构建产物或聊天消息。Site 不会自动继承当前 Work 对话的 GitHub 插件授权。

## 工作流

1. Studio 从 GitHub REST API 读取 `main` 的内容和确定的 commit SHA。
2. “保存”只写入 D1 中当前用户、仓库、分支、路径对应的私人草稿，不创建 GitHub commit。
3. “提交到 GitHub”检查草稿起点 SHA 和远程文件版本，然后以一个 Git tree/commit 写入允许的内容路径。允许的路径包括文章、项目、`src/content/pages/blogs.mdx` 和 `src/data/tag-groups.ts`。
4. 远程文件发生变化时，服务返回冲突版本标识，不覆盖远程，也不在错误响应中回传私人草稿全文。
5. “发布”只接受刚确认的目标 commit SHA，触发现有 `.github/workflows/deploy.yml` 的 `workflow_dispatch`。工作流会 checkout 同一个 SHA 并再次核验；只有 Actions 成功后，后台才显示正式博客地址。

发布状态保存在 D1 的 `studio_releases` 表中，并按 workflow run 查询，不使用仓库最近一次无关的 Actions 运行。发布失败可再次触发；不会因为网络超时自动创建重复 commit。

## 本次不做的事

- 不在开发或验收过程中向 `ethanchang.io` 发布测试文章。
- 不把私人草稿写入公开 GitHub 分支。
- 不上传媒体到临时沙箱。现有媒体引用保持原样；媒体上传需要另行设计正式博客可访问的持久化路径。
- 不在持有 GitHub Token 的 Worker 中执行用户输入的 MDX。线上编辑预览沿用编辑器的浏览器预览；它不被标记为完整 Astro/MDX 构建预览。

## 故障检查与恢复

- 页面能打开但 API 返回 503：检查 Site 是否绑定 D1、`GITHUB_TOKEN` 是否作为 Secret 配置。
- API 返回 403：检查可信身份是否存在，以及作者白名单是否与本人账号匹配。
- 提交冲突：刷新 GitHub 版本，检查冲突文件，再重新保存并提交；旧私人草稿仍保存在 D1。
- 发布失败：从后台打开对应的 GitHub Actions run，修复验证或部署问题后，重试同一 commit 的发布。不要手工触发另一 SHA。
- 若需要回滚，按现有 GitHub 分支保护规则回滚对应 commit，然后用该确定 SHA 重新触发 workflow；不要 force push。

私人草稿迁移时，应从 D1 导出 `studio_drafts` 中当前用户的 `raw`、`path`、`base_commit_sha` 和时间字段，再在停用 Site 前人工保存。停用或删除 Studio Site 不会删除 GitHub 已提交内容，也不会影响 Cloudflare Pages 正式博客。

## 凭证轮换

在 GitHub 创建同权限的短期 fine-grained token，先在 Sites 设置中替换 `GITHUB_TOKEN` 并验证读取与提交，再撤销旧 token。不要把新旧 Token 写入仓库或聊天记录。
