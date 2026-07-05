# AGENTS.md

> 创作规范（输入 → 媒介的转换方法）：[docs/MEDIUM.md](docs/MEDIUM.md)。本文件只管强制约束。

## 任务路由

用户消息**首行**的触发词决定任务类型。读到触发词后按对应模式执行，不要混用。

| 触发词 | 模式 | 必读 | 允许改动 |
|---|---|---|---|
| `/publish`、`发布：` | 媒介创作 | [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md)（可执行清单）+ [docs/MEDIUM.md](docs/MEDIUM.md)（创作宪法） | `src/content/stories/`、`src/content/projects/`、`src/data/threads.ts`（开线时） |
| `/infra`、`基建：` | 网站基建 | 本文 + [media/README.md](src/components/media/README.md) | `src/components/`、`src/lib/`、`src/pages/`、`plugins/` 等 |

**`/publish`（媒介创作）硬性约束**：

- **禁止**新建或修改媒介组件、布局、样式、API、测试基建；除非用户在同条消息写明 `allow-new-component: true`
- 新页面默认 `draft: true`；`kind: notebook` 必须指定 `thread` + `seq`
- 定稿档应填 `source` 溯源块（`validate:content` 会提醒）
- 完整操作细则见 [.claude/skills/publish/SKILL.md](.claude/skills/publish/SKILL.md) 与 [MEDIUM.md §0](docs/MEDIUM.md#0-触发约定)

**`/infra`（网站基建）硬性约束**：

- **禁止**创建或改写 story / project 正文，除非用户明确要求

**无前缀时的默认路由**：措辞像「写成 story / 记笔记 / 把对话发出来」→ 媒介创作；像「修组件 / 加 API / 部署挂了」→ 基建。歧义时先问一句。

## 样式约束

- 颜色只能来自 `src/styles/global.css` 的 `@theme` 设计 token（surface / ink / primary / accent），组件与内容中不允许出现裸色值（hex/rgb 字面量）。canvas 绘制通过 `getComputedStyle` 读取 token（见 `src/lib/viz/registry.ts` 的做法）。
- 双主题：白天为纯白画布（`surface-950` = 白），夜间为 `#191919`（`data-theme="dark"`）。默认跟随系统 `prefers-color-scheme`，用户可通过导航栏切换并持久化到 `localStorage`。背景保持极简平坦，让媒介内容承担视觉重心。
- 组件外框统一使用 `.media-frame` / `.media-caption`，不要各自发明卡片样式。

## 交互组件约束（媒介组件库契约的强制部分）

- Svelte 岛屿在 MDX/页面里必须显式写 `client:*` 指令；默认 `client:visible`，首屏才用 `client:load`；ScrollScene 必须 `client:visible={{ rootMargin: '150% 0px' }}`（避免注水膨胀导致布局跳动）。
- 跨岛屿边界的 props 必须 JSON 可序列化。
- 所有组件必须在无 JS 时渲染出有意义的静态内容（内容优先，交互是升档）。
- 动效必须尊重 `prefers-reduced-motion`（用 `@/lib/motion` 的 `reducedMotion()`）。
- GSAP 只能在岛屿内部（onMount/$effect）动态 import，禁止在 `.astro` frontmatter 引入；ScrollTrigger 必须在组件销毁时 kill。
- 完整契约见 `src/components/media/README.md`。

## 开发环境说明

- Node 22+，`npm install` 后即可 `npm run dev`（无 submodule、无额外工具链）。
- `npm run preview` 用静态服务器伺服 dist/（`@astrojs/cloudflare` adapter 不支持 `astro preview`）。
- 构建产物 `dist/`（已 gitignore）。
- 提交前跑验证四连 `npm run validate:content && npm run check && npm run build && npm run test`。
