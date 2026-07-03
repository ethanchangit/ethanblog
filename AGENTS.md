# AGENTS.md

## 样式约束

- 颜色只能来自 `src/styles/global.css` 的 `@theme` 设计 token（surface / ink / primary / accent），组件与内容中不允许出现裸色值（hex/rgb 字面量）。canvas 绘制通过 `getComputedStyle` 读取 token（见 `src/lib/viz/registry.ts` 的做法）。
- 全站深色（`color-scheme: dark`），不要引入浅色模式相关样式。
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
- 提交前跑 `npm run check && npm run build && npm run test`。
