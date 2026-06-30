# AGENTS.md

## 样式改动约束

- 仅允许通过对应配置项、设计 token、模板结构或组件参数进行样式调整。
- 不允许通过新增或追加 CSS 覆盖规则强行压样式（包括但不限于 `!important`、高优先级选择器）。
- 若确认不存在可用配置项，必须先说明原因并获得确认，再进行 CSS 级改动。

## Cursor Cloud specific instructions

本项目是 Hugo 静态博客（Blowfish 主题），无后端服务，无 lint/test 套件，核心工作流是构建与本地预览。

- **主题是 git submodule**：`themes/blowfish` 来自 `.gitmodules`，必须先 `git submodule update --init --recursive` 才能构建（更新脚本已包含此步）。
- **需要 Hugo extended**：主题使用 SCSS，必须用 extended 版。CI（`.github/workflows/deploy.yml`）固定 `0.156.0`，本环境已安装同版本到 `/usr/local/bin/hugo`。
- **主题版本警告可忽略**：构建时出现 `Module "blowfish" is not compatible with this Hugo version` 仅为警告，站点能正常构建（CI 同样用 0.156.0）。
- **本地预览**：`hugo server -D`（`-D` 渲染草稿）。`hugo.toml` 的 `baseURL` 指向生产域名，本地建议加 `--baseURL http://localhost:1313/`，端口默认 1313。
- **构建产物**：`hugo --buildDrafts=false --minify` 输出到 `public/`（已被 `.gitignore` 忽略）。
- **内容位置**：文章在 `content/posts/`，新文章用 `hugo new content posts/<name>.md`，发布前将 front matter 的 `draft` 设为 `false`。
