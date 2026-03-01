# CLAUDE.md - Ethan Blog 项目指南

## 项目信息

- **博客框架**: Hugo (主题: Blowfish)
- **部署平台**: Cloudflare Pages
- **域名**: https://ethanchang.io
- **项目目录**: /Users/ethanchang/LLM/ethanblog

## 常用命令

```bash
# 本地预览
hugo server -D

# 构建生产版本
hugo --buildDrafts=false --minify

# 部署到 Cloudflare (手动)
npx wrangler pages deploy public --project-name=ethanblog
```

## GitHub Actions 部署

项目配置了 GitHub Actions (`.github/workflows/deploy.yml`)，推送到 main 分支自动部署到 Cloudflare Pages。

需要的环境变量 (Secrets):
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`

## 内容管理

- 文章目录: `content/posts/`
- 草稿目录: `content/drafts/`
- 静态资源: `static/`

## 重要文件

- `hugo.toml` - Hugo 配置
- `wrangler.toml` - Cloudflare Pages 配置
- `.github/workflows/deploy.yml` - CI/CD 配置

## 部署流程

1. 本地测试: `hugo server -D`
2. 提交代码: `git add . && git commit -m "..."`
3. 推送到 main: `git push`
4. GitHub Actions 自动部署
5. 或者手动: `npx wrangler pages deploy public --project-name=ethanblog`

## 搜索功能

由于用户使用 MiniMax M2.5 模型，WebSearch 工具不可用。当用户请求搜索时，使用 WebFetch 抓取 Bing 搜索结果：
- Bing: `https://www.bing.com/search?q=xxx` ✅ 可用
- Google: 被屏蔽 ❌
- DuckDuckGo: 验证码 ❌
